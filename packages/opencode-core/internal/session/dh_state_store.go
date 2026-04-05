package session

import (
	"context"
	"database/sql"
	"encoding/json"
	"strings"

	"github.com/duypham93/dh/packages/opencode-core/internal/logging"
	"github.com/duypham93/dh/packages/opencode-core/pkg/types"
)

// DhStateStore provides persistent storage for DhSessionState backed by SQLite.
// It uses the dh_session_state table created by the goose migration.
// The in-memory sync.Map in dh_state.go acts as a write-through cache.
type DhStateStore struct {
	db *sql.DB
}

// NewDhStateStore creates a new persistent store. If db is nil, persistence is
// disabled and the store operates as a no-op (in-memory only via sync.Map).
func NewDhStateStore(db *sql.DB) *DhStateStore {
	return &DhStateStore{db: db}
}

// Save persists a DhSessionState to the database and updates the in-memory cache.
func (s *DhStateStore) Save(ctx context.Context, state types.DhSessionState) error {
	// Always update in-memory cache
	dhStateStore.Store(state.SessionID, state)

	if s.db == nil {
		return nil
	}

	workItemIDs, err := json.Marshal(state.ActiveWorkItemIDs)
	if err != nil {
		workItemIDs = []byte("[]")
	}

	laneLocked := 0
	if state.LaneLocked {
		laneLocked = 1
	}

	_, err = s.db.ExecContext(ctx, `
		INSERT INTO dh_session_state (session_id, lane, lane_locked, current_stage, semantic_mode, tool_enforcement_level, active_work_item_ids)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(session_id) DO UPDATE SET
			lane = excluded.lane,
			lane_locked = excluded.lane_locked,
			current_stage = excluded.current_stage,
			semantic_mode = excluded.semantic_mode,
			tool_enforcement_level = excluded.tool_enforcement_level,
			active_work_item_ids = excluded.active_work_item_ids
	`, state.SessionID, state.Lane, laneLocked, state.CurrentStage, state.SemanticMode, state.ToolEnforcementLevel, string(workItemIDs))
	if err != nil {
		logging.Warn("failed to persist dh session state", "session", state.SessionID, "error", err)
		return err
	}
	return nil
}

// Load retrieves a DhSessionState from the database. It first checks the in-memory
// cache; if not found, it falls back to the database and hydrates the cache.
func (s *DhStateStore) Load(ctx context.Context, sessionID string) (types.DhSessionState, bool) {
	// Check in-memory cache first
	if state, ok := GetDhSessionState(sessionID); ok {
		return state, true
	}

	if s.db == nil {
		return types.DhSessionState{}, false
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT session_id, lane, lane_locked, current_stage, semantic_mode, tool_enforcement_level, active_work_item_ids
		FROM dh_session_state
		WHERE session_id = ?
	`, sessionID)

	var state types.DhSessionState
	var laneLocked int
	var workItemIDsJSON string

	err := row.Scan(&state.SessionID, &state.Lane, &laneLocked, &state.CurrentStage, &state.SemanticMode, &state.ToolEnforcementLevel, &workItemIDsJSON)
	if err != nil {
		if err != sql.ErrNoRows {
			logging.Warn("failed to load dh session state", "session", sessionID, "error", err)
		}
		return types.DhSessionState{}, false
	}

	state.LaneLocked = laneLocked != 0

	if workItemIDsJSON != "" && workItemIDsJSON != "[]" {
		var ids []string
		if jsonErr := json.Unmarshal([]byte(workItemIDsJSON), &ids); jsonErr == nil {
			state.ActiveWorkItemIDs = ids
		}
	}

	// Hydrate in-memory cache
	dhStateStore.Store(sessionID, state)
	return state, true
}

// Delete removes a DhSessionState from both the database and the in-memory cache.
func (s *DhStateStore) Delete(ctx context.Context, sessionID string) error {
	DeleteDhSessionState(sessionID)

	if s.db == nil {
		return nil
	}

	_, err := s.db.ExecContext(ctx, `DELETE FROM dh_session_state WHERE session_id = ?`, sessionID)
	if err != nil {
		logging.Warn("failed to delete persisted dh session state", "session", sessionID, "error", err)
		return err
	}
	return nil
}

// LoadAll loads all persisted DhSessionState rows into the in-memory cache.
// This should be called at startup to rehydrate state from the database.
func (s *DhStateStore) LoadAll(ctx context.Context) ([]types.DhSessionState, error) {
	if s.db == nil {
		return nil, nil
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT session_id, lane, lane_locked, current_stage, semantic_mode, tool_enforcement_level, active_work_item_ids
		FROM dh_session_state
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var states []types.DhSessionState
	for rows.Next() {
		var state types.DhSessionState
		var laneLocked int
		var workItemIDsJSON string

		if err := rows.Scan(&state.SessionID, &state.Lane, &laneLocked, &state.CurrentStage, &state.SemanticMode, &state.ToolEnforcementLevel, &workItemIDsJSON); err != nil {
			return nil, err
		}

		state.LaneLocked = laneLocked != 0
		if workItemIDsJSON != "" && workItemIDsJSON != "[]" {
			var ids []string
			if jsonErr := json.Unmarshal([]byte(workItemIDsJSON), &ids); jsonErr == nil {
				state.ActiveWorkItemIDs = ids
			}
		}

		dhStateStore.Store(state.SessionID, state)
		states = append(states, state)
	}

	if err := rows.Err(); err != nil {
		return nil, err
	}

	logging.Debug("rehydrated dh session states from db", "count", len(states))
	return states, nil
}

// TableExists checks whether the dh_session_state table has been created.
// This is useful for graceful degradation when running against a database
// that hasn't had the migration applied yet.
func (s *DhStateStore) TableExists(ctx context.Context) bool {
	if s.db == nil {
		return false
	}

	row := s.db.QueryRowContext(ctx, `
		SELECT name FROM sqlite_master WHERE type='table' AND name='dh_session_state'
	`)
	var name string
	err := row.Scan(&name)
	return err == nil && strings.EqualFold(name, "dh_session_state")
}
