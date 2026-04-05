package bridge

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

// TestIntegration_TSWriteGoRead simulates the full TS→Go enforcement bridge:
//  1. Creates a DB at the canonical .dh/sqlite/dh.db path (same as TS storage).
//  2. Uses the exact same schema the TS bootstrapDhDatabase() creates.
//  3. Writes hook_invocation_logs rows mimicking what the TS HookInvocationLogsRepo.save() does.
//  4. Opens the DB via NewSQLiteDecisionReader (the Go side).
//  5. Asserts that Go reads the correct decisions and enforces them via Evaluate().
func TestIntegration_TSWriteGoRead(t *testing.T) {
	// --- Setup: simulate repo with .dh/sqlite/dh.db ---
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir db dir: %v", err)
	}

	dbPath := filepath.Join(repoRoot, DBPathTemplate)
	if dbPath != filepath.Join(repoRoot, ".dh", "sqlite", "dh.db") {
		t.Fatalf("DBPathTemplate mismatch: got %s", dbPath)
	}

	// Open as "TS writer" — same driver, same path
	tsDB, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("ts open: %v", err)
	}
	defer tsDB.Close()

	// Enable WAL (matching TS PRAGMA journal_mode = WAL)
	if _, err := tsDB.Exec("PRAGMA journal_mode = WAL"); err != nil {
		t.Fatalf("ts WAL: %v", err)
	}

	// Create the exact schema from packages/storage/src/sqlite/db.ts bootstrapDhDatabase()
	if _, err := tsDB.Exec(`
		CREATE TABLE IF NOT EXISTS hook_invocation_logs (
			id            TEXT PRIMARY KEY,
			session_id    TEXT NOT NULL,
			envelope_id   TEXT NOT NULL,
			hook_name     TEXT NOT NULL,
			input_json    TEXT NOT NULL,
			output_json   TEXT NOT NULL,
			decision      TEXT NOT NULL,
			reason        TEXT NOT NULL,
			duration_ms   REAL NOT NULL,
			timestamp     TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("create schema: %v", err)
	}

	// --- Phase 1: TS writes a "block" decision for pre_tool_exec ---
	if _, err := tsDB.Exec(`
		INSERT INTO hook_invocation_logs
		  (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES
		  ('ts-001', 'sess-abc', 'env-xyz', 'pre_tool_exec',
		   '{"toolName":"bash","toolArgs":{"command":"rm -rf /"}}',
		   '{}',
		   'block', 'destructive command blocked by policy', 2.5,
		   '2026-04-05T12:00:00Z');
	`); err != nil {
		t.Fatalf("ts insert block: %v", err)
	}

	// --- Phase 2: Go reads via DecisionReader ---
	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("go reader open: %v", err)
	}
	defer reader.Close()

	row, err := reader.LatestDecision("sess-abc", "env-xyz", "pre_tool_exec")
	if err != nil {
		t.Fatalf("go LatestDecision: %v", err)
	}
	if row == nil {
		t.Fatal("expected TS-written decision, got nil")
	}
	if row.Decision != "block" {
		t.Fatalf("expected block, got %s", row.Decision)
	}
	if row.Reason != "destructive command blocked by policy" {
		t.Fatalf("unexpected reason: %s", row.Reason)
	}

	// --- Phase 3: Evaluate() enforces the block ---
	allow, reason := Evaluate(row, true, "default-allow")
	if allow {
		t.Fatal("Evaluate should return false for block decision")
	}
	if reason != "destructive command blocked by policy" {
		t.Fatalf("unexpected evaluate reason: %s", reason)
	}

	// --- Phase 4: TS writes an "allow" decision for the same tuple (newer) ---
	if _, err := tsDB.Exec(`
		INSERT INTO hook_invocation_logs
		  (id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp)
		VALUES
		  ('ts-002', 'sess-abc', 'env-xyz', 'pre_tool_exec',
		   '{"toolName":"glob","toolArgs":{"pattern":"*.go"}}',
		   '{}',
		   'allow', 'safe tool', 1.0,
		   '2026-04-05T12:01:00Z');
	`); err != nil {
		t.Fatalf("ts insert allow: %v", err)
	}

	// Go re-reads and should get the newer "allow"
	row2, err := reader.LatestDecision("sess-abc", "env-xyz", "pre_tool_exec")
	if err != nil {
		t.Fatalf("go LatestDecision (2nd): %v", err)
	}
	if row2 == nil {
		t.Fatal("expected 2nd decision, got nil")
	}
	if row2.Decision != "allow" {
		t.Fatalf("expected allow, got %s", row2.Decision)
	}

	allow2, _ := Evaluate(row2, false, "default-block")
	if !allow2 {
		t.Fatal("Evaluate should return true for allow decision")
	}

	// --- Phase 5: No decision written → fallback ---
	rowNone, err := reader.LatestDecision("sess-abc", "env-xyz", "pre_answer")
	if err != nil {
		t.Fatalf("go LatestDecision (missing): %v", err)
	}
	if rowNone != nil {
		t.Fatal("expected nil for missing hook, got row")
	}

	allowDefault, reasonDefault := Evaluate(rowNone, true, "no-ts-decision")
	if !allowDefault {
		t.Fatal("Evaluate should return default-allow when no decision")
	}
	if reasonDefault != "no-ts-decision" {
		t.Fatalf("unexpected default reason: %s", reasonDefault)
	}
}

// TestIntegration_TSWriteGoRead_ModelOverride tests model override decisions
// written by TS and read by Go.
func TestIntegration_TSWriteGoRead_ModelOverride(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	dbPath := filepath.Join(repoRoot, DBPathTemplate)
	tsDB, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("ts open: %v", err)
	}
	defer tsDB.Close()

	if _, err := tsDB.Exec("PRAGMA journal_mode = WAL"); err != nil {
		t.Fatalf("WAL: %v", err)
	}
	if _, err := tsDB.Exec(`
		CREATE TABLE IF NOT EXISTS hook_invocation_logs (
			id TEXT PRIMARY KEY, session_id TEXT NOT NULL, envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
			decision TEXT NOT NULL, reason TEXT NOT NULL, duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// TS writes a model override decision
	if _, err := tsDB.Exec(`
		INSERT INTO hook_invocation_logs VALUES
		('mo-001', 'sess-1', 'quick-agent', 'model_override', '{}',
		 '{"providerId":"anthropic","modelId":"claude-opus-4","variantId":"high"}',
		 'modify', 'lane=delivery', 1, '2026-04-05T12:00:00Z');
	`); err != nil {
		t.Fatalf("insert: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("reader: %v", err)
	}
	defer reader.Close()

	prov, model, variant, ok, err := reader.LatestResolvedModel("sess-1", "quick-agent")
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if !ok {
		t.Fatal("expected model override, got not found")
	}
	if prov != "anthropic" || model != "claude-opus-4" || variant != "high" {
		t.Fatalf("unexpected: %s/%s/%s", prov, model, variant)
	}
}

// TestIntegration_TSWriteGoRead_SessionState tests session state decisions.
func TestIntegration_TSWriteGoRead_SessionState(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	dbPath := filepath.Join(repoRoot, DBPathTemplate)
	tsDB, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("ts open: %v", err)
	}
	defer tsDB.Close()

	if _, err := tsDB.Exec("PRAGMA journal_mode = WAL"); err != nil {
		t.Fatalf("WAL: %v", err)
	}
	if _, err := tsDB.Exec(`
		CREATE TABLE IF NOT EXISTS hook_invocation_logs (
			id TEXT PRIMARY KEY, session_id TEXT NOT NULL, envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
			decision TEXT NOT NULL, reason TEXT NOT NULL, duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// TS writes session state with full payload
	if _, err := tsDB.Exec(`
		INSERT INTO hook_invocation_logs VALUES
		('ss-001', 'sess-delivery', 'sess-delivery', 'session_state', '{}',
		 '{"lane":"delivery","laneLocked":true,"currentStage":"delivery_coding","semanticMode":"always","toolEnforcementLevel":"very-hard","activeWorkItemIds":["FEAT-001"]}',
		 'modify', 'user explicit', 1, '2026-04-05T12:00:00Z');
	`); err != nil {
		t.Fatalf("insert: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("reader: %v", err)
	}
	defer reader.Close()

	state, err := reader.LatestSessionState("sess-delivery")
	if err != nil {
		t.Fatalf("state: %v", err)
	}
	if state == nil {
		t.Fatal("expected state, got nil")
	}
	if state.Lane != "delivery" {
		t.Fatalf("lane: %s", state.Lane)
	}
	if !state.LaneLocked {
		t.Fatal("expected laneLocked=true")
	}
	if state.CurrentStage != "delivery_coding" {
		t.Fatalf("stage: %s", state.CurrentStage)
	}
	if state.SemanticMode != "always" {
		t.Fatalf("semantic: %s", state.SemanticMode)
	}
	if state.ToolEnforcementLevel != "very-hard" {
		t.Fatalf("enforcement: %s", state.ToolEnforcementLevel)
	}
	if len(state.ActiveWorkItemIDs) != 1 || state.ActiveWorkItemIDs[0] != "FEAT-001" {
		t.Fatalf("workitems: %v", state.ActiveWorkItemIDs)
	}
	if state.SessionID != "sess-delivery" {
		t.Fatalf("sessionID: %s", state.SessionID)
	}
}

// TestIntegration_TSWriteGoRead_AllSixHooks exercises all 6 hook types
// in a single DB to verify no cross-contamination between hook namespaces.
func TestIntegration_TSWriteGoRead_AllSixHooks(t *testing.T) {
	repoRoot := t.TempDir()
	dbDir := filepath.Join(repoRoot, ".dh", "sqlite")
	if err := os.MkdirAll(dbDir, 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}

	dbPath := filepath.Join(repoRoot, DBPathTemplate)
	tsDB, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("ts open: %v", err)
	}
	defer tsDB.Close()

	if _, err := tsDB.Exec("PRAGMA journal_mode = WAL"); err != nil {
		t.Fatalf("WAL: %v", err)
	}
	if _, err := tsDB.Exec(`
		CREATE TABLE IF NOT EXISTS hook_invocation_logs (
			id TEXT PRIMARY KEY, session_id TEXT NOT NULL, envelope_id TEXT NOT NULL,
			hook_name TEXT NOT NULL, input_json TEXT NOT NULL, output_json TEXT NOT NULL,
			decision TEXT NOT NULL, reason TEXT NOT NULL, duration_ms REAL NOT NULL,
			timestamp TEXT NOT NULL
		);
	`); err != nil {
		t.Fatalf("schema: %v", err)
	}

	// Insert one row per hook type
	rows := []string{
		`('h1','s1','e1','model_override','{}','{"providerId":"openai","modelId":"gpt-4","variantId":"default"}','modify','lane','1','2026-04-05T12:00:00Z')`,
		`('h2','s1','e1','pre_tool_exec','{}','{}','block','dangerous','1','2026-04-05T12:00:01Z')`,
		`('h3','s1','e1','pre_answer','{}','{}','allow','verified','1','2026-04-05T12:00:02Z')`,
		`('h4','s1','s1','session_state','{}','{"lane":"quick","currentStage":"quick_exec"}','modify','init','1','2026-04-05T12:00:03Z')`,
		`('h5','s1','e1','skill_activation','{}','{"skills":["tdd","debugging"]}','modify','lane','1','2026-04-05T12:00:04Z')`,
		`('h6','s1','e1','mcp_routing','{}','{"mcps":["context7"]}','modify','intent','1','2026-04-05T12:00:05Z')`,
	}
	for _, r := range rows {
		if _, err := tsDB.Exec(`INSERT INTO hook_invocation_logs VALUES ` + r); err != nil {
			t.Fatalf("insert %s: %v", r[:10], err)
		}
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("reader: %v", err)
	}
	defer reader.Close()

	// 1. model_override
	prov, model, variant, ok, err := reader.LatestResolvedModel("s1", "e1")
	if err != nil || !ok {
		t.Fatalf("model_override: err=%v ok=%v", err, ok)
	}
	if prov != "openai" || model != "gpt-4" || variant != "default" {
		t.Fatalf("model: %s/%s/%s", prov, model, variant)
	}

	// 2. pre_tool_exec (block)
	toolRow, err := reader.LatestDecision("s1", "e1", "pre_tool_exec")
	if err != nil || toolRow == nil {
		t.Fatalf("pre_tool_exec: err=%v row=%v", err, toolRow)
	}
	allow, _ := Evaluate(toolRow, true, "")
	if allow {
		t.Fatal("pre_tool_exec should be blocked")
	}

	// 3. pre_answer (allow)
	ansRow, err := reader.LatestDecision("s1", "e1", "pre_answer")
	if err != nil || ansRow == nil {
		t.Fatalf("pre_answer: err=%v row=%v", err, ansRow)
	}
	allow, _ = Evaluate(ansRow, false, "")
	if !allow {
		t.Fatal("pre_answer should be allowed")
	}

	// 4. session_state
	state, err := reader.LatestSessionState("s1")
	if err != nil || state == nil {
		t.Fatalf("session_state: err=%v state=%v", err, state)
	}
	if state.Lane != "quick" || state.CurrentStage != "quick_exec" {
		t.Fatalf("state: lane=%s stage=%s", state.Lane, state.CurrentStage)
	}

	// 5. skill_activation
	skills, ok, err := reader.LatestSkills("s1", "e1")
	if err != nil || !ok {
		t.Fatalf("skills: err=%v ok=%v", err, ok)
	}
	if len(skills) != 2 || skills[0] != "tdd" {
		t.Fatalf("skills: %v", skills)
	}

	// 6. mcp_routing
	mcps, ok, err := reader.LatestMcps("s1", "e1")
	if err != nil || !ok {
		t.Fatalf("mcps: err=%v ok=%v", err, ok)
	}
	if len(mcps) != 1 || mcps[0] != "context7" {
		t.Fatalf("mcps: %v", mcps)
	}
}
