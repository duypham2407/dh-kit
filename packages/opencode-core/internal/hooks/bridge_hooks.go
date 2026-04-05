// Package hooks provides both default (stub) and bridge-wired hook implementations.
//
// Bridge-wired hooks (BridgePreToolExecHook, BridgePreAnswerHook) accept a
// bridge.DecisionReader and query the TS-written SQLite decisions before acting.
// They are the production path once a SQLite driver is wired in.
//
// Default hooks are the fallback when no bridge is configured.

package hooks

import (
	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

// BridgePreToolExecHook returns a PreToolExecHook that reads TS enforcement
// decisions from the SQLite database via the provided DecisionReader.
//
// Behaviour:
//   - If the TS layer has written a "block" decision for this (session, envelope,
//     hook), the tool call is rejected with the recorded reason.
//   - If no decision has been written yet, falls back to allowAll.
//   - All calls are transparent to the caller — errors from the reader are
//     logged but do not cause a hard failure (fail-open).
func BridgePreToolExecHook(reader bridge.DecisionReader) PreToolExecHook {
	return func(envelope types.ExecutionEnvelope, toolName string, toolArgs map[string]any) (bool, string, error) {
		row, err := reader.LatestDecision(envelope.SessionID, envelope.EnvelopeID, "pre_tool_exec")
		if err != nil {
			// Fail-open: log and allow if the DB is unavailable
			return true, "bridge read error (fail-open): " + err.Error(), nil
		}
		allow, reason := bridge.Evaluate(row, true, "tool allowed (no TS decision)")
		_ = toolName
		_ = toolArgs
		return allow, reason, nil
	}
}

// BridgePreAnswerHook returns a PreAnswerHook that reads TS enforcement
// decisions from the SQLite database via the provided DecisionReader.
func BridgePreAnswerHook(reader bridge.DecisionReader) PreAnswerHook {
	return func(envelope types.ExecutionEnvelope, intent string, toolsUsed []string, evidenceScore float64) (bool, string, error) {
		row, err := reader.LatestDecision(envelope.SessionID, envelope.EnvelopeID, "pre_answer")
		if err != nil {
			return true, "bridge read error (fail-open): " + err.Error(), nil
		}
		allow, reason := bridge.Evaluate(row, true, "answer allowed (no TS decision)")
		_ = intent
		_ = toolsUsed
		_ = evidenceScore
		return allow, reason, nil
	}
}
