package main

import (
	"context"
	"database/sql"
	"errors"
	"io"
	"os"
	"path/filepath"
	"reflect"
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
