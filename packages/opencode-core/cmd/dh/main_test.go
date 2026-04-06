package main

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/session"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

func TestSessionStateToHookMapIncludesAllFields(t *testing.T) {
	state := types.DhSessionState{
		SessionID:            "sess-1",
		Lane:                 "delivery",
		LaneLocked:           true,
		CurrentStage:         "delivery_coding",
		SemanticMode:         "always",
		ToolEnforcementLevel: "very-hard",
		ActiveWorkItemIDs:    []string{"W-1", "W-2"},
	}

	got := sessionStateToHookMap(state)

	if got["lane"] != "delivery" {
		t.Fatalf("expected lane=delivery, got %#v", got["lane"])
	}
	if got["laneLocked"] != true {
		t.Fatalf("expected laneLocked=true, got %#v", got["laneLocked"])
	}
	if got["currentStage"] != "delivery_coding" {
		t.Fatalf("expected currentStage=delivery_coding, got %#v", got["currentStage"])
	}
	if got["semanticMode"] != "always" {
		t.Fatalf("expected semanticMode=always, got %#v", got["semanticMode"])
	}
	if got["toolEnforcementLevel"] != "very-hard" {
		t.Fatalf("expected toolEnforcementLevel=very-hard, got %#v", got["toolEnforcementLevel"])
	}

	ids, ok := got["activeWorkItemIds"].([]string)
	if !ok {
		t.Fatalf("expected []string activeWorkItemIds, got %T", got["activeWorkItemIds"])
	}
	if !reflect.DeepEqual(ids, []string{"W-1", "W-2"}) {
		t.Fatalf("unexpected activeWorkItemIds: %#v", ids)
	}

	if _, exists := got["sessionID"]; exists {
		t.Fatalf("sessionID should not be exported to hook map, got %#v", got["sessionID"])
	}
}

func TestEnvelopeFromIDsUsesSessionLaneWhenAvailable(t *testing.T) {
	session.DeleteDhSessionState("sess-1")
	t.Cleanup(func() { session.DeleteDhSessionState("sess-1") })

	session.SetDhSessionStateFromHook("sess-1", map[string]any{"lane": "delivery"})
	env := envelopeFromIDs("sess-1", "env-1")
	if env.SessionID != "sess-1" || env.EnvelopeID != "env-1" {
		t.Fatalf("unexpected ids: %#v", env)
	}
	if env.Lane != "delivery" {
		t.Fatalf("expected lane from injected state, got %s", env.Lane)
	}
}

func TestEnvelopeFromIDsWithoutStateLeavesLaneEmpty(t *testing.T) {
	session.DeleteDhSessionState("sess-miss")
	env := envelopeFromIDs("sess-miss", "env-1")
	if env.SessionID != "sess-miss" || env.EnvelopeID != "env-1" {
		t.Fatalf("unexpected ids: %#v", env)
	}
	if env.Lane != "" {
		t.Fatalf("expected empty lane without state, got %s", env.Lane)
	}
}

func TestExecuteRunWithoutPromptReturnsUsage(t *testing.T) {
	err := execute([]string{"--run"})
	if !errors.Is(err, errUsage) {
		t.Fatalf("expected errUsage, got %v", err)
	}
}

func TestExecuteUpdateUsesSelfUpdateFn(t *testing.T) {
	oldUpdate := selfUpdateFn
	called := false
	var gotVersion string
	selfUpdateFn = func(version string) error {
		called = true
		gotVersion = version
		return nil
	}
	t.Cleanup(func() { selfUpdateFn = oldUpdate })

	if err := execute([]string{"update", "v9.9.9"}); err != nil {
		t.Fatalf("execute update failed: %v", err)
	}
	if !called {
		t.Fatal("expected selfUpdateFn to be called")
	}
	if gotVersion != "v9.9.9" {
		t.Fatalf("expected version v9.9.9, got %s", gotVersion)
	}
}

