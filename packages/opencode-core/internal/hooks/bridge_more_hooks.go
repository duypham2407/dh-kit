package hooks

import (
	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

// BridgeModelOverrideHook reads the latest TS-side model override decision.
// It currently supports an output payload containing provider/model/variant keys.
func BridgeModelOverrideHook(reader bridge.DecisionReader) ModelOverrideHook {
	return func(agentID string, role string, lane string) (string, string, string, error) {
		providerID, modelID, variantID, found, err := reader.LatestResolvedModel("bootstrap", agentID)
		if err != nil || !found {
			return DefaultModelOverrideHook(agentID, role, lane)
		}
		return providerID, modelID, variantID, nil
	}
}

// BridgeSkillActivationHook currently falls back to default hook behavior while
// keeping the registry extension point explicit for production wiring.
func BridgeSkillActivationHook(reader bridge.DecisionReader) SkillActivationHook {
	return func(envelope types.ExecutionEnvelope) ([]string, error) {
		skills, found, err := reader.LatestSkills(envelope.SessionID, envelope.EnvelopeID)
		if err != nil || !found {
			return DefaultSkillActivationHook(envelope)
		}
		return skills, nil
	}
}

// BridgeMcpRoutingHook currently falls back to default routing while preserving
// a concrete bridge seam for later production policy transfer.
// Note: decision.Warnings are intentionally not projected into runtime ordering.
// They remain audit-visible in hook_invocation_logs until an approved runtime
// surface consumes warnings explicitly.
func BridgeMcpRoutingHook(reader bridge.DecisionReader) McpRoutingHook {
	return func(envelope types.ExecutionEnvelope, intent string) ([]string, []string, error) {
		decision, found, err := reader.LatestMcpRoutingDecision(envelope.SessionID, envelope.EnvelopeID)
		if err != nil || !found {
			return DefaultMcpRoutingHook(envelope, intent)
		}
		return decision.Mcps, decision.Blocked, nil
	}
}

// BridgeSessionStateHook preserves a runtime seam for session-state injection.
func BridgeSessionStateHook(reader bridge.DecisionReader) SessionStateHook {
	return func(sessionID string) (types.DhSessionState, error) {
		state, err := reader.LatestSessionState(sessionID)
		if err != nil || state == nil {
			return DefaultSessionStateHook(sessionID)
		}
		if state.SessionID == "" {
			state.SessionID = sessionID
		}
		return *state, nil
	}
}
