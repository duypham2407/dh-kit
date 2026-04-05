// Package bridge provides SQLite-backed hook implementations that read
// enforcement decisions written by the TypeScript policy layer.
//
// This is the Go side of the TS ↔ Go enforcement bridge. It reads the
// latest HookInvocationLog entry from the shared SQLite database for a
// given (session_id, envelope_id, hook_name) tuple and uses that decision
// to allow or block the operation.
//
// Why SQLite and not a network call?
// - The single-binary constraint means no sidecar. Go and TS share one DB.
// - WAL mode means the Go reader and TS writer can operate concurrently.
// - Fall-through to permissive defaults if TS has not written a decision
//   yet, preserving backward compatibility during incremental rollout.
//
// Build note: requires `github.com/ncruces/go-sqlite3` (pure Go, Wasm-based).
// Until a driver is chosen and go.sum is committed, this file provides the
// interface and schema constants only. The actual DB calls are stubbed with
// build tags so the package compiles without a driver dependency.

package bridge

import "github.com/duypham93/dh/packages/opencode-core/pkg/types"

const (
	// DBPathTemplate is the relative path under the project root where dh
	// places its SQLite database. Must stay in sync with
	// packages/storage/src/sqlite/db.ts resolveSqliteDbPath.
	DBPathTemplate = ".dh/sqlite/dh.db"

	// HookTableName is the table written by the TS HookInvocationLogsRepo.
	HookTableName = "hook_invocation_logs"
)

// HookDecisionRow mirrors the columns the Go side needs from hook_invocation_logs.
type HookDecisionRow struct {
	ID         string
	SessionID  string
	EnvelopeID string
	HookName   string
	Decision   string // "allow" | "block" | "modify"
	Reason     string
}

// DecisionReader is the interface Go hook implementations use to query
// TS-side enforcement decisions. Concrete implementations are in
// sqlite_reader.go (requires a build tag to compile with a driver).
type DecisionReader interface {
	// LatestDecision returns the most recent TS decision for the given
	// session, envelope, and hook name. Returns (nil, nil) when no decision
	// has been written yet.
	LatestDecision(sessionID, envelopeID, hookName string) (*HookDecisionRow, error)
	LatestSessionState(sessionID string) (*types.DhSessionState, error)
	LatestResolvedModel(sessionID, envelopeID string) (providerID, modelID, variantID string, ok bool, err error)
	LatestSkills(sessionID, envelopeID string) ([]string, bool, error)
	LatestMcps(sessionID, envelopeID string) ([]string, bool, error)
	Close() error
}

// AllowByDefault is a no-op DecisionReader used when the DB path is not
// configured or during test runs that do not want DB interaction.
type AllowByDefault struct{}

func (AllowByDefault) LatestDecision(_, _, _ string) (*HookDecisionRow, error) {
	return nil, nil
}

func (AllowByDefault) LatestSessionState(_ string) (*types.DhSessionState, error) {
	return nil, nil
}

func (AllowByDefault) LatestResolvedModel(_, _ string) (string, string, string, bool, error) {
	return "", "", "", false, nil
}

func (AllowByDefault) LatestSkills(_, _ string) ([]string, bool, error) {
	return nil, false, nil
}

func (AllowByDefault) LatestMcps(_, _ string) ([]string, bool, error) {
	return nil, false, nil
}

func (AllowByDefault) Close() error { return nil }

// Evaluate converts a *HookDecisionRow (possibly nil) to a (allow, reason) pair.
// If row is nil (no TS decision yet), falls back to the provided default.
func Evaluate(row *HookDecisionRow, defaultAllow bool, defaultReason string) (bool, string) {
	if row == nil {
		return defaultAllow, defaultReason
	}
	return row.Decision != "block", row.Reason
}
