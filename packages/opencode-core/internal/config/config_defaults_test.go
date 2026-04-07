package config

import (
	"os"
	"strings"
	"testing"

	"github.com/duypham93/dh/packages/opencode-core/internal/llm/models"
)

// clearAllProviderEnvVars unsets every env var that setDefaultModelForAgent
// checks so the function sees zero credentials.
func clearAllProviderEnvVars(t *testing.T) {
	t.Helper()
	envVars := []string{
		"ANTHROPIC_API_KEY",
		"OPENAI_API_KEY",
		"GEMINI_API_KEY",
		"GROQ_API_KEY",
		"OPENROUTER_API_KEY",
		"AZURE_OPENAI_API_KEY",
		// AWS credentials (hasAWSCredentials checks all of these)
		"AWS_ACCESS_KEY_ID",
		"AWS_SECRET_ACCESS_KEY",
		"AWS_SESSION_TOKEN",
		"AWS_PROFILE",
		"AWS_DEFAULT_PROFILE",
		"AWS_REGION",
		"AWS_DEFAULT_REGION",
		"AWS_CONTAINER_CREDENTIALS_RELATIVE_URI",
		"AWS_CONTAINER_CREDENTIALS_FULL_URI",
		// VertexAI credentials
		"GOOGLE_APPLICATION_CREDENTIALS",
		"VERTEX_AI_PROJECT",
		"VERTEXAI_PROJECT",
		"VERTEXAI_LOCATION",
		"GOOGLE_CLOUD_PROJECT",
		"GOOGLE_CLOUD_REGION",
		"GOOGLE_CLOUD_LOCATION",
		// Copilot / GitHub
		"COPILOT_TOKEN",
		"GITHUB_TOKEN",
	}
	for _, key := range envVars {
		old := os.Getenv(key)
		if err := os.Unsetenv(key); err != nil {
			t.Fatalf("unsetenv %s: %v", key, err)
		}
		t.Cleanup(func() { _ = os.Setenv(key, old) })
	}
}

func TestEnsureDefaultAgentsPopulatesMissingAgents(t *testing.T) {
	origCfg := cfg
	t.Cleanup(func() { cfg = origCfg })

	oldOpenAI := os.Getenv("OPENAI_API_KEY")
	if err := os.Setenv("OPENAI_API_KEY", "test-openai-key"); err != nil {
		t.Fatalf("set OPENAI_API_KEY: %v", err)
	}
	t.Cleanup(func() { _ = os.Setenv("OPENAI_API_KEY", oldOpenAI) })

	cfg = &Config{
		Providers: make(map[models.ModelProvider]Provider),
		Agents:    map[AgentName]Agent{},
	}

	if err := ensureDefaultAgents(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	for _, agentName := range []AgentName{AgentCoder, AgentSummarizer, AgentTask, AgentTitle} {
		agentCfg, ok := cfg.Agents[agentName]
		if !ok {
			t.Fatalf("expected default agent config for %s", agentName)
		}
		if agentCfg.Model == "" {
			t.Fatalf("expected model for %s", agentName)
		}
	}
	if cfg.Agents[AgentCoder].Model != models.GPT41 {
		t.Fatalf("expected coder default GPT41, got %s", cfg.Agents[AgentCoder].Model)
	}
	if cfg.Agents[AgentTitle].Model != models.GPT41Mini {
		t.Fatalf("expected title default GPT41Mini, got %s", cfg.Agents[AgentTitle].Model)
	}
}

func TestEnsureDefaultAgentsPreservesExistingAgent(t *testing.T) {
	origCfg := cfg
	t.Cleanup(func() { cfg = origCfg })

	oldOpenAI := os.Getenv("OPENAI_API_KEY")
	if err := os.Setenv("OPENAI_API_KEY", "test-openai-key"); err != nil {
		t.Fatalf("set OPENAI_API_KEY: %v", err)
	}
	t.Cleanup(func() { _ = os.Setenv("OPENAI_API_KEY", oldOpenAI) })

	cfg = &Config{
		Providers: make(map[models.ModelProvider]Provider),
		Agents: map[AgentName]Agent{
			AgentCoder: {
				Model:     models.GPT41Mini,
				MaxTokens: 123,
			},
		},
	}

	if err := ensureDefaultAgents(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Agents[AgentCoder].Model != models.GPT41Mini {
		t.Fatalf("expected existing coder model to be preserved, got %s", cfg.Agents[AgentCoder].Model)
	}
	if cfg.Agents[AgentCoder].MaxTokens != 123 {
		t.Fatalf("expected existing coder max tokens to be preserved, got %d", cfg.Agents[AgentCoder].MaxTokens)
	}
}

func TestEnsureDefaultAgentsReturnsErrorWhenNoProviders(t *testing.T) {
	origCfg := cfg
	t.Cleanup(func() { cfg = origCfg })

	clearAllProviderEnvVars(t)

	cfg = &Config{
		Providers: make(map[models.ModelProvider]Provider),
		Agents:    map[AgentName]Agent{},
	}

	err := ensureDefaultAgents()

	// If Copilot credentials exist on the filesystem (hosts.json / apps.json),
	// the function will succeed even without env vars. Skip in that case.
	if err == nil {
		// Verify that agents were actually populated (copilot credentials on disk)
		if _, ok := cfg.Agents[AgentCoder]; !ok {
			t.Fatal("no error returned but coder agent was not populated")
		}
		t.Skip("copilot credentials found on filesystem — cannot test no-provider path")
	}

	if !strings.Contains(err.Error(), "no LLM provider credentials found") {
		t.Fatalf("expected actionable error message, got: %v", err)
	}
	if !strings.Contains(err.Error(), "coder") {
		t.Fatalf("expected error to mention the missing 'coder' agent, got: %v", err)
	}
	if !strings.Contains(err.Error(), "dh doctor") {
		t.Fatalf("expected error to mention 'dh doctor', got: %v", err)
	}
}

func TestEnsureDefaultAgentsNilCfgReturnsNil(t *testing.T) {
	origCfg := cfg
	t.Cleanup(func() { cfg = origCfg })

	cfg = nil
	if err := ensureDefaultAgents(); err != nil {
		t.Fatalf("expected nil error for nil cfg, got: %v", err)
	}
}

func TestJoinAgentNames(t *testing.T) {
	tests := []struct {
		input    []AgentName
		expected string
	}{
		{[]AgentName{AgentCoder}, "coder"},
		{[]AgentName{AgentCoder, AgentTitle}, "coder, title"},
		{[]AgentName{}, ""},
	}
	for _, tt := range tests {
		got := joinAgentNames(tt.input)
		if got != tt.expected {
			t.Errorf("joinAgentNames(%v) = %q, want %q", tt.input, got, tt.expected)
		}
	}
}
