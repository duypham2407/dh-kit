package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/duypham93/dh/packages/opencode-core/internal/app"
	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/internal/clibundle"
	"github.com/duypham93/dh/packages/opencode-core/internal/config"
	"github.com/duypham93/dh/packages/opencode-core/internal/db"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/format"
	"github.com/duypham93/dh/packages/opencode-core/internal/hooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/agent"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/models"
	"github.com/duypham93/dh/packages/opencode-core/internal/logging"
	"github.com/duypham93/dh/packages/opencode-core/internal/session"
	"github.com/duypham93/dh/packages/opencode-core/internal/tui"
	"github.com/duypham93/dh/packages/opencode-core/internal/version"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

// cliSubcommands are the commands handled by the embedded TypeScript CLI.
var cliSubcommands = map[string]bool{
	"ask":      true,
	"explain":  true,
	"trace":    true,
	"index":    true,
	"doctor":   true,
	"quick":    true,
	"delivery": true,
	"migrate":  true,
	"config":   true,
	"clean":    true,
}

var runNonInteractiveFn = runNonInteractive
var stderrIsTTYFn = stderrIsTTY
var selfUpdateFn = selfUpdate
var executablePathFn = os.Executable

var errUsage = errors.New("usage")

func sessionStateToHookMap(state types.DhSessionState) map[string]any {
	return map[string]any{
		"lane":                 state.Lane,
		"laneLocked":           state.LaneLocked,
		"currentStage":         state.CurrentStage,
		"semanticMode":         state.SemanticMode,
		"toolEnforcementLevel": state.ToolEnforcementLevel,
		"activeWorkItemIds":    state.ActiveWorkItemIDs,
	}
}

func envelopeFromIDs(sessionID, envelopeID string) types.ExecutionEnvelope {
	env := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
	if sessionID == "" {
		return env
	}
	if st, ok := session.GetDhSessionState(sessionID); ok {
		env.Lane = st.Lane
	}
	return env
}

func main() {
	defer logging.RecoverPanic("main", func() {
		logging.ErrorPersist("Application terminated due to unhandled panic")
	})

	if err := execute(os.Args[1:]); err != nil {
		if errors.Is(err, errUsage) {
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func execute(args []string) error {
	defer dhhooks.SetRegistry(nil)

	registry, cleanupHooks := buildHookRegistry()
	defer cleanupHooks()
	installDhHooks(registry)

	// Handle CLI flags
	if len(args) > 0 {
		switch args[0] {
		case "--version", "-v":
			fmt.Printf("dh %s\n", version.Version)
			return nil
		case "--help", "-h":
			printHelp()
			return nil
		case "update":
			versionArg := "latest"
			if len(args) > 1 {
				versionArg = args[1]
			}
			return selfUpdateFn(versionArg)
		case "--hooks":
			runHookDemo(registry)
			return nil
		case "--run":
			// Run upstream app in non-interactive mode
			if len(args) < 2 {
				fmt.Fprintf(os.Stderr, "Usage: dh --run <prompt>\n")
				return errUsage
			}
			prompt := args[1]
			if err := runNonInteractiveFn(prompt); err != nil {
				return err
			}
			return nil
		case "--run-smoke":
			if err := runNonInteractiveHookSmoke(); err != nil {
				return err
			}
			return nil
		}

		// Delegate known subcommands to embedded TS CLI
		if cliSubcommands[args[0]] {
			return delegateToCli(args)
		}
	}

	// Default: launch interactive TUI
	return runInteractive()
}

func buildHookRegistry() (hooks.Registry, func()) {
	registry := hooks.NewRegistry()
	cleanup := func() {}
	if repoRoot := os.Getenv("DH_PROJECT_ROOT"); repoRoot != "" {
		reader, err := bridge.NewSQLiteDecisionReader(repoRoot)
		if err == nil {
			registry = hooks.NewRegistryWithDecisionReader(reader)
			cleanup = func() { _ = reader.Close() }
		}
	}
	return registry, cleanup
}

func installDhHooks(registry hooks.Registry) {
	dhhooks.SetRegistry(&dhhooks.Registry{
		ModelOverride: func(agentID, role, lane string) (string, string, string, error) {
			return registry.ModelOverride(agentID, role, lane)
		},
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			envelope := envelopeFromIDs(sessionID, envelopeID)
			return registry.PreToolExec(envelope, toolName, toolArgs)
		},
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			envelope := envelopeFromIDs(sessionID, envelopeID)
			return registry.PreAnswer(envelope, intent, toolsUsed, evidenceScore)
		},
		SessionState: func(sessionID string) (map[string]any, error) {
			state, err := registry.SessionState(sessionID)
			if err != nil {
				return nil, err
			}
			return sessionStateToHookMap(state), nil
		},
		SkillActivation: func(sessionID, envelopeID, lane, role string) ([]string, error) {
			envelope := envelopeFromIDs(sessionID, envelopeID)
			if envelope.Lane == "" {
				envelope.Lane = lane
			}
			return registry.SkillActivation(envelope)
		},
		McpRouting: func(sessionID, envelopeID, intent string) ([]string, []string, error) {
			envelope := envelopeFromIDs(sessionID, envelopeID)
			return registry.McpRouting(envelope, intent)
		},
	})
}

func runInteractive() error {
	// Load config from current directory
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	_, err = config.Load(cwd, false)
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	// Connect DB
	conn, err := db.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect database: %w", err)
	}

	// Create main context
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	application, err := app.New(ctx, conn)
	if err != nil {
		return fmt.Errorf("failed to create app: %w", err)
	}
	defer application.Shutdown()

	// Init MCP tools in background
	go func() {
		defer logging.RecoverPanic("MCP-init", nil)
		agent.GetMcpTools(ctx, application.Permissions)
	}()

	// Launch TUI
	program := tea.NewProgram(
		tui.New(application),
		tea.WithAltScreen(),
	)

	if _, err := program.Run(); err != nil {
		return fmt.Errorf("TUI error: %w", err)
	}

	return nil
}