func TestExecuteUpdateDefaultsToLatest(t *testing.T) {
	oldUpdate := selfUpdateFn
	called := false
	selfUpdateFn = func(version string) error {
		called = true
		if version != "latest" {
			t.Fatalf("expected latest, got %s", version)
		}
		return nil
	}
	t.Cleanup(func() { selfUpdateFn = oldUpdate })

	if err := execute([]string{"update"}); err != nil {
		t.Fatalf("execute update failed: %v", err)
	}
	if !called {
		t.Fatal("expected selfUpdateFn to be called")
	}
	if dhhooks.GetRegistry() != nil {
		t.Fatal("expected registry cleanup after execute")
	}
}

func TestCurrentReleaseTarget(t *testing.T) {
	platform, arch, err := currentReleaseTarget()
	if err != nil {
		t.Fatalf("currentReleaseTarget returned error on supported dev machine: %v", err)
	}
	if platform == "" || arch == "" {
		t.Fatalf("expected non-empty platform/arch, got %q/%q", platform, arch)
	}
}

func TestChecksumFromSHA256Sums(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "SHA256SUMS")
	content := "abc123  dh-darwin-arm64\ndef456  dh-linux-amd64\n"
	if err := os.WriteFile(tmp, []byte(content), 0o644); err != nil {
		t.Fatalf("write checksum file: %v", err)
	}

	got, err := checksumFromSHA256Sums(tmp, "dh-linux-amd64")
	if err != nil {
		t.Fatalf("checksumFromSHA256Sums failed: %v", err)
	}
	if got != "def456" {
		t.Fatalf("expected def456, got %s", got)
	}
}

func TestChecksumFromSHA256SumsMissingAsset(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "SHA256SUMS")
	if err := os.WriteFile(tmp, []byte("abc123  dh-darwin-arm64\n"), 0o644); err != nil {
		t.Fatalf("write checksum file: %v", err)
	}

	_, err := checksumFromSHA256Sums(tmp, "dh-linux-amd64")
	if err == nil {
		t.Fatal("expected error for missing asset")
	}
}

func TestSHA256File(t *testing.T) {
	tmp := filepath.Join(t.TempDir(), "file.bin")
	if err := os.WriteFile(tmp, []byte("hello"), 0o644); err != nil {
		t.Fatalf("write file: %v", err)
	}

	got, err := sha256File(tmp)
	if err != nil {
		t.Fatalf("sha256File failed: %v", err)
	}
	expected := "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	if got != expected {
		t.Fatalf("expected %s, got %s", expected, got)
	}
}

func TestCopyFile(t *testing.T) {
	dir := t.TempDir()
	src := filepath.Join(dir, "src.txt")
	dst := filepath.Join(dir, "dst.txt")
	if err := os.WriteFile(src, []byte("copy me"), 0o644); err != nil {
		t.Fatalf("write src: %v", err)
	}

	if err := copyFile(src, dst, 0o755); err != nil {
		t.Fatalf("copyFile failed: %v", err)
	}
	data, err := os.ReadFile(dst)
	if err != nil {
		t.Fatalf("read dst: %v", err)
	}
	if string(data) != "copy me" {
		t.Fatalf("unexpected dst contents: %s", string(data))
	}
	info, err := os.Stat(dst)
	if err != nil {
		t.Fatalf("stat dst: %v", err)
	}
	if info.Mode().Perm() != 0o755 {
		t.Fatalf("expected mode 755, got %o", info.Mode().Perm())
	}
}

func TestFilterDiagnosticLines(t *testing.T) {
	input := "2026/04/06 21:53:20 WARN FZF not found\ndh 0.1.8\n"
	got := filterDiagnosticLines(input)
	if got != "dh 0.1.8" {
		t.Fatalf("expected filtered version output, got %q", got)
	}
}

func TestPrintHelpIncludesUpdate(t *testing.T) {
	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	t.Cleanup(func() { os.Stdout = oldStdout })

	printHelp()
	if err := w.Close(); err != nil {
		t.Fatalf("close write pipe: %v", err)
	}
	outBytes, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	out := string(outBytes)
	if !strings.Contains(out, "dh update [version]") {
		t.Fatalf("expected help to include update command, got: %s", out)
	}
}

func TestDownloadFileRejectsBadStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "nope", http.StatusNotFound)
	}))
	defer server.Close()

	err := downloadFile(server.URL, filepath.Join(t.TempDir(), "out.bin"))
	if err == nil {
		t.Fatal("expected error for non-200 response")
	}
	if !strings.Contains(err.Error(), "404") {
		t.Fatalf("expected 404 in error, got %v", err)
	}
}

func TestSelfUpdateEndToEndWithLocalServer(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("unsupported platform for release target test")
	}

	platform, arch, err := currentReleaseTarget()
	if err != nil {
		t.Fatalf("currentReleaseTarget: %v", err)
	}
	asset := fmt.Sprintf("dh-%s-%s", platform, arch)
	binDir := t.TempDir()
	execPath := filepath.Join(binDir, "dh")
	initialScript := []byte("#!/bin/sh\necho dh old-build\n")
	if err := os.WriteFile(execPath, initialScript, 0o755); err != nil {
		t.Fatalf("write initial executable: %v", err)
	}

	newScript := []byte("#!/bin/sh\nif [ \"$1\" = \"--version\" ]; then\n  echo dh test-build\nelse\n  echo updated\nfi\n")
	sumFile, err := func() (string, error) {
		tmp := filepath.Join(t.TempDir(), asset)
		if err := os.WriteFile(tmp, newScript, 0o755); err != nil {
			return "", err
		}
		return sha256File(tmp)
	}()
	if err != nil {
		t.Fatalf("prepare checksum: %v", err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/releases/download/v-test/" + asset:
			_, _ = w.Write(newScript)
		case "/releases/download/v-test/SHA256SUMS":
			_, _ = w.Write([]byte(fmt.Sprintf("%s  %s\n", sumFile, asset)))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	oldExecutableEnv := os.Getenv("DH_SELF_UPDATE_BASE_URL")
	_ = os.Setenv("DH_SELF_UPDATE_BASE_URL", server.URL+"/releases/download/v-test")
	t.Cleanup(func() { _ = os.Setenv("DH_SELF_UPDATE_BASE_URL", oldExecutableEnv) })

	oldExecPath := executablePathFn
	executablePathFn = func() (string, error) { return execPath, nil }
	t.Cleanup(func() { executablePathFn = oldExecPath })

	if err := selfUpdate("v-test"); err != nil {
		t.Fatalf("selfUpdate failed: %v", err)
	}

	data, err := os.ReadFile(execPath)
	if err != nil {
		t.Fatalf("read updated executable: %v", err)
	}
	if string(data) != string(newScript) {
		t.Fatalf("executable was not replaced")
	}
	if _, err := os.Stat(execPath + ".backup." + fmt.Sprintf("%d", os.Getpid())); err != nil {
		t.Fatalf("expected backup file to exist: %v", err)
	}
	if !bytes.Contains(data, []byte("dh test-build")) {
		t.Fatalf("updated executable content missing expected version text")
	}
}

func TestShouldRunQuietModeUsesEnvOverride(t *testing.T) {
	old := os.Getenv("DH_RUN_QUIET")
	if err := os.Setenv("DH_RUN_QUIET", "true"); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_RUN_QUIET", old)
	})

	oldTTY := stderrIsTTYFn
	stderrIsTTYFn = func() bool { return true }
	t.Cleanup(func() { stderrIsTTYFn = oldTTY })

	if !shouldRunQuietMode() {
		t.Fatal("expected quiet mode when DH_RUN_QUIET=true")
	}
}

func TestShouldRunQuietModeDisablesSpinnerWhenNoTTY(t *testing.T) {
	old := os.Getenv("DH_RUN_QUIET")
	if err := os.Setenv("DH_RUN_QUIET", ""); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_RUN_QUIET", old)
	})

	oldTTY := stderrIsTTYFn
	stderrIsTTYFn = func() bool { return false }
	t.Cleanup(func() { stderrIsTTYFn = oldTTY })

	if !shouldRunQuietMode() {
		t.Fatal("expected quiet mode when stderr is not a TTY")
	}
}

