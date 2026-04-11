package tools

import (
	"database/sql"
	"fmt"
	"path/filepath"

	_ "github.com/ncruces/go-sqlite3/driver"
	_ "github.com/ncruces/go-sqlite3/embed"

	"github.com/duypham93/dh/packages/opencode-core/internal/bridge"
	"github.com/duypham93/dh/packages/opencode-core/internal/config"
)

func openGraphDB() (*sql.DB, error) {
	dbPath := filepath.Join(config.WorkingDirectory(), bridge.DBPathTemplate)
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open graph db: %w", err)
	}
	if err := db.Ping(); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("ping graph db: %w", err)
	}
	return db, nil
}

func graphIndexUnavailable() ToolResponse {
	return NewTextErrorResponse("Graph index not available. Run indexing first.")
}
