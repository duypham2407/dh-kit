package agent

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
	"github.com/duypham93/dh/packages/opencode-core/internal/hooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

func TestPreToolBridgeIntegrationAllowFromDB(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreToolReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreToolExec(envelope, toolName, toolArgs)
		},
	})

	allow, reason, err := evaluatePreToolPolicy(context.Background(), "sess-1", "env-allow", message.ToolCall{Name: "glob", Input: `{"pattern":"*.go"}`})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allow {
		t.Fatalf("expected allow=true, reason=%s", reason)
	}
}

func TestPreToolBridgeIntegrationBlockFromDB(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreToolReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreToolExec(envelope, toolName, toolArgs)
		},
	})

	allow, reason, err := evaluatePreToolPolicy(context.Background(), "sess-1", "env-block", message.ToolCall{Name: "bash", Input: `{"command":"rm -rf /"}`})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allow {
		t.Fatalf("expected allow=false, reason=%s", reason)
	}
	if reason != "blocked destructive command" {
		t.Fatalf("unexpected reason: %s", reason)
	}
}

func TestPreToolBridgeIntegrationFallsBackToSessionScope(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	reader := newPreToolReader(t)
	defer reader.Close()

	registry := hooks.NewRegistryWithDecisionReader(reader)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			envelope := types.ExecutionEnvelope{SessionID: sessionID, EnvelopeID: envelopeID}
			return registry.PreToolExec(envelope, toolName, toolArgs)
		},
	})

	allow, reason, err := evaluatePreToolPolicy(context.Background(), "sess-1", "env-missing", message.ToolCall{Name: "bash", Input: `{"command":"rm -rf /"}`})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allow {
		t.Fatalf("expected fallback block, reason=%s", reason)
	}
	if reason != "session fallback block" {
		t.Fatalf("unexpected fallback reason: %s", reason)
	}
}

func newPreToolReader(t *testing.T) bridge.DecisionReader {
	t.Helper()

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
		('1', 'sess-1', 'env-allow', 'pre_tool_exec', '{}', '{}', 'allow', 'allowed', 1, '2026-04-05T10:00:00Z'),
		('2', 'sess-1', 'env-block', 'pre_tool_exec', '{}', '{}', 'block', 'blocked destructive command', 1, '2026-04-05T10:01:00Z'),
		('3', 'sess-1', 'sess-1',   'pre_tool_exec', '{}', '{}', 'block', 'session fallback block', 1, '2026-04-05T10:02:00Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	reader, err := bridge.NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	return reader
}
