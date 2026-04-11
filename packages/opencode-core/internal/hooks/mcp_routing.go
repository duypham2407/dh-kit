package hooks

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

func DefaultMcpRoutingHook(envelope types.ExecutionEnvelope, intent string) ([]string, []string, error) {
	normalizedIntent := intent
	if normalizedIntent == "browser" || normalizedIntent == "browser_diag" {
		return []string{"chrome-devtools", "playwright"}, []string{}, nil
	}
	if envelope.Lane == "migration" || normalizedIntent == "migration" {
		return []string{"augment_context_engine", "context7", "websearch"}, []string{}, nil
	}
	if envelope.Lane == "delivery" || normalizedIntent == "delivery" {
		return []string{"augment_context_engine", "context7"}, []string{}, nil
	}
	return []string{"augment_context_engine"}, []string{}, nil
}
