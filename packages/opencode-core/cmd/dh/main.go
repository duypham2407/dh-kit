package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/duypham93/dh/packages/opencode-core/internal/app"
	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/internal/config"
	"github.com/duypham93/dh/packages/opencode-core/internal/db"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/format"
	"github.com/duypham93/dh/packages/opencode-core/internal/hooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/models"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/agent"
	"github.com/duypham93/dh/packages/opencode-core/internal/logging"
	"github.com/duypham93/dh/packages/opencode-core/internal/session"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

var runNonInteractiveFn = runNonInteractive
var stderrIsTTYFn = stderrIsTTY

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
			fmt.Println("dh dev")
			return nil
		case "--help", "-h":
			printHelp()
			return nil
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
	}

	// Default: show hook demo (same as previous behavior)
	runHookDemo(registry)
	return nil
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

func printHelp() {
	fmt.Println("dh - AI software factory CLI")
	fmt.Println()
	fmt.Println("Usage:")
	fmt.Println("  dh                    Show hook status")
	fmt.Println("  dh --hooks            Show hook status (same as default)")
	fmt.Println("  dh --run <prompt>     Run a prompt in non-interactive mode")
	fmt.Println("  dh --run-smoke        Run hook smoke without provider")
	fmt.Println("  dh --version          Show version")
	fmt.Println("  dh --help             Show this help")
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
