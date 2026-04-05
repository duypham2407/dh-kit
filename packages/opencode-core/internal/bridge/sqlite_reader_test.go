package bridge

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"
)

func TestSQLiteDecisionReaderLatestDecisionReturnsNewestRow(t *testing.T) {
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
		('1', 'sess-1', 'env-1', 'pre_tool_exec', '{}', '{}', 'allow', 'older', 1, '2026-04-05T10:00:00Z'),
		('2', 'sess-1', 'env-1', 'pre_tool_exec', '{}', '{}', 'block', 'newer', 1, '2026-04-05T10:01:00Z');
	`); err != nil {
		t.Fatalf("insert rows: %v", err)
	}

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	record, err := reader.LatestDecision("sess-1", "env-1", "pre_tool_exec")
	if err != nil {
		t.Fatalf("latest decision: %v", err)
	}
	if record == nil {
		t.Fatal("expected latest decision, got nil")
	}
	if record.ID != "2" {
		t.Fatalf("expected newest row id 2, got %s", record.ID)
	}
	if record.Decision != "block" {
		t.Fatalf("expected decision block, got %s", record.Decision)
	}
	if record.Reason != "newer" {
		t.Fatalf("expected reason newer, got %s", record.Reason)
	}
}

func TestSQLiteDecisionReaderLatestDecisionReturnsNilWhenMissing(t *testing.T) {
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

	reader, err := NewSQLiteDecisionReader(repoRoot)
	if err != nil {
		t.Fatalf("new reader: %v", err)
	}
	t.Cleanup(func() { _ = reader.Close() })

	record, err := reader.LatestDecision("missing", "missing", "pre_answer")
	if err != nil {
		t.Fatalf("latest decision: %v", err)
	}
	if record != nil {
		t.Fatal("expected nil record for missing decision")
	}
}
