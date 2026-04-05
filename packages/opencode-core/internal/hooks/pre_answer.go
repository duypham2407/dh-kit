package hooks

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

// DefaultPreAnswerHook is the stub used when no bridge DecisionReader is
// configured. Falls back to a simple evidence threshold check. Wire in
// bridge.DecisionReader to enforce TS-side policy decisions at process level.
func DefaultPreAnswerHook(envelope types.ExecutionEnvelope, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
	_ = envelope
	_ = intent
	_ = toolsUsed
	if evidenceScore < 0.5 {
		return false, "evidence score below 0.5 threshold (no bridge configured)", nil
	}
	return true, "answer allowed (no bridge configured)", nil
}
