package agent

import (
	"context"
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

func TestEvaluatePreAnswerPolicyAllows(t *testing.T) {
	defer dhhooks.SetRegistry(nil)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			return true, "ok", nil
		},
	})

	msg := message.Message{ID: "m1", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	preCtx := preAnswerContext{intent: "codebase_query", toolsUsed: []string{"glob"}, evidenceScore: 0.9}
	result, err := evaluatePreAnswerPolicy(context.Background(), "s1", msg, preCtx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !result.allow {
		t.Fatal("expected allow=true")
	}
	if result.action != "ok" {
		t.Fatalf("unexpected action: %s", result.action)
	}
}

func TestEvaluatePreAnswerPolicyRetry(t *testing.T) {
	defer dhhooks.SetRegistry(nil)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			return false, "retry_with_more_evidence", nil
		},
	})

	msg := message.Message{ID: "m2", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "s1", msg, preAnswerContext{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.allow {
		t.Fatal("expected allow=false")
	}
	if result.outcome != preAnswerOutcomeRetry {
		t.Fatalf("expected retry outcome, got %v", result.outcome)
	}
}

func TestEvaluatePreAnswerPolicyDegrade(t *testing.T) {
	defer dhhooks.SetRegistry(nil)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			return false, "degrade_insufficient_evidence", nil
		},
	})

	msg := message.Message{ID: "m3", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "s1", msg, preAnswerContext{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.allow {
		t.Fatal("expected allow=false")
	}
	if result.outcome != preAnswerOutcomeRespond {
		t.Fatalf("expected respond outcome, got %v", result.outcome)
	}
	if result.event.Type != AgentEventTypeResponse || !result.event.Done {
		t.Fatalf("unexpected response event: %#v", result.event)
	}
}

func TestEvaluatePreAnswerPolicyBlock(t *testing.T) {
	defer dhhooks.SetRegistry(nil)
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			return false, "blocked_by_policy", nil
		},
	})

	msg := message.Message{ID: "m-block", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	result, err := evaluatePreAnswerPolicy(context.Background(), "s1", msg, preAnswerContext{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.allow {
		t.Fatal("expected allow=false")
	}
	if result.outcome != preAnswerOutcomeError {
		t.Fatalf("expected error outcome, got %v", result.outcome)
	}
	if result.event.Type != AgentEventTypeError || result.event.Error == nil {
		t.Fatalf("unexpected error event: %#v", result.event)
	}
}

func TestEvaluatePreAnswerPolicyForwardsContext(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	var gotSessionID, gotEnvelopeID, gotIntent string
	var gotTools []string
	var gotScore float64

	dhhooks.SetRegistry(&dhhooks.Registry{
		PreAnswer: func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
			gotSessionID = sessionID
			gotEnvelopeID = envelopeID
			gotIntent = intent
			gotTools = append([]string{}, toolsUsed...)
			gotScore = evidenceScore
			return true, "ok", nil
		},
	})

	msg := message.Message{ID: "m4", Parts: []message.ContentPart{message.TextContent{Text: "answer"}}}
	preCtx := preAnswerContext{intent: "verification", toolsUsed: []string{"glob", "grep"}, evidenceScore: 0.77}
	_, err := evaluatePreAnswerPolicy(context.Background(), "sess-x", msg, preCtx)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if gotSessionID != "sess-x" {
		t.Fatalf("expected sessionID sess-x, got %s", gotSessionID)
	}
	if gotEnvelopeID != "m4" {
		t.Fatalf("expected envelopeID m4, got %s", gotEnvelopeID)
	}
	if gotIntent != "verification" {
		t.Fatalf("expected intent verification, got %s", gotIntent)
	}
	if len(gotTools) != 2 || gotTools[0] != "glob" || gotTools[1] != "grep" {
		t.Fatalf("unexpected tools: %#v", gotTools)
	}
	if gotScore != 0.77 {
		t.Fatalf("expected score 0.77, got %v", gotScore)
	}
}
