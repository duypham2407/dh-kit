package hooks

import (
	"errors"
	"strings"
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

type testDecisionReader struct {
	decisionRow   *bridge.HookDecisionRow
	decisionErr   error
	modelProvider string
	modelID       string
	variantID     string
	modelFound    bool
	modelErr      error
}

func (r testDecisionReader) LatestDecision(sessionID, envelopeID, hookName string) (*bridge.HookDecisionRow, error) {
	return r.decisionRow, r.decisionErr
}

func (r testDecisionReader) LatestSessionState(sessionID string) (*types.DhSessionState, error) {
	return nil, nil
}

func (r testDecisionReader) LatestResolvedModel(sessionID, envelopeID string) (providerID, modelID, variantID string, ok bool, err error) {
	return r.modelProvider, r.modelID, r.variantID, r.modelFound, r.modelErr
}

func (r testDecisionReader) LatestSkills(sessionID, envelopeID string) ([]string, bool, error) {
	return nil, false, nil
}

func (r testDecisionReader) LatestMcps(sessionID, envelopeID string) ([]string, bool, error) {
	return nil, false, nil
}

func (r testDecisionReader) Close() error { return nil }

func TestBridgePreToolExecHookBlocksWhenDecisionIsBlock(t *testing.T) {
	hook := BridgePreToolExecHook(testDecisionReader{
		decisionRow: &bridge.HookDecisionRow{Decision: "block", Reason: "policy blocked"},
	})

	allow, reason, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1"}, "bash", map[string]any{"command": "rm -rf /"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allow {
		t.Fatal("expected allow=false for block decision")
	}
	if reason != "policy blocked" {
		t.Fatalf("unexpected reason: %s", reason)
	}
}

func TestBridgePreToolExecHookAllowsWhenNoDecision(t *testing.T) {
	hook := BridgePreToolExecHook(testDecisionReader{})

	allow, reason, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1"}, "glob", map[string]any{"pattern": "*.go"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allow {
		t.Fatal("expected allow=true when no decision")
	}
	if reason != "tool allowed (no TS decision)" {
		t.Fatalf("unexpected default reason: %s", reason)
	}
}

func TestBridgePreToolExecHookFailOpenOnReaderError(t *testing.T) {
	hook := BridgePreToolExecHook(testDecisionReader{decisionErr: errors.New("db unavailable")})

	allow, reason, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1"}, "glob", map[string]any{})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allow {
		t.Fatal("expected fail-open allow=true on reader error")
	}
	if !strings.Contains(reason, "bridge read error (fail-open)") {
		t.Fatalf("unexpected fail-open reason: %s", reason)
	}
}

func TestBridgePreAnswerHookAllowsWhenDecisionIsAllow(t *testing.T) {
	hook := BridgePreAnswerHook(testDecisionReader{
		decisionRow: &bridge.HookDecisionRow{Decision: "allow", Reason: "ready"},
	})

	allow, action, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1"}, "codebase", []string{"glob"}, 0.8)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allow {
		t.Fatal("expected allow=true for allow decision")
	}
	if action != "ready" {
		t.Fatalf("unexpected action: %s", action)
	}
}

func TestBridgePreAnswerHookFailOpenOnReaderError(t *testing.T) {
	hook := BridgePreAnswerHook(testDecisionReader{decisionErr: errors.New("read failed")})

	allow, action, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1"}, "codebase", nil, 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allow {
		t.Fatal("expected fail-open allow=true")
	}
	if !strings.Contains(action, "bridge read error (fail-open)") {
		t.Fatalf("unexpected fail-open action: %s", action)
	}
}

func TestBridgeModelOverrideHookUsesReaderWhenFound(t *testing.T) {
	hook := BridgeModelOverrideHook(testDecisionReader{
		modelProvider: "anthropic",
		modelID:       "claude-opus-4",
		variantID:     "high",
		modelFound:    true,
	})

	provider, model, variant, err := hook("quick-agent", "quick", "delivery")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "anthropic" || model != "claude-opus-4" || variant != "high" {
		t.Fatalf("unexpected override: %s/%s/%s", provider, model, variant)
	}
}

