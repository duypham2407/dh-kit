package hooks

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

// DefaultPreToolExecHook is the stub used when no bridge DecisionReader is
// configured. It permits all tools. Wire in bridge.DecisionReader to enforce
// TS-side policy decisions at process level.
func DefaultPreToolExecHook(envelope types.ExecutionEnvelope, toolName string, toolArgs map[string]any) (bool, string, error) {
	_ = envelope
	_ = toolArgs
	return true, "tool allowed (no bridge configured)", nil
}
