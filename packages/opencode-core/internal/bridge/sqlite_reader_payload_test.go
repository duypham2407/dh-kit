package bridge

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

func TestSQLiteDecisionReaderLatestSessionStateDecodesOutputJSON(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, DBPathTemplate)
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
		VALUES (
			'1', 'sess-1', 'sess-1', 'session_state', '{}',
			'{"lane":"delivery","laneLocked":true,"currentStage":"delivery_analysis","semanticMode":"auto","toolEnforcementLevel":"very-hard","activeWorkItemIds":["w1","w2"]}',
			'modify', 'ok', 1, '2026-04-05T10:00:00Z'
		);
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	state, err := reader.LatestSessionState("sess-1")
	if err != nil {
		t.Fatalf("latest session state: %v", err)
	}
	if state == nil {
		t.Fatal("expected state, got nil")
	}
	if state.Lane != "delivery" || state.CurrentStage != "delivery_analysis" || state.SemanticMode != "auto" {
		t.Fatalf("unexpected decoded state: %#v", state)
	}
	if len(state.ActiveWorkItemIDs) != 2 || state.ActiveWorkItemIDs[0] != "w1" {
		t.Fatalf("unexpected active work item ids: %#v", state.ActiveWorkItemIDs)
	}
}

func TestSQLiteDecisionReaderLatestResolvedModelDecodesOutputJSON(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, DBPathTemplate)
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
		VALUES (
			'1', 'bootstrap', 'quick-agent', 'model_override', '{}',
			'{"providerId":"anthropic","modelId":"claude-opus","variantId":"high-reasoning"}',
			'modify', 'ok', 1, '2026-04-05T10:00:00Z'
		);
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	providerID, modelID, variantID, ok, err := reader.LatestResolvedModel("bootstrap", "quick-agent")
	if err != nil {
		t.Fatalf("latest resolved model: %v", err)
	}
	if !ok {
		t.Fatal("expected resolved model, got not found")
	}
	if providerID != "anthropic" || modelID != "claude-opus" || variantID != "high-reasoning" {
		t.Fatalf("unexpected resolved model: %s/%s/%s", providerID, modelID, variantID)
	}
}

func TestSQLiteDecisionReaderLatestSessionStateDecodesSnakeCaseOutputJSON(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, DBPathTemplate)
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
		VALUES (
			'1', 'sess-1', 'sess-1', 'session_state', '{}',
			'{"lane":"migration","lane_locked":true,"current_stage":"migration_strategy","semantic_mode":"strict","tool_enforcement_level":"very-hard","active_work_item_ids":["m1","m2"]}',
			'modify', 'ok', 1, '2026-04-05T10:00:00Z'
		);
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	state, err := reader.LatestSessionState("sess-1")
	if err != nil {
		t.Fatalf("latest session state: %v", err)
	}
	if state == nil {
		t.Fatal("expected state, got nil")
	}
	if state.Lane != "migration" || state.CurrentStage != "migration_strategy" || state.SemanticMode != "strict" {
		t.Fatalf("unexpected decoded state: %#v", state)
	}
	if len(state.ActiveWorkItemIDs) != 2 || state.ActiveWorkItemIDs[0] != "m1" {
		t.Fatalf("unexpected active work item ids: %#v", state.ActiveWorkItemIDs)
	}
}

func TestSQLiteDecisionReaderLatestResolvedModelDecodesSnakeCaseOutputJSON(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}
	dbPath := filepath.Join(repoRoot, DBPathTemplate)
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
		VALUES (
			'1', 'bootstrap', 'quick-agent', 'model_override', '{}',
			'{"provider_id":"openai","model_id":"gpt-5","variant_id":"default"}',
			'modify', 'ok', 1, '2026-04-05T10:00:00Z'
		);
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	providerID, modelID, variantID, ok, err := reader.LatestResolvedModel("bootstrap", "quick-agent")
	if err != nil {
		t.Fatalf("latest resolved model: %v", err)
	}
	if !ok {
		t.Fatal("expected resolved model, got not found")
	}
	if providerID != "openai" || modelID != "gpt-5" || variantID != "default" {
		t.Fatalf("unexpected resolved model: %s/%s/%s", providerID, modelID, variantID)
	}
}