func TestShouldRunQuietModeKeepsSpinnerWhenTTY(t *testing.T) {
	old := os.Getenv("DH_RUN_QUIET")
	if err := os.Setenv("DH_RUN_QUIET", ""); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_RUN_QUIET", old)
	})

	oldTTY := stderrIsTTYFn
	stderrIsTTYFn = func() bool { return true }
	t.Cleanup(func() { stderrIsTTYFn = oldTTY })

	if shouldRunQuietMode() {
		t.Fatal("expected non-quiet mode when stderr is TTY and no override")
	}
}

func TestExecuteRunPathUsesBridgeDecisions(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, bridge.DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE hook_invocation_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL,
			input_json TEXT NOT NULL,
			output_json TEXT NOT NULL,
			decision TEXT NOT NULL,
			reason TEXT NOT NULL,
			duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO hook_invocation_logs (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES ('1', 'sess-run', 'env-run', 'pre_tool_exec', '{}', '{}', 'block', 'blocked-on-run-path', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	oldProjectRoot := os.Getenv("DH_PROJECT_ROOT")
	if err := os.Setenv("DH_PROJECT_ROOT", repoRoot); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_PROJECT_ROOT", oldProjectRoot)
	})

	oldRun := runNonInteractiveFn
	runCalled := false
	runNonInteractiveFn = func(prompt string) error {
		runCalled = true
		if prompt != "hello" {
			t.Fatalf("unexpected prompt: %s", prompt)
		}
		allow, reason, err := dhhooks.OnPreToolExec(context.Background(), "sess-run", "env-run", "bash", map[string]any{"command": "ls"})
		if err != nil {
			return err
		}
		if allow {
			t.Fatalf("expected bridge-enforced block in run path")
		}
		if reason != "blocked-on-run-path" {
			t.Fatalf("unexpected block reason: %s", reason)
		}
		return nil
	}
	t.Cleanup(func() { runNonInteractiveFn = oldRun })

	if err := execute([]string{"--run", "hello"}); err != nil {
		t.Fatalf("execute failed: %v", err)
	}
	if !runCalled {
		t.Fatal("expected runNonInteractiveFn to be called")
	}
	if dhhooks.GetRegistry() != nil {
		t.Fatal("expected registry cleanup after execute")
	}
}

func TestExecuteRunSmokeUsesBridgeDecisions(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, bridge.DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE hook_invocation_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL,
			input_json TEXT NOT NULL,
			output_json TEXT NOT NULL,
			decision TEXT NOT NULL,
			reason TEXT NOT NULL,
			duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO hook_invocation_logs (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES
		('1', 'bootstrap', 'quick-agent', 'model_override', '{}', '{"provider_id":"openai","model_id":"gpt-4.1","variant_id":"default"}', 'modify', 'model', 1, '2026-04-05T10:00:00Z'),
		('2', 'smoke-session', 'smoke-envelope', 'pre_tool_exec', '{}', '{}', 'block', 'blocked-smoke', 1, '2026-04-05T10:00:01Z'),
		('3', 'smoke-session', 'smoke-envelope', 'pre_answer', '{}', '{}', 'block', 'degrade:insufficient-evidence', 1, '2026-04-05T10:00:02Z'),
		('4', 'smoke-session', 'smoke-session', 'session_state', '{}', '{"lane":"delivery","current_stage":"delivery_review"}', 'modify', 'state', 1, '2026-04-05T10:00:03Z'),
		('5', 'smoke-session', 'smoke-envelope', 'skill_activation', '{}', '{"active_skills":["verification-before-completion"]}', 'modify', 'skills', 1, '2026-04-05T10:00:04Z'),
		('6', 'smoke-session', 'smoke-envelope', 'mcp_routing', '{}', '{"active_mcps":["context7"]}', 'modify', 'mcps', 1, '2026-04-05T10:00:05Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	oldProjectRoot := os.Getenv("DH_PROJECT_ROOT")
	if err := os.Setenv("DH_PROJECT_ROOT", repoRoot); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_PROJECT_ROOT", oldProjectRoot)
	})

	oldStdout := os.Stdout
	r, w, err := os.Pipe()
	if err != nil {
		t.Fatalf("pipe: %v", err)
	}
	os.Stdout = w
	t.Cleanup(func() { os.Stdout = oldStdout })

	if err := execute([]string{"--run-smoke"}); err != nil {
		t.Fatalf("execute run-smoke failed: %v", err)
	}

	if err := w.Close(); err != nil {
		t.Fatalf("close write pipe: %v", err)
	}

	outBytes, err := io.ReadAll(r)
	if err != nil {
		t.Fatalf("read stdout: %v", err)
	}
	out := string(outBytes)
	if !strings.Contains(out, "[smoke] model_override=openai/gpt-4.1/default") {
		t.Fatalf("missing model override output: %s", out)
	}
	if !strings.Contains(out, "[smoke] pre_tool allow=false reason=blocked-smoke") {
		t.Fatalf("missing pre-tool output: %s", out)
	}
	if !strings.Contains(out, "[smoke] pre_answer allow=false action=degrade:insufficient-evidence") {
		t.Fatalf("missing pre-answer output: %s", out)
	}
	if !strings.Contains(out, "[smoke] skills=[verification-before-completion]") {
		t.Fatalf("missing skills output: %s", out)
	}
	if !strings.Contains(out, "[smoke] mcps=[context7] blocked=[]") {
		t.Fatalf("missing mcp output: %s", out)
	}
}

