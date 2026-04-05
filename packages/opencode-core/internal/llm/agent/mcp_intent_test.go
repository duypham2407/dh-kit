package agent

import (
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/session"
)

func TestInferMcpRoutingIntentWithoutSession(t *testing.T) {
	if got := inferMcpRoutingIntent(""); got != "general" {
		t.Fatalf("expected general for empty session, got %s", got)
	}
}

func TestInferMcpRoutingIntentUsesLane(t *testing.T) {
	session.DeleteDhSessionState("sess-intent")
	t.Cleanup(func() { session.DeleteDhSessionState("sess-intent") })

	session.SetDhSessionStateFromHook("sess-intent", map[string]any{"lane": "delivery", "currentStage": "delivery_review"})
	if got := inferMcpRoutingIntent("sess-intent"); got != "delivery" {
		t.Fatalf("expected delivery, got %s", got)
	}
}

func TestInferMcpRoutingIntentPrefersMigrationSignals(t *testing.T) {
	session.DeleteDhSessionState("sess-migration")
	t.Cleanup(func() { session.DeleteDhSessionState("sess-migration") })

	session.SetDhSessionStateFromHook("sess-migration", map[string]any{"lane": "quick", "currentStage": "migration_verify"})
	if got := inferMcpRoutingIntent("sess-migration"); got != "migration" {
		t.Fatalf("expected migration from stage signal, got %s", got)
	}
}

func TestInferMcpRoutingIntentFallsBackToGeneral(t *testing.T) {
	session.DeleteDhSessionState("sess-general")
	t.Cleanup(func() { session.DeleteDhSessionState("sess-general") })

	session.SetDhSessionStateFromHook("sess-general", map[string]any{"lane": "unknown", "currentStage": "something_else"})
	if got := inferMcpRoutingIntent("sess-general"); got != "general" {
		t.Fatalf("expected general fallback, got %s", got)
	}
}
