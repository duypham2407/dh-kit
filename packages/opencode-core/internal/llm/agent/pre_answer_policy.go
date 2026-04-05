package agent

import (
	"context"

	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

type preAnswerPolicyResult struct {
	allow   bool
	outcome preAnswerRuntimeOutcome
	event   AgentEvent
	action  string
}

func evaluatePreAnswerPolicy(ctx context.Context, sessionID string, agentMessage message.Message, preCtx preAnswerContext) (preAnswerPolicyResult, error) {
	allow, action, err := dhhooks.OnPreAnswer(ctx, sessionID, agentMessage.ID, preCtx.intent, preCtx.toolsUsed, preCtx.evidenceScore)
	if err != nil {
		return preAnswerPolicyResult{}, err
	}
	if allow {
		return preAnswerPolicyResult{allow: true, action: action}, nil
	}
	decision := decidePreAnswerAction(action, agentMessage)
	outcome, event := applyPreAnswerDecision(decision)
	return preAnswerPolicyResult{
		allow:   false,
		action:  action,
		outcome: outcome,
		event:   event,
	}, nil
}