func TestBridgeModelOverrideHookFallsBackWhenNotFound(t *testing.T) {
	hook := BridgeModelOverrideHook(testDecisionReader{modelFound: false})

	provider, model, variant, err := hook("quick-agent", "quick", "delivery")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "" || model != "" || variant != "" {
		t.Fatalf("expected default no-op override, got %s/%s/%s", provider, model, variant)
	}
}

func TestBridgeModelOverrideHookFallsBackOnReaderError(t *testing.T) {
	hook := BridgeModelOverrideHook(testDecisionReader{modelErr: errors.New("sqlite unavailable")})

	provider, model, variant, err := hook("quick-agent", "quick", "delivery")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if provider != "" || model != "" || variant != "" {
		t.Fatalf("expected default no-op override on error, got %s/%s/%s", provider, model, variant)
	}
}

func TestBridgeSessionStateHookUsesReaderState(t *testing.T) {
	reader := testDecisionReaderWithState{state: &types.DhSessionState{SessionID: "sess-1", Lane: "delivery", CurrentStage: "delivery_review"}}
	hook := BridgeSessionStateHook(reader)

	state, err := hook("sess-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state.SessionID != "sess-1" || state.Lane != "delivery" || state.CurrentStage != "delivery_review" {
		t.Fatalf("unexpected state: %#v", state)
	}
}

func TestBridgeSessionStateHookFallsBackOnNilState(t *testing.T) {
	hook := BridgeSessionStateHook(testDecisionReaderWithState{state: nil})

	state, err := hook("sess-2")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state.SessionID != "sess-2" || state.Lane != "quick" || state.CurrentStage != "quick_intake" {
		t.Fatalf("unexpected fallback state: %#v", state)
	}
}

func TestBridgeSessionStateHookFallsBackOnReaderError(t *testing.T) {
	hook := BridgeSessionStateHook(testDecisionReaderWithState{err: errors.New("reader error")})

	state, err := hook("sess-3")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if state.SessionID != "sess-3" || state.Lane != "quick" || state.CurrentStage != "quick_intake" {
		t.Fatalf("unexpected fallback state: %#v", state)
	}
}

func TestBridgeSkillActivationHookFallsBackOnNotFound(t *testing.T) {
	hook := BridgeSkillActivationHook(testDecisionReaderWithSkills{found: false})

	skills, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1", Lane: "quick"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(skills) == 0 || skills[0] != "using-skills" {
		t.Fatalf("unexpected fallback skills: %#v", skills)
	}
}

func TestBridgeSkillActivationHookUsesReaderWhenFound(t *testing.T) {
	hook := BridgeSkillActivationHook(testDecisionReaderWithSkills{skills: []string{"tdd", "debugging"}, found: true})

	skills, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1", Lane: "delivery"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(skills) != 2 || skills[0] != "tdd" {
		t.Fatalf("unexpected skills: %#v", skills)
	}
}

func TestBridgeSkillActivationHookFallsBackOnReaderError(t *testing.T) {
	hook := BridgeSkillActivationHook(testDecisionReaderWithSkills{err: errors.New("reader failed")})

	skills, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1", Lane: "delivery"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(skills) == 0 || skills[0] != "using-skills" {
		t.Fatalf("unexpected fallback skills on error: %#v", skills)
	}
}

func TestBridgeMcpRoutingHookFallsBackOnNotFound(t *testing.T) {
	hook := BridgeMcpRoutingHook(testDecisionReaderWithMcps{found: false})

	mcps, blocked, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1", Lane: "quick"}, "browser")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mcps) == 0 || mcps[0] != "chrome-devtools" {
		t.Fatalf("unexpected fallback mcps: %#v", mcps)
	}
	if len(blocked) != 0 {
		t.Fatalf("expected empty blocked list, got %#v", blocked)
	}
}

