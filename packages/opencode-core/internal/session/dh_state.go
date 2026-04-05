package session

import (
	"sync"

	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

var dhStateStore sync.Map

// SetDhSessionStateFromHook stores dh session state injected by runtime hooks.
// Supports both camelCase and snake_case keys for compatibility.
func SetDhSessionStateFromHook(sessionID string, payload map[string]any) types.DhSessionState {
	state := types.DhSessionState{SessionID: sessionID}
	if payload == nil {
		dhStateStore.Store(sessionID, state)
		return state
	}

	if lane, ok := readString(payload, "lane"); ok {
		state.Lane = lane
	}
	if laneLocked, ok := readBool(payload, "laneLocked", "lane_locked"); ok {
		state.LaneLocked = laneLocked
	}
	if stage, ok := readString(payload, "currentStage", "current_stage"); ok {
		state.CurrentStage = stage
	}
	if mode, ok := readString(payload, "semanticMode", "semantic_mode"); ok {
		state.SemanticMode = mode
	}
	if level, ok := readString(payload, "toolEnforcementLevel", "tool_enforcement_level"); ok {
		state.ToolEnforcementLevel = level
	}
	if ids, ok := readStringArray(payload, "activeWorkItemIds", "active_work_item_ids"); ok {
		state.ActiveWorkItemIDs = ids
	}

	dhStateStore.Store(sessionID, state)
	return state
}

func GetDhSessionState(sessionID string) (types.DhSessionState, bool) {
	raw, ok := dhStateStore.Load(sessionID)
	if !ok {
		return types.DhSessionState{}, false
	}
	state, ok := raw.(types.DhSessionState)
	if !ok {
		return types.DhSessionState{}, false
	}
	return state, true
}

func DeleteDhSessionState(sessionID string) {
	dhStateStore.Delete(sessionID)
}

func clearDhSessionStateStore() {
	dhStateStore.Range(func(key any, value any) bool {
		dhStateStore.Delete(key)
		return true
	})
}

func readString(payload map[string]any, keys ...string) (string, bool) {
	for _, key := range keys {
		if value, ok := payload[key].(string); ok {
			return value, true
		}
	}
	return "", false
}

func readBool(payload map[string]any, keys ...string) (bool, bool) {
	for _, key := range keys {
		if value, ok := payload[key].(bool); ok {
			return value, true
		}
	}
	return false, false
}

func readStringArray(payload map[string]any, keys ...string) ([]string, bool) {
	for _, key := range keys {
		raw, exists := payload[key]
		if !exists {
			continue
		}
		switch values := raw.(type) {
		case []string:
			return values, true
		case []any:
			result := make([]string, 0, len(values))
			for _, value := range values {
				if str, ok := value.(string); ok {
					result = append(result, str)
				}
			}
			return result, len(result) > 0
		}
	}
	return nil, false
}
