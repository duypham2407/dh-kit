package agent

import (
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/message"
)

func TestInferIntent(t *testing.T) {
	if got := inferIntent("Please refactor this function"); got != "code_change" {
		t.Fatalf("expected code_change, got %s", got)
	}
	if got := inferIntent("find where this config is loaded"); got != "codebase_query" {
		t.Fatalf("expected codebase_query, got %s", got)
	}
	if got := inferIntent("run tests and verify output"); got != "verification" {
		t.Fatalf("expected verification, got %s", got)
	}
	if got := inferIntent("hello there"); got != "general" {
		t.Fatalf("expected general, got %s", got)
	}
}

func TestExtractToolsUsed(t *testing.T) {
	agentMsg := message.Message{Parts: []message.ContentPart{
		message.ToolCall{ID: "1", Name: "glob"},
		message.ToolCall{ID: "2", Name: "grep"},
		message.ToolCall{ID: "3", Name: "glob"},
	}}
	toolResults := &message.Message{Parts: []message.ContentPart{
		message.ToolResult{ToolCallID: "1", Name: "glob", IsError: false},
		message.ToolResult{ToolCallID: "2", Name: "bash", IsError: false},
	}}

	tools := extractToolsUsed(agentMsg, toolResults)
	if len(tools) != 3 {
		t.Fatalf("expected 3 unique tools, got %d (%#v)", len(tools), tools)
	}
	if tools[0] != "glob" || tools[1] != "grep" || tools[2] != "bash" {
		t.Fatalf("unexpected tool order/content: %#v", tools)
	}
}

func TestInferEvidenceScore(t *testing.T) {
	if got := inferEvidenceScore("code_change", nil, nil); got != 0.2 {
		t.Fatalf("expected 0.2 no-tools score, got %v", got)
	}
	if got := inferEvidenceScore("general", nil, nil); got != 0.6 {
		t.Fatalf("expected 0.6 general no-tools score, got %v", got)
	}

	results := &message.Message{Parts: []message.ContentPart{
		message.ToolResult{Name: "glob", IsError: false},
		message.ToolResult{Name: "grep", IsError: true},
	}}
	score := inferEvidenceScore("codebase_query", []string{"glob", "grep"}, results)
	if score <= 0.7 || score >= 0.9 {
		t.Fatalf("expected score in (0.7, 0.9), got %v", score)
	}
}

func TestBuildPreAnswerContext(t *testing.T) {
	agentMsg := message.Message{Parts: []message.ContentPart{
		message.ToolCall{ID: "1", Name: "glob"},
	}}
	results := &message.Message{Parts: []message.ContentPart{
		message.ToolResult{ToolCallID: "1", Name: "glob", IsError: false},
	}}

	ctx := buildPreAnswerContext("find config references", agentMsg, results)
	if ctx.intent != "codebase_query" {
		t.Fatalf("unexpected intent: %s", ctx.intent)
	}
	if len(ctx.toolsUsed) != 1 || ctx.toolsUsed[0] != "glob" {
		t.Fatalf("unexpected toolsUsed: %#v", ctx.toolsUsed)
	}
	if ctx.evidenceScore <= 0.79 {
		t.Fatalf("expected evidence score > 0.79, got %v", ctx.evidenceScore)
	}
}
