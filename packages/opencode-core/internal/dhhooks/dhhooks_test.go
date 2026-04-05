package dhhooks

import (
	"context"
	"testing"
)

func TestDispatchDefaultsWhenNoRegistry(t *testing.T) {
	SetRegistry(nil)

	allowTool, _, err := OnPreToolExec(context.Background(), "s", "e", "bash", map[string]any{"command": "ls"})
	if err != nil {
		t.Fatalf("unexpected error for pre-tool default: %v", err)
	}
	if !allowTool {
		t.Fatal("expected pre-tool default allow=true")
	}

	allowAnswer, _, err := OnPreAnswer(context.Background(), "s", "e", "", nil, 0)
	if err != nil {
		t.Fatalf("unexpected error for pre-answer default: %v", err)
	}
	if !allowAnswer {
		t.Fatal("expected pre-answer default allow=true")
	}

	state, err := OnSessionCreate(context.Background(), "s")
	if err != nil {
		t.Fatalf("unexpected error for session default: %v", err)
	}
	if state != nil {
		t.Fatalf("expected nil session state by default, got %#v", state)
	}

	skills, err := OnSkillActivation(context.Background(), "s", "e", "quick", "coder")
	if err != nil {
		t.Fatalf("unexpected error for skills default: %v", err)
	}
	if skills != nil {
		t.Fatalf("expected nil skills by default, got %#v", skills)
	}

	priority, blocked, err := OnMcpRouting(context.Background(), "s", "e", "codebase")
	if err != nil {
		t.Fatalf("unexpected error for mcp default: %v", err)
	}
	if priority != nil || blocked != nil {
		t.Fatalf("expected nil mcp defaults, got priority=%#v blocked=%#v", priority, blocked)
	}
}

func TestDispatchForwardsEnvelopeFields(t *testing.T) {
	defer SetRegistry(nil)

	var gotSessionID, gotEnvelopeID string
	SetRegistry(&Registry{
		PreToolExec: func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (bool, string, error) {
			gotSessionID = sessionID
			gotEnvelopeID = envelopeID
			if toolName != "glob" {
				t.Fatalf("unexpected tool name: %s", toolName)
			}
			return false, "blocked", nil
		},
	})

	allow, reason, err := OnPreToolExec(context.Background(), "sess-1", "env-1", "glob", map[string]any{"pattern": "*.go"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allow || reason != "blocked" {
		t.Fatalf("unexpected result allow=%t reason=%s", allow, reason)
	}
	if gotSessionID != "sess-1" || gotEnvelopeID != "env-1" {
		t.Fatalf("expected forwarded ids sess-1/env-1, got %s/%s", gotSessionID, gotEnvelopeID)
	}
}

func TestDispatchForwardsEnvelopeForSkillAndMcp(t *testing.T) {
	defer SetRegistry(nil)

	var skillEnv string
	var mcpEnv string
	SetRegistry(&Registry{
		SkillActivation: func(sessionID, envelopeID, lane, role string) ([]string, error) {
			skillEnv = envelopeID
			return []string{"using-skills"}, nil
		},
		McpRouting: func(sessionID, envelopeID, intent string) ([]string, []string, error) {
			mcpEnv = envelopeID
			return []string{"context7"}, nil, nil
		},
	})

	skills, err := OnSkillActivation(context.Background(), "sess-2", "env-skill", "quick", "coder")
	if err != nil {
		t.Fatalf("unexpected skill error: %v", err)
	}
	if len(skills) != 1 || skills[0] != "using-skills" {
		t.Fatalf("unexpected skills: %#v", skills)
	}

	mcps, _, err := OnMcpRouting(context.Background(), "sess-2", "env-mcp", "codebase")
	if err != nil {
		t.Fatalf("unexpected mcp error: %v", err)
	}
	if len(mcps) != 1 || mcps[0] != "context7" {
		t.Fatalf("unexpected mcps: %#v", mcps)
	}

	if skillEnv != "env-skill" {
		t.Fatalf("expected skill envelope env-skill, got %s", skillEnv)
	}
	if mcpEnv != "env-mcp" {
		t.Fatalf("expected mcp envelope env-mcp, got %s", mcpEnv)
	}
}