func TestExecuteRunPathUsesBridgePreAnswerDecision(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, bridge.DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE hook_invocation_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL,
			input_json TEXT NOT NULL,
			output_json TEXT NOT NULL,
			decision TEXT NOT NULL,
			reason TEXT NOT NULL,
			duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO hook_invocation_logs (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES ('1', 'sess-run', 'env-run', 'pre_answer', '{}', '{}', 'block', 'degrade:insufficient-evidence', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	oldProjectRoot := os.Getenv("DH_PROJECT_ROOT")
	if err := os.Setenv("DH_PROJECT_ROOT", repoRoot); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_PROJECT_ROOT", oldProjectRoot)
	})

	oldRun := runNonInteractiveFn
	runCalled := false
	runNonInteractiveFn = func(prompt string) error {
		runCalled = true
		if prompt != "hello" {
			t.Fatalf("unexpected prompt: %s", prompt)
		}
		allow, action, err := dhhooks.OnPreAnswer(context.Background(), "sess-run", "env-run", "codebase", []string{"glob"}, 0.3)
		if err != nil {
			return err
		}
		if allow {
			t.Fatalf("expected bridge-enforced pre-answer block")
		}
		if action != "degrade:insufficient-evidence" {
			t.Fatalf("unexpected action: %s", action)
		}
		return nil
	}
	t.Cleanup(func() { runNonInteractiveFn = oldRun })

	if err := execute([]string{"--run", "hello"}); err != nil {
		t.Fatalf("execute failed: %v", err)
	}
	if !runCalled {
		t.Fatal("expected runNonInteractiveFn to be called")
	}
	if dhhooks.GetRegistry() != nil {
		t.Fatal("expected registry cleanup after execute")
	}
}