func printHelp() {
	fmt.Println("dh - AI software factory CLI")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  dh                         Launch interactive session")
	fmt.Println()
	fmt.Println("Inside the session, use slash commands:")
	fmt.Println("  /ask <question>            Ask about the codebase")
	fmt.Println("  /quick <task>              Run a quick task")
	fmt.Println("  /explain <symbol>          Explain a symbol")
	fmt.Println("  /trace <flow>              Trace a code flow")
	fmt.Println("  /clear                     Clear chat")
	fmt.Println("  /new                       New session")
	fmt.Println("  /help                      Show commands")
	fmt.Println("  /quit                      Exit")
	fmt.Println()
	fmt.Println("Or type a message directly to chat with the AI agent.")
	fmt.Println()
	fmt.Println("Standalone commands:")
	fmt.Println("  dh doctor [--json]         Check health")
	fmt.Println("  dh index                   Index the codebase")
	fmt.Println("  dh update [version]        Self-update from GitHub Releases")
	fmt.Println("  dh config --show           Show config")
	fmt.Println()
	fmt.Println("Flags:")
	fmt.Println("  dh --hooks                 Show hook status")
	fmt.Println("  dh --run <prompt>          Run a prompt non-interactively")
	fmt.Println("  dh --run-smoke             Run hook smoke test")
	fmt.Println("  dh --version               Show version")
	fmt.Println("  dh --help                  Show this help")
}

// delegateToCli extracts the embedded TS CLI bundle and runs it with Node.js,
// wiring stdin/stdout/stderr through to the current process.
func delegateToCli(args []string) error {
	if err := clibundle.Exec(args, os.Stdin, os.Stdout, os.Stderr); err != nil {
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			os.Exit(exitErr.ExitCode())
		}
		// Node not found: print friendly message
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		return err
	}
	return nil
}

