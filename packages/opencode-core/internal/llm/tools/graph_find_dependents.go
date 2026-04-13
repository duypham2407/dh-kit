package tools

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphFindDependentsToolName = "dh.find-dependents"

type graphFindDependentsParams struct {
	FilePath string `json:"filePath"`
}

type graphFindDependentsTool struct{}

func NewGraphFindDependentsTool() BaseTool {
	return &graphFindDependentsTool{}
}

func (t *graphFindDependentsTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphFindDependentsToolName,
		Description: "Finds files that import the target file.",
		Parameters: map[string]any{
			"filePath": map[string]any{
				"type":        "string",
				"description": "Project-relative file path to inspect dependents for.",
			},
		},
		Required: []string{"filePath"},
	}
}

func (t *graphFindDependentsTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphFindDependentsParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}
	if strings.TrimSpace(params.FilePath) == "" {
		return NewTextErrorResponse("filePath is required"), nil
	}

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	var nodeID string
	if err := db.QueryRow("SELECT id FROM graph_nodes WHERE path = ? LIMIT 1", params.FilePath).Scan(&nodeID); err != nil {
		if err == sql.ErrNoRows {
			return NewTextErrorResponse(fmt.Sprintf("File '%s' not in graph index. It may need indexing.", params.FilePath)), nil
		}
		return ToolResponse{}, err
	}

	rows, err := db.Query(`
    SELECT gn.path, ge.edge_type, ge.line
    FROM graph_edges ge
    JOIN graph_nodes gn ON gn.id = ge.from_node_id
    WHERE ge.to_node_id = ?
    ORDER BY gn.path ASC, ge.line ASC
  `, nodeID)
	if err != nil {
		return ToolResponse{}, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var p, edgeType string
		var line int
		if err := rows.Scan(&p, &edgeType, &line); err != nil {
			return ToolResponse{}, err
		}
		out = append(out, fmt.Sprintf("%s | %s | line=%d", p, edgeType, line))
	}

	if len(out) == 0 {
		return NewTextResponse("No dependents found."), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
