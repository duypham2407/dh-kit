package session

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
	"github.com/duypham93/dh/packages/opencode-core/internal/config"
	"github.com/duypham93/dh/packages/opencode-core/internal/db"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
)

func TestSessionCreatePathsApplyHookInjection(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	// Ensure at least one provider credential is available so config.Load succeeds.
	if os.Getenv("OPENAI_API_KEY") == "" {
		t.Setenv("OPENAI_API_KEY", "test-key-for-session-test")
	}

	workDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workDir, ".dh"), 0o755); err != nil {
		t.Fatalf("mkdir .dh: %v", err)
	}

	if _, err := config.Load(workDir, true); err != nil {
		t.Fatalf("load config: %v", err)
	}

	conn, err := db.Connect()
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	svc := NewService(db.New(conn))

	dhhooks.SetRegistry(&dhhooks.Registry{
		SessionState: func(sessionID string) (map[string]any, error) {
			return map[string]any{
				"lane":                 "delivery",
				"laneLocked":           true,
				"currentStage":         "delivery_coding",
				"semanticMode":         "always",
				"toolEnforcementLevel": "very-hard",
				"activeWorkItemIds":    []any{"W-1"},
			}, nil
		},
	})
	t.Cleanup(func() { dhhooks.SetRegistry(nil) })

	ctx := context.Background()

	mainSess, err := svc.Create(ctx, "main")
	if err != nil {
		t.Fatalf("create main: %v", err)
	}
	assertInjectedState(t, mainSess.ID)

	taskSess, err := svc.CreateTaskSession(ctx, "tool-call-"+uuid.NewString(), mainSess.ID, "task")
	if err != nil {
		t.Fatalf("create task: %v", err)
	}
	assertInjectedState(t, taskSess.ID)

	titleSess, err := svc.CreateTitleSession(ctx, mainSess.ID)
	if err != nil {
		t.Fatalf("create title: %v", err)
	}
	assertInjectedState(t, titleSess.ID)

	if err := svc.Delete(ctx, taskSess.ID); err != nil {
		t.Fatalf("delete task session: %v", err)
	}
	if _, ok := GetDhSessionState(taskSess.ID); ok {
		t.Fatalf("expected task session state to be deleted for %s", taskSess.ID)
	}
}

func TestNewServiceWithDBPersistsAndRehydrates(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	// Ensure at least one provider credential is available so config.Load succeeds.
	if os.Getenv("OPENAI_API_KEY") == "" {
		t.Setenv("OPENAI_API_KEY", "test-key-for-session-test")
	}

	workDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(workDir, ".dh"), 0o755); err != nil {
		t.Fatalf("mkdir .dh: %v", err)
	}

	if _, err := config.Load(workDir, true); err != nil {
		t.Fatalf("load config: %v", err)
	}

	conn, err := db.Connect()
	if err != nil {
		t.Fatalf("connect db: %v", err)
	}
	t.Cleanup(func() { _ = conn.Close() })

	// Manually apply the dh_session_state migration since goose only runs
	// the embedded migrations from the db package
	_, err = conn.Exec(`
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
		t.Fatalf("create dh_session_state table: %v", err)
	}

	dhhooks.SetRegistry(&dhhooks.Registry{
		SessionState: func(sessionID string) (map[string]any, error) {
			return map[string]any{
				"lane":         "migration",
				"laneLocked":   true,
				"currentStage": "migration_upgrade",
			}, nil
		},
	})
	t.Cleanup(func() { dhhooks.SetRegistry(nil) })

	ctx := context.Background()

	// Phase 1: Create session with NewServiceWithDB — should persist to DB
	svc1 := NewServiceWithDB(db.New(conn), conn)
	sess, err := svc1.Create(ctx, "persist-test")
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	state, ok := GetDhSessionState(sess.ID)
	if !ok || state.Lane != "migration" || state.CurrentStage != "migration_upgrade" {
		t.Fatalf("expected injected state after create, got: %#v (ok=%v)", state, ok)
	}

	// Phase 2: Clear in-memory cache, create new service — should rehydrate from DB
	clearDhSessionStateStore()

	svc2 := NewServiceWithDB(db.New(conn), conn)
	_ = svc2 // just triggers rehydration via constructor

	rehydrated, ok := GetDhSessionState(sess.ID)
	if !ok {
		t.Fatal("expected state to be rehydrated from DB after service restart")
	}
	if rehydrated.Lane != "migration" {
		t.Fatalf("rehydrated lane mismatch: %s", rehydrated.Lane)
	}
	if !rehydrated.LaneLocked {
		t.Fatal("expected laneLocked=true after rehydration")
	}
	if rehydrated.CurrentStage != "migration_upgrade" {
		t.Fatalf("rehydrated stage mismatch: %s", rehydrated.CurrentStage)
	}

	// Phase 3: Delete session via service — should cascade delete state
	if err := svc2.Delete(ctx, sess.ID); err != nil {
		t.Fatalf("delete session: %v", err)
	}
	if _, ok := GetDhSessionState(sess.ID); ok {
		t.Fatal("expected state to be deleted after session delete")
	}
}

func assertInjectedState(t *testing.T, sessionID string) {
	t.Helper()
	state, ok := GetDhSessionState(sessionID)
	if !ok {
		t.Fatalf("expected injected state for session %s", sessionID)
	}
	if state.Lane != "delivery" || state.CurrentStage != "delivery_coding" {
		t.Fatalf("unexpected state for %s: %#v", sessionID, state)
	}
	if !state.LaneLocked {
		t.Fatalf("expected laneLocked=true for session %s", sessionID)
	}
	if state.SemanticMode != "always" || state.ToolEnforcementLevel != "very-hard" {
		t.Fatalf("unexpected modes for %s: %#v", sessionID, state)
	}
	if len(state.ActiveWorkItemIDs) != 1 || state.ActiveWorkItemIDs[0] != "W-1" {
		t.Fatalf("unexpected active work items for %s: %#v", sessionID, state.ActiveWorkItemIDs)
	}
}
