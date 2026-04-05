package agent

import (
	"strings"

	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

type preAnswerContext struct {
	intent        string
	toolsUsed     []string
	evidenceScore float64
}

func buildPreAnswerContext(userContent string, agentMessage message.Message, toolResults *message.Message) preAnswerContext {
	intent := inferIntent(userContent)
	toolsUsed := extractToolsUsed(agentMessage, toolResults)
	evidenceScore := inferEvidenceScore(intent, toolsUsed, toolResults)

	return preAnswerContext{
		intent:        intent,
		toolsUsed:     toolsUsed,
		evidenceScore: evidenceScore,
	}
}

func inferIntent(userContent string) string {
	text := strings.ToLower(strings.TrimSpace(userContent))
	if text == "" {
		return "general"
	}

	if strings.Contains(text, "refactor") || strings.Contains(text, "implement") || strings.Contains(text, "fix") || strings.Contains(text, "code") {
		return "code_change"
	}
	if strings.Contains(text, "test") || strings.Contains(text, "verify") || strings.Contains(text, "validate") {
		return "verification"
	}
	if strings.Contains(text, "search") || strings.Contains(text, "find") || strings.Contains(text, "where") || strings.Contains(text, "which file") {
		return "codebase_query"
	}
	return "general"
}

func extractToolsUsed(agentMessage message.Message, toolResults *message.Message) []string {
	seen := map[string]struct{}{}
	tools := make([]string, 0)

	for _, tc := range agentMessage.ToolCalls() {
		if tc.Name == "" {
			continue
		}
		if _, ok := seen[tc.Name]; !ok {
			seen[tc.Name] = struct{}{}
			tools = append(tools, tc.Name)
		}
	}

	if toolResults != nil {
		for _, tr := range toolResults.ToolResults() {
			if tr.Name == "" {
				continue
			}
			if _, ok := seen[tr.Name]; !ok {
				seen[tr.Name] = struct{}{}
				tools = append(tools, tr.Name)
			}
		}
	}

	return tools
}

func inferEvidenceScore(intent string, toolsUsed []string, toolResults *message.Message) float64 {
	if len(toolsUsed) == 0 {
		if intent == "general" {
			return 0.6
		}
		return 0.2
	}

	score := 0.4
	if len(toolsUsed) >= 2 {
		score += 0.2
	}

	if toolResults != nil {
		results := toolResults.ToolResults()
		total := len(results)
		if total > 0 {
			successes := 0
			for _, r := range results {
				if !r.IsError {
					successes++
				}
			}
			score += 0.4 * (float64(successes) / float64(total))
		}
	}

	if score > 1.0 {
		score = 1.0
	}
	return score
}
