package session

import (
	"testing"
)

func TestSetDhSessionStateFromHookParsesCamelCase(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	payload := map[string]any{
		"lane":                 "delivery",
		"laneLocked":           true,
		"currentStage":         "delivery_review",
		"semanticMode":         "auto",
		"toolEnforcementLevel": "very-hard",
		"activeWorkItemIds":    []any{"W-1", "W-2"},
	}

	state := SetDhSessionStateFromHook("sess-1", payload)
	if state.SessionID != "sess-1" {
		t.Fatalf("session id mismatch: %s", state.SessionID)
	}
	if state.Lane != "delivery" {
		t.Fatalf("lane mismatch: %s", state.Lane)
	}
	if !state.LaneLocked {
		t.Fatal("expected laneLocked=true")
	}
	if state.CurrentStage != "delivery_review" {
		t.Fatalf("stage mismatch: %s", state.CurrentStage)
	}
	if state.SemanticMode != "auto" {
		t.Fatalf("semantic mode mismatch: %s", state.SemanticMode)
	}
	if state.ToolEnforcementLevel != "very-hard" {
		t.Fatalf("enforcement level mismatch: %s", state.ToolEnforcementLevel)
	}
	if len(state.ActiveWorkItemIDs) != 2 || state.ActiveWorkItemIDs[0] != "W-1" {
		t.Fatalf("active items mismatch: %#v", state.ActiveWorkItemIDs)
	}
}

func TestSetDhSessionStateFromHookParsesSnakeCase(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	payload := map[string]any{
		"lane":                   "migration",
		"lane_locked":            true,
		"current_stage":          "migration_review",
		"semantic_mode":          "always",
		"tool_enforcement_level": "very-hard",
		"active_work_item_ids":   []string{"MIG-1"},
	}

	state := SetDhSessionStateFromHook("sess-2", payload)
	if state.Lane != "migration" || state.CurrentStage != "migration_review" {
		t.Fatalf("unexpected state: %#v", state)
	}
	if !state.LaneLocked {
		t.Fatal("expected laneLocked=true")
	}
	if state.SemanticMode != "always" {
		t.Fatalf("semantic mode mismatch: %s", state.SemanticMode)
	}
	if state.ToolEnforcementLevel != "very-hard" {
		t.Fatalf("enforcement level mismatch: %s", state.ToolEnforcementLevel)
	}
	if len(state.ActiveWorkItemIDs) != 1 || state.ActiveWorkItemIDs[0] != "MIG-1" {
		t.Fatalf("active items mismatch: %#v", state.ActiveWorkItemIDs)
	}
}

func TestGetAndDeleteDhSessionState(t *testing.T) {
	clearDhSessionStateStore()
	t.Cleanup(clearDhSessionStateStore)

	SetDhSessionStateFromHook("sess-3", map[string]any{"lane": "quick"})

	state, ok := GetDhSessionState("sess-3")
	if !ok {
		t.Fatal("expected state to exist")
	}
	if state.Lane != "quick" {
		t.Fatalf("lane mismatch: %s", state.Lane)
	}

	DeleteDhSessionState("sess-3")
	if _, ok := GetDhSessionState("sess-3"); ok {
		t.Fatal("expected state to be deleted")
	}
}
