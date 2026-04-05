package agent

import (
	"context"
	"encoding/json"

	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

func evaluatePreToolPolicy(ctx context.Context, sessionID, envelopeID string, toolCall message.ToolCall) (bool, string, error) {
	var toolArgs map[string]any
	_ = json.Unmarshal([]byte(toolCall.Input), &toolArgs)
	return dhhooks.OnPreToolExec(ctx, sessionID, envelopeID, toolCall.Name, toolArgs)
}
