package agent

import (
	"fmt"
	"strings"
	"time"

	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

type preAnswerActionKind string

const (
	preAnswerActionRetry   preAnswerActionKind = "retry"
	preAnswerActionDegrade preAnswerActionKind = "degrade"
	preAnswerActionBlock   preAnswerActionKind = "block"
)

type preAnswerActionDecision struct {
	kind            preAnswerActionKind
	degradedMessage message.Message
	err             error
}

type preAnswerRuntimeOutcome int

const (
	preAnswerOutcomeRetry preAnswerRuntimeOutcome = iota
	preAnswerOutcomeRespond
	preAnswerOutcomeError
)

func decidePreAnswerAction(action string, agentMessage message.Message) preAnswerActionDecision {
	actionLower := strings.ToLower(action)
	if strings.Contains(actionLower, "retry") {
		return preAnswerActionDecision{kind: preAnswerActionRetry}
	}
	if strings.Contains(actionLower, "degrade") || strings.Contains(actionLower, "insufficient") {
		degraded := agentMessage
		degraded.Parts = []message.ContentPart{
			message.TextContent{Text: "Insufficient evidence to provide a confident answer."},
			message.Finish{Reason: message.FinishReasonEndTurn, Time: time.Now().Unix()},
		}
		return preAnswerActionDecision{
			kind:            preAnswerActionDegrade,
			degradedMessage: degraded,
		}
	}
	return preAnswerActionDecision{
		kind: preAnswerActionBlock,
		err:  fmt.Errorf("answer blocked by dh policy: %s", action),
	}
}

func applyPreAnswerDecision(decision preAnswerActionDecision) (preAnswerRuntimeOutcome, AgentEvent) {
	switch decision.kind {
	case preAnswerActionRetry:
		return preAnswerOutcomeRetry, AgentEvent{}
	case preAnswerActionDegrade:
		return preAnswerOutcomeRespond, AgentEvent{Type: AgentEventTypeResponse, Message: decision.degradedMessage, Done: true}
	default:
		return preAnswerOutcomeError, AgentEvent{Type: AgentEventTypeError, Error: decision.err, Done: true}
	}
}
