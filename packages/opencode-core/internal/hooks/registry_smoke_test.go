package hooks

import (
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

type stubDecisionReader struct{}

func (stubDecisionReader) LatestDecision(sessionID, envelopeID, hookName string) (*bridge.HookDecisionRow, error) {
	switch hookName {
	case "pre_tool_exec":
		return &bridge.HookDecisionRow{Decision: "block", Reason: "tool blocked by stub"}, nil
	case "pre_answer":
		return &bridge.HookDecisionRow{Decision: "allow", Reason: "answer allowed by stub"}, nil
	default:
		return nil, nil
	}
}

func (stubDecisionReader) LatestSessionState(sessionID string) (*types.DhSessionState, error) {
	return &types.DhSessionState{
		SessionID:            sessionID,
		Lane:                 "delivery",
		LaneLocked:           true,
		CurrentStage:         "delivery_review",
		SemanticMode:         "auto",
		ToolEnforcementLevel: "very-hard",
		ActiveWorkItemIDs:    []string{"w1", "w2"},
	}, nil
}

func (stubDecisionReader) LatestResolvedModel(sessionID, envelopeID string) (string, string, string, bool, error) {
	return "anthropic", "claude-opus", "high-reasoning", true, nil
}

func (stubDecisionReader) LatestSkills(sessionID, envelopeID string) ([]string, bool, error) {
	return []string{"using-skills", "verification-before-completion"}, true, nil
}

func (stubDecisionReader) LatestMcps(sessionID, envelopeID string) ([]string, bool, error) {
	return []string{"augment_context_engine", "context7"}, true, nil
}

func (stubDecisionReader) LatestMcpRoutingDecision(sessionID, envelopeID string) (*bridge.McpRoutingDecisionRow, bool, error) {
	return &bridge.McpRoutingDecisionRow{Mcps: []string{"augment_context_engine", "context7"}, Blocked: []string{}}, true, nil
}

func (stubDecisionReader) Close() error { return nil }

func TestNewRegistryWithDecisionReaderRegistersAllHooks(t *testing.T) {
	registry := NewRegistryWithDecisionReader(stubDecisionReader{})
	envelope := types.ExecutionEnvelope{SessionID: "sess-1", EnvelopeID: "env-1", Lane: "delivery", AgentID: "quick-agent"}

	state, err := registry.SessionState("sess-1")
	if err != nil {
		t.Fatalf("session state hook: %v", err)
	}
	if state.Lane != "delivery" || state.CurrentStage != "delivery_review" {
		t.Fatalf("unexpected session state: %#v", state)
	}

	provider, model, variant, err := registry.ModelOverride("quick-agent", "quick", "delivery")
	if err != nil {
		t.Fatalf("model override hook: %v", err)
	}
	if provider != "anthropic" || model != "claude-opus" || variant != "high-reasoning" {
		t.Fatalf("unexpected model override: %s/%s/%s", provider, model, variant)
	}

	allowedTool, toolReason, err := registry.PreToolExec(envelope, "bash", map[string]any{"command": "ls"})
	if err != nil {
		t.Fatalf("pre-tool hook: %v", err)
	}
	if allowedTool || toolReason != "tool blocked by stub" {
		t.Fatalf("unexpected pre-tool result: allow=%t reason=%s", allowedTool, toolReason)
	}

	allowedAnswer, answerAction, err := registry.PreAnswer(envelope, "codebase", []string{"glob"}, 0.9)
	if err != nil {
		t.Fatalf("pre-answer hook: %v", err)
	}
	if !allowedAnswer || answerAction != "answer allowed by stub" {
		t.Fatalf("unexpected pre-answer result: allow=%t action=%s", allowedAnswer, answerAction)
	}

	skills, err := registry.SkillActivation(envelope)
	if err != nil {
		t.Fatalf("skill activation hook: %v", err)
	}
	if len(skills) != 2 || skills[0] != "using-skills" {
		t.Fatalf("unexpected skills: %#v", skills)
	}

	mcps, blocked, err := registry.McpRouting(envelope, "codebase")
	if err != nil {
		t.Fatalf("mcp routing hook: %v", err)
	}
	if len(mcps) != 2 || mcps[0] != "augment_context_engine" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}
	if len(blocked) != 0 {
		t.Fatalf("expected no blocked mcps, got %#v", blocked)
	}
}