func runNonInteractiveHookSmoke() error {
	providerID, modelID, variantID, err := dhhooks.OnModelOverride("quick-agent", "", "")
	if err != nil {
		return fmt.Errorf("model override hook failed: %w", err)
	}
	fmt.Printf("[smoke] model_override=%s/%s/%s\n", providerID, modelID, variantID)

	state, err := dhhooks.OnSessionCreate(context.Background(), "smoke-session")
	if err != nil {
		return fmt.Errorf("session state hook failed: %w", err)
	}
	if state != nil {
		if lane, ok := state["lane"].(string); ok {
			session.SetDhSessionStateFromHook("smoke-session", map[string]any{"lane": lane})
		}
	}

	skills, err := dhhooks.OnSkillActivation(context.Background(), "smoke-session", "smoke-envelope", "quick", "coder")
	if err != nil {
		return fmt.Errorf("skill activation hook failed: %w", err)
	}
	fmt.Printf("[smoke] skills=%v\n", skills)

	mcps, blocked, err := dhhooks.OnMcpRouting(context.Background(), "smoke-session", "smoke-envelope", "codebase")
	if err != nil {
		return fmt.Errorf("mcp routing hook failed: %w", err)
	}
	fmt.Printf("[smoke] mcps=%v blocked=%v\n", mcps, blocked)

	allowTool, toolReason, err := dhhooks.OnPreToolExec(context.Background(), "smoke-session", "smoke-envelope", "bash", map[string]any{"command": "ls"})
	if err != nil {
		return fmt.Errorf("pre-tool hook failed: %w", err)
	}
	fmt.Printf("[smoke] pre_tool allow=%t reason=%s\n", allowTool, toolReason)

	allowAnswer, answerAction, err := dhhooks.OnPreAnswer(context.Background(), "smoke-session", "smoke-envelope", "codebase", []string{"glob"}, 0.2)
	if err != nil {
		return fmt.Errorf("pre-answer hook failed: %w", err)
	}
	fmt.Printf("[smoke] pre_answer allow=%t action=%s\n", allowAnswer, answerAction)

	if modelID != "" {
		if _, ok := models.SupportedModels[models.ModelID(modelID)]; !ok {
			return fmt.Errorf("smoke model override points to unsupported model: %s", modelID)
		}
	}

	return nil
}

func runHookDemo(registry hooks.Registry) {
	state, _ := registry.SessionState("bootstrap")
	provider, model, variant, _ := registry.ModelOverride("quick-agent", "quick", state.Lane)
	envelope := types.ExecutionEnvelope{SessionID: "bootstrap", EnvelopeID: "bootstrap-env", Lane: state.Lane}
	toolsAllowed, toolReason, _ := registry.PreToolExec(envelope, "glob", map[string]any{})
	answerAllowed, answerAction, _ := registry.PreAnswer(envelope, "codebase", []string{"glob"}, 0.8)
	skills, _ := registry.SkillActivation(types.ExecutionEnvelope{Lane: state.Lane})
	mcps, _, _ := registry.McpRouting(types.ExecutionEnvelope{Lane: state.Lane}, "codebase")

	fmt.Println("dh opencode-core (upstream vendored)")
	fmt.Printf("lane=%s stage=%s\n", state.Lane, state.CurrentStage)
	fmt.Printf("model=%s/%s/%s\n", provider, model, variant)
	fmt.Printf("pre_tool_exec allow=%t reason=%s\n", toolsAllowed, toolReason)
	fmt.Printf("pre_answer allow=%t action=%s\n", answerAllowed, answerAction)
	fmt.Printf("skills=%v\n", skills)
	fmt.Printf("mcps=%v\n", mcps)
}

func runNonInteractive(prompt string) error {
	// Load config from current directory
	cwd, err := os.Getwd()
	if err != nil {
		return fmt.Errorf("failed to get working directory: %w", err)
	}

	_, err = config.Load(cwd, false)
	if err != nil {
		return fmt.Errorf("failed to load config: %w", err)
	}

	// Connect DB
	conn, err := db.Connect()
	if err != nil {
		return fmt.Errorf("failed to connect database: %w", err)
	}

	// Create app
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	application, err := app.New(ctx, conn)
	if err != nil {
		return fmt.Errorf("failed to create app: %w", err)
	}
	defer application.Shutdown()

	// Init MCP tools
	go func() {
		defer logging.RecoverPanic("MCP-init", nil)
		agent.GetMcpTools(ctx, application.Permissions)
	}()

	// Run non-interactive. Suppress spinner automatically when stderr is not a TTY
	// (e.g., CI, redirected output, staging automation) to avoid /dev/tty errors.
	return application.RunNonInteractive(ctx, prompt, format.Text.String(), shouldRunQuietMode())
}

func shouldRunQuietMode() bool {
	if v := strings.TrimSpace(os.Getenv("DH_RUN_QUIET")); strings.EqualFold(v, "1") || strings.EqualFold(v, "true") {
		return true
	}
	return !stderrIsTTYFn()
}

func stderrIsTTY() bool {
	stderrInfo, err := os.Stderr.Stat()
	if err != nil {
		return false
	}
	return (stderrInfo.Mode() & os.ModeCharDevice) != 0
}

