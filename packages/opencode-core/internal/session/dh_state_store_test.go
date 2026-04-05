package session

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

func setupTestDB(t *testing.T) *sql.DB {
	t.Helper()
	tmpDir := t.TempDir()
	dbPath := filepath.Join(tmpDir, "test.db")

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		t.Fatalf("failed to open test db: %v", err)
	}
	t.Cleanup(func() { db.Close(); os.Remove(dbPath) })

	// Create sessions table (required for FK reference)
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			parent_session_id TEXT,
			title TEXT NOT NULL DEFAULT '',
			message_count INTEGER NOT NULL DEFAULT 0,
			prompt_tokens INTEGER NOT NULL DEFAULT 0,
			completion_tokens INTEGER NOT NULL DEFAULT 0,
			cost REAL NOT NULL DEFAULT 0.0,
			updated_at INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT 0,
			summary_message_id TEXT
		)
	`)
	if err != nil {
		t.Fatalf("failed to create sessions table: %v", err)
	}

	// Create dh_session_state table
	_, err = db.Exec(`
		CREATE TABLE IF NOT EXISTS dh_session_state (
			session_id TEXT PRIMARY KEY,
			lane TEXT NOT NULL DEFAULT '',
			lane_locked INTEGER NOT NULL DEFAULT 0,
			current_stage TEXT NOT NULL DEFAULT '',
			semantic_mode TEXT NOT NULL DEFAULT '',
			tool_enforcement_level TEXT NOT NULL DEFAULT '',
			active_work_item_ids TEXT NOT NULL DEFAULT '[]',
			updated_at INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT 0,
			FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
		)
	`)
	if err != nil {
		t.Fatalf("failed to create dh_session_state table: %v", err)
	}

	// Enable foreign keys
	_, _ = db.Exec("PRAGMA foreign_keys = ON")

	return db
}

func insertSession(t *testing.T, db *sql.DB, id string) {
	t.Helper()
	_, err := db.Exec(`INSERT INTO sessions (id, title) VALUES (?, ?)`, id, "test")
	if err != nil {
		t.Fatalf("failed to insert session %s: %v", id, err)
	}
}

func TestDhStateStoreSaveAndLoad(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	db := setupTestDB(t)
	insertSession(t, db, "persist-1")

	store := NewDhStateStore(db)
	ctx := context.Background()

	state := types.DhSessionState{
		SessionID:            "persist-1",
		Lane:                 "delivery",
		LaneLocked:           true,
		CurrentStage:         "delivery_coding",
		SemanticMode:         "auto",
		ToolEnforcementLevel: "very-hard",
		ActiveWorkItemIDs:    []string{"W-1", "W-2"},
	}

	if err := store.Save(ctx, state); err != nil {
		t.Fatalf("Save failed: %v", err)
	}

	// Clear in-memory cache to force DB read
	clearDhSessionStateStore()

	loaded, ok := store.Load(ctx, "persist-1")
	if !ok {
		t.Fatal("expected state to be loadable from DB")
	}

	if loaded.Lane != "delivery" {
		t.Fatalf("lane mismatch: got %s", loaded.Lane)
	}
	if !loaded.LaneLocked {
		t.Fatal("expected laneLocked=true")
	}
	if loaded.CurrentStage != "delivery_coding" {
		t.Fatalf("stage mismatch: got %s", loaded.CurrentStage)
	}
	if loaded.SemanticMode != "auto" {
		t.Fatalf("semantic mode mismatch: got %s", loaded.SemanticMode)
	}
	if loaded.ToolEnforcementLevel != "very-hard" {
		t.Fatalf("enforcement mismatch: got %s", loaded.ToolEnforcementLevel)
	}
	if len(loaded.ActiveWorkItemIDs) != 2 || loaded.ActiveWorkItemIDs[0] != "W-1" {
		t.Fatalf("work items mismatch: %#v", loaded.ActiveWorkItemIDs)
	}
}

func TestDhStateStoreUpsert(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	db := setupTestDB(t)
	insertSession(t, db, "persist-2")

	store := NewDhStateStore(db)
	ctx := context.Background()

	state1 := types.DhSessionState{
		SessionID: "persist-2",
		Lane:      "quick",
	}
	if err := store.Save(ctx, state1); err != nil {
		t.Fatalf("first save failed: %v", err)
	}

	state2 := types.DhSessionState{
		SessionID:    "persist-2",
		Lane:         "delivery",
		CurrentStage: "delivery_scope",
	}
	if err := store.Save(ctx, state2); err != nil {
		t.Fatalf("upsert save failed: %v", err)
	}

	clearDhSessionStateStore()

	loaded, ok := store.Load(ctx, "persist-2")
	if !ok {
		t.Fatal("expected state after upsert")
	}
	if loaded.Lane != "delivery" || loaded.CurrentStage != "delivery_scope" {
		t.Fatalf("upsert mismatch: lane=%s stage=%s", loaded.Lane, loaded.CurrentStage)
	}
}

func TestDhStateStoreDelete(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	db := setupTestDB(t)
	insertSession(t, db, "persist-3")

	store := NewDhStateStore(db)
	ctx := context.Background()

	state := types.DhSessionState{
		SessionID: "persist-3",
		Lane:      "migration",
	}
	if err := store.Save(ctx, state); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	if err := store.Delete(ctx, "persist-3"); err != nil {
		t.Fatalf("delete failed: %v", err)
	}

	if _, ok := store.Load(ctx, "persist-3"); ok {
		t.Fatal("expected state to be deleted from both cache and DB")
	}
}

func TestDhStateStoreLoadAll(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	db := setupTestDB(t)
	insertSession(t, db, "all-1")
	insertSession(t, db, "all-2")

	store := NewDhStateStore(db)
	ctx := context.Background()

	s1 := types.DhSessionState{SessionID: "all-1", Lane: "quick"}
	s2 := types.DhSessionState{SessionID: "all-2", Lane: "delivery", LaneLocked: true}
	_ = store.Save(ctx, s1)
	_ = store.Save(ctx, s2)

	clearDhSessionStateStore()

	states, err := store.LoadAll(ctx)
	if err != nil {
		t.Fatalf("LoadAll failed: %v", err)
	}
	if len(states) != 2 {
		t.Fatalf("expected 2 states, got %d", len(states))
	}

	// Verify in-memory cache was hydrated
	if cached, ok := GetDhSessionState("all-1"); !ok || cached.Lane != "quick" {
		t.Fatalf("cache not hydrated for all-1")
	}
	if cached, ok := GetDhSessionState("all-2"); !ok || cached.Lane != "delivery" || !cached.LaneLocked {
		t.Fatalf("cache not hydrated for all-2")
	}
}

func TestDhStateStoreTableExists(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	db := setupTestDB(t)
	store := NewDhStateStore(db)
	ctx := context.Background()

	if !store.TableExists(ctx) {
		t.Fatal("expected table to exist")
	}
}

func TestDhStateStoreNilDB(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	store := NewDhStateStore(nil)
	ctx := context.Background()

	state := types.DhSessionState{SessionID: "nil-1", Lane: "quick"}
	if err := store.Save(ctx, state); err != nil {
		t.Fatalf("save with nil DB should not error: %v", err)
	}

	// In-memory cache should still work
	if cached, ok := GetDhSessionState("nil-1"); !ok || cached.Lane != "quick" {
		t.Fatal("in-memory cache should work with nil DB")
	}

	clearDhSessionStateStore()

	// Load from DB should return not-found
	if _, ok := store.Load(ctx, "nil-1"); ok {
		t.Fatal("load with nil DB after clearing cache should return not-found")
	}

	if !store.TableExists(ctx) == true {
		// nil DB should return false for TableExists
	}
}

func TestDhStateStoreCascadeDelete(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	db := setupTestDB(t)
	insertSession(t, db, "cascade-1")

	store := NewDhStateStore(db)
	ctx := context.Background()

	state := types.DhSessionState{SessionID: "cascade-1", Lane: "delivery"}
	_ = store.Save(ctx, state)

	// Delete the parent session row -- should cascade to dh_session_state
	_, err := db.ExecContext(ctx, "DELETE FROM sessions WHERE id = ?", "cascade-1")
	if err != nil {
		t.Fatalf("cascade delete failed: %v", err)
	}

	clearDhSessionStateStore()
	if _, ok := store.Load(ctx, "cascade-1"); ok {
		t.Fatal("expected state to be cascade-deleted")
	}
}
