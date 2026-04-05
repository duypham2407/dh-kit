package hooks

import (
	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

type ModelOverrideHook func(agentID string, role string, lane string) (provider string, model string, variant string, err error)
type PreToolExecHook func(envelope types.ExecutionEnvelope, toolName string, toolArgs map[string]any) (allow bool, reason string, err error)
type PreAnswerHook func(envelope types.ExecutionEnvelope, intent string, toolsUsed []string, evidenceScore float64) (allow bool, action string, err error)
type SkillActivationHook func(envelope types.ExecutionEnvelope) (activeSkills []string, err error)
type McpRoutingHook func(envelope types.ExecutionEnvelope, intent string) (mcpPriority []string, mcpBlocked []string, err error)
type SessionStateHook func(sessionID string) (dhState types.DhSessionState, err error)

type Registry struct {
	ModelOverride  ModelOverrideHook
	PreToolExec    PreToolExecHook
	PreAnswer      PreAnswerHook
	SkillActivation SkillActivationHook
	McpRouting     McpRoutingHook
	SessionState   SessionStateHook
}

func NewRegistry() Registry {
	return Registry{
		ModelOverride:  DefaultModelOverrideHook,
		PreToolExec:    DefaultPreToolExecHook,
		PreAnswer:      DefaultPreAnswerHook,
		SkillActivation: DefaultSkillActivationHook,
		McpRouting:     DefaultMcpRoutingHook,
		SessionState:   DefaultSessionStateHook,
	}
}

func NewRegistryWithDecisionReader(reader bridge.DecisionReader) Registry {
	registry := NewRegistry()
	if reader == nil {
		return registry
	}
	registry.ModelOverride = BridgeModelOverrideHook(reader)
	registry.PreToolExec = BridgePreToolExecHook(reader)
	registry.PreAnswer = BridgePreAnswerHook(reader)
	registry.SkillActivation = BridgeSkillActivationHook(reader)
	registry.McpRouting = BridgeMcpRoutingHook(reader)
	registry.SessionState = BridgeSessionStateHook(reader)
	return registry
}