func selfUpdate(versionArg string) error {
	execPath, err := executablePathFn()
	if err != nil {
		return fmt.Errorf("resolve current executable: %w", err)
	}

	platform, arch, err := currentReleaseTarget()
	if err != nil {
		return err
	}
	asset := fmt.Sprintf("dh-%s-%s", platform, arch)

	baseURL := strings.TrimSpace(os.Getenv("DH_SELF_UPDATE_BASE_URL"))
	if baseURL == "" {
		baseURL = "https://github.com/duypham2407/dh-kit/releases/latest/download"
		if versionArg != "" && versionArg != "latest" {
			baseURL = "https://github.com/duypham2407/dh-kit/releases/download/" + versionArg
		}
	}

	tmpDir, err := os.MkdirTemp("", "dh-self-update-")
	if err != nil {
		return fmt.Errorf("create temp dir: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	binaryPath := filepath.Join(tmpDir, asset)
	checksumsPath := filepath.Join(tmpDir, "SHA256SUMS")

	fmt.Printf("[dh] downloading %s (%s)\n", asset, versionArg)
	if err := downloadFile(baseURL+"/"+asset, binaryPath); err != nil {
		return fmt.Errorf("download binary: %w", err)
	}
	if err := downloadFile(baseURL+"/SHA256SUMS", checksumsPath); err != nil {
		return fmt.Errorf("download checksums: %w", err)
	}

	expected, err := checksumFromSHA256Sums(checksumsPath, asset)
	if err != nil {
		return err
	}
	actual, err := sha256File(binaryPath)
	if err != nil {
		return err
	}
	if actual != expected {
		return fmt.Errorf("checksum mismatch for %s: expected %s got %s", asset, expected, actual)
	}

	backupPath := execPath + ".backup." + fmt.Sprintf("%d", os.Getpid())
	if err := copyFile(execPath, backupPath, 0o755); err != nil {
		return fmt.Errorf("backup current binary: %w", err)
	}
	fmt.Printf("[dh] backed up existing binary to %s\n", backupPath)

	tempInstall := execPath + ".tmp"
	if err := copyFile(binaryPath, tempInstall, 0o755); err != nil {
		return fmt.Errorf("stage new binary: %w", err)
	}
	if err := os.Rename(tempInstall, execPath); err != nil {
		_ = os.Remove(tempInstall)
		return fmt.Errorf("replace current binary: %w", err)
	}
	fmt.Printf("[dh] installed to %s\n", execPath)

	cmd := exec.Command(execPath, "--version")
	out, err := cmd.CombinedOutput()
	if err != nil {
		_ = copyFile(backupPath, execPath, 0o755)
		return fmt.Errorf("verify updated binary: %w (%s)", err, strings.TrimSpace(string(out)))
	}

	verified := strings.TrimSpace(filterDiagnosticLines(string(out)))
	fmt.Printf("upgrade verified: %s\n", verified)
	fmt.Printf("[dh] upgraded to %s\n", execPath)
	return nil
}

func currentReleaseTarget() (string, string, error) {
	platform := runtime.GOOS
	arch := runtime.GOARCH
	if platform != "darwin" && platform != "linux" {
		return "", "", fmt.Errorf("unsupported platform: %s", platform)
	}
	switch arch {
	case "arm64":
	case "amd64":
	default:
		return "", "", fmt.Errorf("unsupported architecture: %s", arch)
	}
	return platform, arch, nil
}

func downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("GET %s failed: %s %s", url, resp.Status, strings.TrimSpace(string(body)))
	}
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	return os.WriteFile(dest, data, 0o644)
}

func checksumFromSHA256Sums(path, asset string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open SHA256SUMS: %w", err)
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasSuffix(line, "  "+asset) {
			continue
		}
		parts := strings.Fields(line)
		if len(parts) > 0 {
			return parts[0], nil
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("read SHA256SUMS: %w", err)
	}
	return "", fmt.Errorf("checksum for %s not found", asset)
}

func sha256File(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read file for checksum: %w", err)
	}
	sum := sha256.Sum256(data)
	return fmt.Sprintf("%x", sum), nil
}

func copyFile(src, dest string, mode os.FileMode) error {
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dest, data, mode)
}

func filterDiagnosticLines(output string) string {
	lines := strings.Split(output, "\n")
	filtered := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "WARN ") || strings.Contains(trimmed, " WARN ") {
			continue
		}
		filtered = append(filtered, trimmed)
	}
	if len(filtered) == 0 {
		return strings.TrimSpace(output)
	}
	return strings.Join(filtered, "\n")
}
