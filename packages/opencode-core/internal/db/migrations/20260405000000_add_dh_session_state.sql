-- +goose Up
-- +goose StatementBegin
CREATE TABLE IF NOT EXISTS dh_session_state (
    session_id TEXT PRIMARY KEY,
    lane TEXT NOT NULL DEFAULT '',
    lane_locked INTEGER NOT NULL DEFAULT 0,
    current_stage TEXT NOT NULL DEFAULT '',
    semantic_mode TEXT NOT NULL DEFAULT '',
    tool_enforcement_level TEXT NOT NULL DEFAULT '',
    active_work_item_ids TEXT NOT NULL DEFAULT '[]',
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
);

CREATE TRIGGER IF NOT EXISTS update_dh_session_state_updated_at
AFTER UPDATE ON dh_session_state
BEGIN
    UPDATE dh_session_state SET updated_at = strftime('%s', 'now')
    WHERE session_id = new.session_id;
END;
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TRIGGER IF EXISTS update_dh_session_state_updated_at;
DROP TABLE IF EXISTS dh_session_state;
-- +goose StatementEnd
