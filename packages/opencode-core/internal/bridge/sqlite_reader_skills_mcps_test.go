package bridge

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

func TestSQLiteDecisionReaderLatestSkillsDecodesOutputJSON(t *testing.T) {
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
		VALUES ('1', 'sess-1', 'env-1', 'skill_activation', '{}', '{"skills":["using-skills","verification-before-completion"]}', 'modify', 'ok', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	skills, ok, err := reader.LatestSkills("sess-1", "env-1")
	if err != nil {
		t.Fatalf("latest skills: %v", err)
	}
	if !ok {
		t.Fatal("expected skills, got not found")
	}
	if len(skills) != 2 || skills[0] != "using-skills" {
		t.Fatalf("unexpected skills: %#v", skills)
	}
}

func TestSQLiteDecisionReaderLatestMcpsDecodesOutputJSON(t *testing.T) {
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
		VALUES ('1', 'sess-1', 'env-1', 'mcp_routing', '{}', '{"mcps":["augment_context_engine","context7"]}', 'modify', 'ok', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	mcps, ok, err := reader.LatestMcps("sess-1", "env-1")
	if err != nil {
		t.Fatalf("latest mcps: %v", err)
	}
	if !ok {
		t.Fatal("expected mcps, got not found")
	}
	if len(mcps) != 2 || mcps[0] != "augment_context_engine" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}
}

func TestSQLiteDecisionReaderLatestSkillsFallsBackToSessionScope(t *testing.T) {
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
		VALUES ('1', 'sess-1', 'sess-1', 'skill_activation', '{}', '{"skills":["using-skills"]}', 'modify', 'session scope', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	skills, ok, err := reader.LatestSkills("sess-1", "env-missing")
	if err != nil {
		t.Fatalf("latest skills: %v", err)
	}
	if !ok {
		t.Fatal("expected fallback skills, got not found")
	}
	if len(skills) != 1 || skills[0] != "using-skills" {
		t.Fatalf("unexpected skills: %#v", skills)
	}
}

func TestSQLiteDecisionReaderLatestMcpsPrefersExactEnvelope(t *testing.T) {
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
		VALUES
		('1', 'sess-1', 'sess-1', 'mcp_routing', '{}', '{"mcps":["context7"]}', 'modify', 'session scope', 1, '2026-04-05T10:00:00Z'),
		('2', 'sess-1', 'env-1', 'mcp_routing', '{}', '{"mcps":["augment_context_engine"]}', 'modify', 'exact scope', 1, '2026-04-05T10:01:00Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	mcps, ok, err := reader.LatestMcps("sess-1", "env-1")
	if err != nil {
		t.Fatalf("latest mcps: %v", err)
	}
	if !ok {
		t.Fatal("expected mcps, got not found")
	}
	if len(mcps) != 1 || mcps[0] != "augment_context_engine" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}
}

func TestSQLiteDecisionReaderLatestSkillsDecodesActiveSkillsKey(t *testing.T) {
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
		VALUES ('1', 'sess-1', 'env-1', 'skill_activation', '{}', '{"active_skills":["verification-before-completion"]}', 'modify', 'ok', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	skills, ok, err := reader.LatestSkills("sess-1", "env-1")
	if err != nil {
		t.Fatalf("latest skills: %v", err)
	}
	if !ok {
		t.Fatal("expected skills, got not found")
	}
	if len(skills) != 1 || skills[0] != "verification-before-completion" {
		t.Fatalf("unexpected skills: %#v", skills)
	}
}

func TestSQLiteDecisionReaderLatestMcpsDecodesActiveMcpsKey(t *testing.T) {
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
		VALUES ('1', 'sess-1', 'env-1', 'mcp_routing', '{}', '{"active_mcps":["context7"]}', 'modify', 'ok', 1, '2026-04-05T10:00:00Z');
	`); err != nil {
		t.Fatalf("insert row: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	mcps, ok, err := reader.LatestMcps("sess-1", "env-1")
	if err != nil {
		t.Fatalf("latest mcps: %v", err)
	}
	if !ok {
		t.Fatal("expected mcps, got not found")
	}
	if len(mcps) != 1 || mcps[0] != "context7" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}
}
