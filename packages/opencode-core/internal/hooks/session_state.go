package hooks

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

func DefaultSessionStateHook(sessionID string) (types.DhSessionState, error) {
	return types.DhSessionState{
		SessionID:            sessionID,
		Lane:                 "quick",
		LaneLocked:           true,
		CurrentStage:         "quick_intake",
		SemanticMode:         "always",
		ToolEnforcementLevel: "very-hard",
	}, nil
}
