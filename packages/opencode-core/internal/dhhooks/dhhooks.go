// Package dhhooks provides the central hook dispatch point for dh's runtime hooks.
// Upstream vendored code calls into this package at identified injection points.
// The actual hook implementations are registered at startup via SetRegistry.
package dhhooks

import (
	"context"
	"sync"
)

// Registry holds all dh hook functions.
type Registry struct {
	ModelOverride   func(agentID, role, lane string) (provider, model, variant string, err error)
	PreToolExec     func(sessionID, envelopeID, toolName string, toolArgs map[string]any) (allow bool, reason string, err error)
	PreAnswer       func(sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (allow bool, action string, err error)
	SessionState    func(sessionID string) (state map[string]any, err error)
	SkillActivation func(sessionID, envelopeID, lane, role string) (skills []string, err error)
	McpRouting      func(sessionID, envelopeID, intent string) (priority []string, blocked []string, err error)
}

var (
	registry *Registry
	mu       sync.RWMutex
)

// SetRegistry installs the hook registry. Call this at startup before any agent runs.
func SetRegistry(r *Registry) {
	mu.Lock()
	defer mu.Unlock()
	registry = r
}

// GetRegistry returns the current hook registry (may be nil if not set).
func GetRegistry() *Registry {
	mu.RLock()
	defer mu.RUnlock()
	return registry
}

// --- Hook dispatch functions called from upstream injection points ---

// OnModelOverride is called from provider.NewProvider() to let dh override model selection.
// Returns empty strings if no override is active.
func OnModelOverride(agentID, role, lane string) (provider, model, variant string, err error) {
	r := GetRegistry()
	if r == nil || r.ModelOverride == nil {
		return "", "", "", nil
	}
	return r.ModelOverride(agentID, role, lane)
}

// OnPreToolExec is called from agent.streamAndHandleEvents() before tool.Run().
// Returns (true, "") if no hook or hook allows.
func OnPreToolExec(ctx context.Context, sessionID, envelopeID, toolName string, toolArgs map[string]any) (allow bool, reason string, err error) {
	r := GetRegistry()
	if r == nil || r.PreToolExec == nil {
		return true, "", nil
	}
	return r.PreToolExec(sessionID, envelopeID, toolName, toolArgs)
}

// OnPreAnswer is called from agent.processGeneration() before the final response.
// Returns (true, "") if no hook or hook allows.
func OnPreAnswer(ctx context.Context, sessionID, envelopeID, intent string, toolsUsed []string, evidenceScore float64) (allow bool, action string, err error) {
	r := GetRegistry()
	if r == nil || r.PreAnswer == nil {
		return true, "", nil
	}
	return r.PreAnswer(sessionID, envelopeID, intent, toolsUsed, evidenceScore)
}

// OnSessionCreate is called from session.Create() after a new session is created.
// Returns nil state if no hook is configured.
func OnSessionCreate(ctx context.Context, sessionID string) (state map[string]any, err error) {
	r := GetRegistry()
	if r == nil || r.SessionState == nil {
		return nil, nil
	}
	return r.SessionState(sessionID)
}

// OnSkillActivation is called from the prompt builder to get active skills.
// Returns nil if no hook is configured.
func OnSkillActivation(ctx context.Context, sessionID, envelopeID, lane, role string) (skills []string, err error) {
	r := GetRegistry()
	if r == nil || r.SkillActivation == nil {
		return nil, nil
	}
	return r.SkillActivation(sessionID, envelopeID, lane, role)
}

// OnMcpRouting is called from GetMcpTools() to filter/prioritize MCP servers.
// Returns empty if no hook is configured.
func OnMcpRouting(ctx context.Context, sessionID, envelopeID, intent string) (priority []string, blocked []string, err error) {
	r := GetRegistry()
	if r == nil || r.McpRouting == nil {
		return nil, nil, nil
	}
	return r.McpRouting(sessionID, envelopeID, intent)
}
