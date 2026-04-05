package types

type ExecutionEnvelope struct {
	SessionID     string
	EnvelopeID    string
	Lane          string
	Role          string
	AgentID       string
	Stage         string
	RequiredTools []string
	ProviderID    string
	ModelID       string
	VariantID     string
	ActiveSkills  []string
	ActiveMcps    []string
	SemanticMode  string
}

type DhSessionState struct {
	SessionID            string
	Lane                 string
	LaneLocked           bool
	CurrentStage         string
	SemanticMode         string
	ToolEnforcementLevel string
	ActiveWorkItemIDs    []string
}

type HookInvocationLog struct {
	HookName string
	Decision string
	Reason   string
}
