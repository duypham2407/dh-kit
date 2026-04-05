package hooks

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

func DefaultMcpRoutingHook(envelope types.ExecutionEnvelope, intent string) ([]string, []string, error) {
	_ = envelope
	if intent == "browser" {
		return []string{"chrome-devtools", "playwright"}, []string{}, nil
	}
	return []string{"augment_context_engine"}, []string{}, nil
}