func TestExecuteRunPathExposesAllBridgeHookDecisions(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, bridge.DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("open sqlite: %v", err)
	}
	t.Cleanup(func() { _ = db.Close() })

	if _, err := db.Exec(`
		CREATE TABLE hook_invocation_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL,
			input_json TEXT NOT NULL,
			output_json TEXT NOT NULL,
			decision TEXT NOT NULL,
			reason TEXT NOT NULL,
			duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	if _, err := db.Exec(`
		INSERT INTO hook_invocation_logs (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES
		('1', 'bootstrap', 'quick-agent', 'model_override', '{}', '{"provider_id":"openai","model_id":"gpt-4.1","variant_id":"default"}', 'modify', 'model override', 1, '2026-04-05T10:00:00Z'),
		('2', 'sess-run', 'env-run', 'pre_tool_exec', '{}', '{}', 'block', 'blocked-by-policy', 1, '2026-04-05T10:00:01Z'),
		('3', 'sess-run', 'env-run', 'pre_answer', '{}', '{}', 'block', 'degrade:insufficient-evidence', 1, '2026-04-05T10:00:02Z'),
		('4', 'sess-run', 'sess-run', 'session_state', '{}', '{"lane":"migration","lane_locked":true,"current_stage":"migration_strategy","semantic_mode":"strict","tool_enforcement_level":"very-hard","active_work_item_ids":["W-7"]}', 'modify', 'state', 1, '2026-04-05T10:00:03Z'),
		('5', 'sess-run', 'env-run', 'skill_activation', '{}', '{"active_skills":["using-skills"]}', 'modify', 'skills', 1, '2026-04-05T10:00:04Z'),
		('6', 'sess-run', 'env-run', 'mcp_routing', '{}', '{"active_mcps":["context7"]}', 'modify', 'mcps', 1, '2026-04-05T10:00:05Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	oldProjectRoot := os.Getenv("DH_PROJECT_ROOT")
	if err := os.Setenv("DH_PROJECT_ROOT", repoRoot); err != nil {
		t.Fatalf("set env: %v", err)
	}
	t.Cleanup(func() {
		_ = os.Setenv("DH_PROJECT_ROOT", oldProjectRoot)
	})

	oldRun := runNonInteractiveFn
	runCalled := false
	runNonInteractiveFn = func(prompt string) error {
		runCalled = true
		if prompt != "hello" {
			t.Fatalf("unexpected prompt: %s", prompt)
		}

		providerID, modelID, variantID, err := dhhooks.OnModelOverride("quick-agent", "", "")
		if err != nil {
			return err
		}
		if providerID != "openai" || modelID != "gpt-4.1" || variantID != "default" {
			t.Fatalf("unexpected model override: %s/%s/%s", providerID, modelID, variantID)
		}

		allowTool, toolReason, err := dhhooks.OnPreToolExec(context.Background(), "sess-run", "env-run", "bash", map[string]any{"command": "ls"})
		if err != nil {
			return err
		}
		if allowTool || toolReason != "blocked-by-policy" {
			t.Fatalf("unexpected pre-tool decision allow=%t reason=%s", allowTool, toolReason)
		}

		allowAnswer, action, err := dhhooks.OnPreAnswer(context.Background(), "sess-run", "env-run", "codebase", []string{"glob"}, 0.2)
		if err != nil {
			return err
		}
		if allowAnswer || action != "degrade:insufficient-evidence" {
			t.Fatalf("unexpected pre-answer decision allow=%t action=%s", allowAnswer, action)
		}

		stateMap, err := dhhooks.OnSessionCreate(context.Background(), "sess-run")
		if err != nil {
			return err
		}
		if stateMap == nil {
			t.Fatal("expected session-state map")
		}
		if stateMap["lane"] != "migration" || stateMap["currentStage"] != "migration_strategy" {
			t.Fatalf("unexpected session state map: %#v", stateMap)
		}

		skills, err := dhhooks.OnSkillActivation(context.Background(), "sess-run", "env-run", "quick", "coder")
		if err != nil {
			return err
		}
		if len(skills) != 1 || skills[0] != "using-skills" {
			t.Fatalf("unexpected skills: %#v", skills)
		}

		mcps, blocked, err := dhhooks.OnMcpRouting(context.Background(), "sess-run", "env-run", "codebase")
		if err != nil {
			return err
		}
		if len(mcps) != 1 || mcps[0] != "context7" {
			t.Fatalf("unexpected mcps: %#v", mcps)
		}
		if len(blocked) != 0 {
			t.Fatalf("expected no blocked mcps, got %#v", blocked)
		}

		return nil
	}
	t.Cleanup(func() { runNonInteractiveFn = oldRun })

	if err := execute([]string{"--run", "hello"}); err != nil {
		t.Fatalf("execute failed: %v", err)
	}
	if !runCalled {
		t.Fatal("expected runNonInteractiveFn to be called")
	}
	if dhhooks.GetRegistry() != nil {
		t.Fatal("expected registry cleanup after execute")
	}
}
