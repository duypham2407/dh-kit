package main

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
)

func TestBuildHookRegistryAndInstallDhHooksBridgeDispatch(t *testing.T) {
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
		('1', 'sess-1', 'env-1', 'pre_tool_exec', '{}', '{}', 'block', 'blocked-by-ts', 1, '2026-04-05T10:00:00Z'),
		('2', 'sess-1', 'env-1', 'pre_answer', '{}', '{}', 'block', 'degrade:insufficient-evidence', 1, '2026-04-05T10:00:01Z');
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

	registry, cleanup := buildHookRegistry()
	t.Cleanup(cleanup)

	installDhHooks(registry)
	t.Cleanup(func() { dhhooks.SetRegistry(nil) })

	allowTool, toolReason, err := dhhooks.OnPreToolExec(context.Background(), "sess-1", "env-1", "bash", map[string]any{"command": "ls"})
	if err != nil {
		t.Fatalf("pre-tool dispatch error: %v", err)
	}
	if allowTool {
		t.Fatal("expected tool blocked by bridge decision")
	}
	if toolReason != "blocked-by-ts" {
		t.Fatalf("unexpected tool block reason: %s", toolReason)
	}

	allowAnswer, action, err := dhhooks.OnPreAnswer(context.Background(), "sess-1", "env-1", "codebase", []string{"glob"}, 0.2)
	if err != nil {
		t.Fatalf("pre-answer dispatch error: %v", err)
	}
	if allowAnswer {
		t.Fatal("expected answer blocked by bridge decision")
	}
	if action != "degrade:insufficient-evidence" {
		t.Fatalf("unexpected pre-answer action: %s", action)
	}
}
