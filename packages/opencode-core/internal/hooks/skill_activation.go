package hooks

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

func DefaultSkillActivationHook(envelope types.ExecutionEnvelope) ([]string, error) {
	if envelope.Lane == "quick" {
		return []string{"using-skills"}, nil
	}
	return []string{"using-skills", "verification-before-completion"}, nil
}
