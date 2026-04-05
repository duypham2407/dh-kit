package agent

import (
	"context"
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

func TestEvaluatePreToolPolicyForwardsDecodedArgs(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	var gotSessionID, gotEnvelopeID, gotToolName string
	var gotArgs map[string]any
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			gotSessionID = sessionID
			gotEnvelopeID = envelopeID
			gotToolName = toolName
			gotArgs = toolArgs
			return true, "ok", nil
		},
	})

	allow, reason, err := evaluatePreToolPolicy(
		context.Background(),
		"sess-1",
		"env-1",
		message.ToolCall{Name: "glob", Input: `{"pattern":"*.go"}`},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allow || reason != "ok" {
		t.Fatalf("unexpected result allow=%t reason=%s", allow, reason)
	}
	if gotSessionID != "sess-1" || gotEnvelopeID != "env-1" {
		t.Fatalf("unexpected ids: %s/%s", gotSessionID, gotEnvelopeID)
	}
	if gotToolName != "glob" {
		t.Fatalf("unexpected tool name: %s", gotToolName)
	}
	if gotArgs == nil || gotArgs["pattern"] != "*.go" {
		t.Fatalf("unexpected tool args: %#v", gotArgs)
	}
}

func TestEvaluatePreToolPolicyHandlesMalformedInputGracefully(t *testing.T) {
	defer dhhooks.SetRegistry(nil)

	var gotArgs map[string]any
	dhhooks.SetRegistry(&dhhooks.Registry{
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			gotArgs = toolArgs
			return false, "blocked", nil
		},
	})

	allow, reason, err := evaluatePreToolPolicy(
		context.Background(),
		"sess-2",
		"env-2",
		message.ToolCall{Name: "bash", Input: `{"command":`},
	)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allow || reason != "blocked" {
		t.Fatalf("unexpected result allow=%t reason=%s", allow, reason)
	}
	if gotArgs != nil {
		t.Fatalf("expected nil args when json decode fails, got %#v", gotArgs)
	}
}
