package hooks

func DefaultModelOverrideHook(agentID string, role string, lane string) (string, string, string, error) {
	_ = agentID
	_ = role
	_ = lane
	// Empty values mean "no override"; caller should keep resolved config model.
	return "", "", "", nil
}
