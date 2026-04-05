package agent

import (
	"errors"
	"strings"
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

func TestDecidePreAnswerActionRetry(t *testing.T) {
	msg := message.Message{ID: "m1", Parts: []message.ContentPart{message.TextContent{Text: "ok"}}}
	d := decidePreAnswerAction("retry_with_more_tools", msg)
	if d.kind != preAnswerActionRetry {
		t.Fatalf("expected retry, got %s", d.kind)
	}
	if d.err != nil {
		t.Fatalf("expected nil error, got %v", d.err)
	}
}

func TestDecidePreAnswerActionDegrade(t *testing.T) {
	msg := message.Message{ID: "m2", Parts: []message.ContentPart{message.TextContent{Text: "original"}}}
	d := decidePreAnswerAction("degrade_insufficient_evidence", msg)
	if d.kind != preAnswerActionDegrade {
		t.Fatalf("expected degrade, got %s", d.kind)
	}
	if len(d.degradedMessage.Parts) != 2 {
		t.Fatalf("expected 2 parts, got %d", len(d.degradedMessage.Parts))
	}
	text, ok := d.degradedMessage.Parts[0].(message.TextContent)
	if !ok {
		t.Fatalf("expected text content, got %T", d.degradedMessage.Parts[0])
	}
	if !strings.Contains(strings.ToLower(text.Text), "insufficient evidence") {
		t.Fatalf("unexpected degrade text: %q", text.Text)
	}
	finish, ok := d.degradedMessage.Parts[1].(message.Finish)
	if !ok {
		t.Fatalf("expected finish content, got %T", d.degradedMessage.Parts[1])
	}
	if finish.Reason != message.FinishReasonEndTurn {
		t.Fatalf("unexpected finish reason: %s", finish.Reason)
	}
}

func TestDecidePreAnswerActionBlock(t *testing.T) {
	msg := message.Message{ID: "m3", Parts: []message.ContentPart{message.TextContent{Text: "original"}}}
	d := decidePreAnswerAction("block_by_policy", msg)
	if d.kind != preAnswerActionBlock {
		t.Fatalf("expected block, got %s", d.kind)
	}
	if d.err == nil {
		t.Fatal("expected non-nil error for block")
	}
	if !strings.Contains(d.err.Error(), "answer blocked by dh policy") {
		t.Fatalf("unexpected error: %v", d.err)
	}
}

func TestApplyPreAnswerDecisionRetry(t *testing.T) {
	decision := preAnswerActionDecision{kind: preAnswerActionRetry}
	outcome, event := applyPreAnswerDecision(decision)
	if outcome != preAnswerOutcomeRetry {
		t.Fatalf("expected retry outcome, got %v", outcome)
	}
	if event.Type != "" || event.Done {
		t.Fatalf("expected empty event for retry, got %#v", event)
	}
}

func TestApplyPreAnswerDecisionDegradeReturnsResponseEvent(t *testing.T) {
	msg := message.Message{ID: "m4", Parts: []message.ContentPart{message.TextContent{Text: "degraded"}}}
	decision := preAnswerActionDecision{kind: preAnswerActionDegrade, degradedMessage: msg}
	outcome, event := applyPreAnswerDecision(decision)
	if outcome != preAnswerOutcomeRespond {
		t.Fatalf("expected respond outcome, got %v", outcome)
	}
	if event.Type != AgentEventTypeResponse || !event.Done {
		t.Fatalf("expected response done=true, got %#v", event)
	}
	if event.Message.ID != "m4" {
		t.Fatalf("unexpected degraded message id: %s", event.Message.ID)
	}
}

func TestApplyPreAnswerDecisionBlockReturnsErrorEvent(t *testing.T) {
	decision := preAnswerActionDecision{kind: preAnswerActionBlock, err: errors.New("blocked by policy")}

	outcome, event := applyPreAnswerDecision(decision)
	if outcome != preAnswerOutcomeError {
		t.Fatalf("expected error outcome, got %v", outcome)
	}
	if event.Type != AgentEventTypeError || !event.Done {
		t.Fatalf("expected error done=true, got %#v", event)
	}
	if event.Error == nil || !strings.Contains(event.Error.Error(), "blocked") {
		t.Fatalf("unexpected error event: %#v", event)
	}
}
