package bridge

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"path/filepath"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

// SQLiteDecisionReader reads the latest TS-written hook decision from the
// shared dh SQLite database.
type SQLiteDecisionReader struct {
	db *sql.DB
}

type rawHookLogRow struct {
	ID         string
	SessionID  string
	EnvelopeID string
	HookName   string
	Decision   string
	Reason     string
	OutputJSON string
}

// NewSQLiteDecisionReader opens the dh SQLite database under repoRoot.
func NewSQLiteDecisionReader(repoRoot string) (*SQLiteDecisionReader, error) {
	dbPath := filepath.Join(repoRoot, DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite db: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping sqlite db: %w", err)
	}
	// Match the WAL journal mode used by the TS writer for safe concurrent access.
	if _, err := db.Exec("PRAGMA journal_mode = WAL"); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("set WAL mode: %w", err)
	}
	return &SQLiteDecisionReader{db: db}, nil
}

func (r *SQLiteDecisionReader) LatestDecision(sessionID, envelopeID, hookName string) (*HookDecisionRow, error) {
	row := r.db.QueryRow(
		`SELECT id, session_id, envelope_id, hook_name, decision, reason, output_json
		 FROM hook_invocation_logs
		 WHERE session_id = ?
		   AND hook_name = ?
		   AND (
			   (? <> '' AND envelope_id IN (?, session_id))
			   OR (? = '' AND envelope_id = session_id)
		   )
		 ORDER BY CASE WHEN envelope_id = ? THEN 0 ELSE 1 END, timestamp DESC
		 LIMIT 1`,
		sessionID,
		hookName,
		envelopeID,
		envelopeID,
		envelopeID,
		envelopeID,
	)

	var raw rawHookLogRow
	if err := row.Scan(
		&raw.ID,
		&raw.SessionID,
		&raw.EnvelopeID,
		&raw.HookName,
		&raw.Decision,
		&raw.Reason,
		&raw.OutputJSON,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query latest decision: %w", err)
	}

	return &HookDecisionRow{
		ID:         raw.ID,
		SessionID:  raw.SessionID,
		EnvelopeID: raw.EnvelopeID,
		HookName:   raw.HookName,
		Decision:   raw.Decision,
		Reason:     raw.Reason,
	}, nil
}

func (r *SQLiteDecisionReader) LatestOutput(sessionID, envelopeID, hookName string) (map[string]any, error) {
	row := r.db.QueryRow(
		`SELECT output_json
		 FROM hook_invocation_logs
		 WHERE session_id = ?
		   AND hook_name = ?
		   AND (
			   (? <> '' AND envelope_id IN (?, session_id))
			   OR (? = '' AND envelope_id = session_id)
		   )
		 ORDER BY CASE WHEN envelope_id = ? THEN 0 ELSE 1 END, timestamp DESC
		 LIMIT 1`,
		sessionID,
		hookName,
		envelopeID,
		envelopeID,
		envelopeID,
		envelopeID,
	)

	var outputJSON string
	if err := row.Scan(&outputJSON); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("query latest output: %w", err)
	}

	var output map[string]any
	if err := json.Unmarshal([]byte(outputJSON), &output); err != nil {
		return nil, fmt.Errorf("decode latest output json: %w", err)
	}
	return output, nil
}

func (r *SQLiteDecisionReader) LatestSessionState(sessionID string) (*types.DhSessionState, error) {
	output, err := r.LatestOutput(sessionID, sessionID, "session_state")
	if err != nil || output == nil {
		return nil, err
	}

	state := &types.DhSessionState{}
	if lane, ok := outputString(output, "lane"); ok {
		state.Lane = lane
	}
	if laneLocked, ok := outputBool(output, "laneLocked", "lane_locked"); ok {
		state.LaneLocked = laneLocked
	}
	if currentStage, ok := outputString(output, "currentStage", "current_stage"); ok {
		state.CurrentStage = currentStage
	}
	if semanticMode, ok := outputString(output, "semanticMode", "semantic_mode"); ok {
		state.SemanticMode = semanticMode
	}
	if enforcement, ok := outputString(output, "toolEnforcementLevel", "tool_enforcement_level"); ok {
		state.ToolEnforcementLevel = enforcement
	}
	if activeWorkItemIDs, ok := outputAnyArray(output, "activeWorkItemIds", "active_work_item_ids"); ok {
		for _, rawID := range activeWorkItemIDs {
			if id, ok := rawID.(string); ok {
				state.ActiveWorkItemIDs = append(state.ActiveWorkItemIDs, id)
			}
		}
	}
	state.SessionID = sessionID
	return state, nil
}

func (r *SQLiteDecisionReader) LatestResolvedModel(sessionID, envelopeID string) (providerID, modelID, variantID string, ok bool, err error) {
	output, err := r.LatestOutput(sessionID, envelopeID, "model_override")
	if err != nil || output == nil {
		return "", "", "", false, err
	}
	providerID, _ = outputString(output, "providerId", "provider_id")
	modelID, _ = outputString(output, "modelId", "model_id")
	variantID, _ = outputString(output, "variantId", "variant_id")
	if providerID == "" || modelID == "" || variantID == "" {
		return "", "", "", false, nil
	}
	return providerID, modelID, variantID, true, nil
}

func (r *SQLiteDecisionReader) LatestSkills(sessionID, envelopeID string) ([]string, bool, error) {
	output, err := r.LatestOutput(sessionID, envelopeID, "skill_activation")
	if err != nil || output == nil {
		return nil, false, err
	}
	rawSkills, ok := outputAnyArray(output, "skills", "active_skills")
	if !ok {
		return nil, false, nil
	}
	skills := make([]string, 0, len(rawSkills))
	for _, rawSkill := range rawSkills {
		if skill, ok := rawSkill.(string); ok {
			skills = append(skills, skill)
		}
	}
	return skills, len(skills) > 0, nil
}

func (r *SQLiteDecisionReader) LatestMcps(sessionID, envelopeID string) ([]string, bool, error) {
	output, err := r.LatestOutput(sessionID, envelopeID, "mcp_routing")
	if err != nil || output == nil {
		return nil, false, err
	}
	rawMcps, ok := outputAnyArray(output, "mcps", "active_mcps")
	if !ok {
		return nil, false, nil
	}
	mcps := make([]string, 0, len(rawMcps))
	for _, rawMcp := range rawMcps {
		if mcp, ok := rawMcp.(string); ok {
			mcps = append(mcps, mcp)
		}
	}
	return mcps, len(mcps) > 0, nil
}

func (r *SQLiteDecisionReader) Close() error {
	if r == nil || r.db == nil {
		return nil
	}
	return r.db.Close()
}

func outputString(output map[string]any, keys ...string) (string, bool) {
	for _, key := range keys {
		if value, ok := output[key].(string); ok {
			return value, true
		}
	}
	return "", false
}

func outputBool(output map[string]any, keys ...string) (bool, bool) {
	for _, key := range keys {
		if value, ok := output[key].(bool); ok {
			return value, true
		}
	}
	return false, false
}

func outputAnyArray(output map[string]any, keys ...string) ([]any, bool) {
	for _, key := range keys {
		if value, ok := output[key].([]any); ok {
			return value, true
		}
	}
	return nil, false
}