func TestBridgeMcpRoutingHookUsesReaderWhenFound(t *testing.T) {
	hook := BridgeMcpRoutingHook(testDecisionReaderWithMcps{mcps: []string{"context7"}, found: true})

	mcps, blocked, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1", Lane: "delivery"}, "codebase")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mcps) != 1 || mcps[0] != "context7" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}
	if len(blocked) != 0 {
		t.Fatalf("expected empty blocked list, got %#v", blocked)
	}
}

func TestBridgeMcpRoutingHookFallsBackOnReaderError(t *testing.T) {
	hook := BridgeMcpRoutingHook(testDecisionReaderWithMcps{err: errors.New("reader failed")})

	mcps, blocked, err := hook(types.ExecutionEnvelope{SessionID: "s1", EnvelopeID: "e1", Lane: "delivery"}, "codebase")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(mcps) == 0 || mcps[0] != "augment_context_engine" {
		t.Fatalf("unexpected fallback mcps on error: %#v", mcps)
	}
	if len(blocked) != 0 {
		t.Fatalf("expected empty blocked list, got %#v", blocked)
	}
}

type testDecisionReaderWithState struct {
	state *types.DhSessionState
	err   error
}

func (r testDecisionReaderWithState) LatestDecision(string, string, string) (*bridge.HookDecisionRow, error) {
	return nil, nil
}
func (r testDecisionReaderWithState) LatestSessionState(string) (*types.DhSessionState, error) {
	return r.state, r.err
}
func (r testDecisionReaderWithState) LatestResolvedModel(string, string) (string, string, string, bool, error) {
	return "", "", "", false, nil
}
func (r testDecisionReaderWithState) LatestSkills(string, string) ([]string, bool, error) {
	return nil, false, nil
}
func (r testDecisionReaderWithState) LatestMcps(string, string) ([]string, bool, error) {
	return nil, false, nil
}
func (r testDecisionReaderWithState) Close() error { return nil }

type testDecisionReaderWithSkills struct {
	skills []string
	found  bool
	err    error
}

func (r testDecisionReaderWithSkills) LatestDecision(string, string, string) (*bridge.HookDecisionRow, error) {
	return nil, nil
}
func (r testDecisionReaderWithSkills) LatestSessionState(string) (*types.DhSessionState, error) {
	return nil, nil
}
func (r testDecisionReaderWithSkills) LatestResolvedModel(string, string) (string, string, string, bool, error) {
	return "", "", "", false, nil
}
func (r testDecisionReaderWithSkills) LatestSkills(string, string) ([]string, bool, error) {
	return r.skills, r.found, r.err
}
func (r testDecisionReaderWithSkills) LatestMcps(string, string) ([]string, bool, error) {
	return nil, false, nil
}
func (r testDecisionReaderWithSkills) Close() error { return nil }

type testDecisionReaderWithMcps struct {
	mcps  []string
	found bool
	err   error
}

func (r testDecisionReaderWithMcps) LatestDecision(string, string, string) (*bridge.HookDecisionRow, error) {
	return nil, nil
}
func (r testDecisionReaderWithMcps) LatestSessionState(string) (*types.DhSessionState, error) {
	return nil, nil
}
func (r testDecisionReaderWithMcps) LatestResolvedModel(string, string) (string, string, string, bool, error) {
	return "", "", "", false, nil
}
func (r testDecisionReaderWithMcps) LatestSkills(string, string) ([]string, bool, error) {
	return nil, false, nil
}
func (r testDecisionReaderWithMcps) LatestMcps(string, string) ([]string, bool, error) {
	return r.mcps, r.found, r.err
}
func (r testDecisionReaderWithMcps) Close() error { return nil }
