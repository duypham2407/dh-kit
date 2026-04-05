package agent

import (
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/config"
)

func TestOrderedMcpServerNamesAppliesPriorityAndBlocklist(t *testing.T) {
	servers := map[string]config.MCPServer{
		"augment":  {},
		"context7": {},
		"browser":  {},
		"memory":   {},
	}
	priority := []string{"context7", "augment", "missing"}
	blocked := map[string]bool{"augment": true}

	got := orderedMcpServerNames(servers, priority, blocked)
	want := []string{"context7", "browser", "memory"}
	if len(got) != len(want) {
		t.Fatalf("unexpected length: got=%v want=%v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected order at %d: got=%v want=%v", i, got, want)
		}
	}
}

func TestOrderedMcpServerNamesFallsBackToAlphabeticalWhenNoPriority(t *testing.T) {
	servers := map[string]config.MCPServer{
		"zeta":  {},
		"alpha": {},
		"beta":  {},
	}

	got := orderedMcpServerNames(servers, nil, map[string]bool{})
	want := []string{"alpha", "beta", "zeta"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("unexpected order at %d: got=%v want=%v", i, got, want)
		}
	}
}
