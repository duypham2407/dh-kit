package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphImportGraphToolName = "dh.import-graph"

type graphImportGraphParams struct {
	FilePath string `json:"filePath"`
}

type graphImportGraphTool struct{}

func NewGraphImportGraphTool() BaseTool {
	return &graphImportGraphTool{}
}

func (t *graphImportGraphTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphImportGraphToolName,
		Description: "Returns import graph edges globally or for one file.",
		Parameters: map[string]any{
			"filePath": map[string]any{"type": "string", "description": "Optional file path to scope output."},
		},
		Required: []string{},
	}
}

func (t *graphImportGraphTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphImportGraphParams
	_ = json.Unmarshal([]byte(call.Input), &params)

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	query := `
    SELECT gnf.path, gnt.path, ge.edge_type, ge.line
    FROM graph_edges ge
    JOIN graph_nodes gnf ON gnf.id = ge.from_node_id
    JOIN graph_nodes gnt ON gnt.id = ge.to_node_id
  `
	args := make([]any, 0)
	if strings.TrimSpace(params.FilePath) != "" {
		query += " WHERE gnf.path = ? OR gnt.path = ?"
		args = append(args, params.FilePath, params.FilePath)
	}
	query += " ORDER BY gnf.path ASC, ge.line ASC"

	rows, err := db.Query(query, args...)
	if err != nil {
		return ToolResponse{}, err
	}
	defer rows.Close()

	out := make([]string, 0)
	for rows.Next() {
		var fromPath, toPath, edgeType string
		var line int
		if err := rows.Scan(&fromPath, &toPath, &edgeType, &line); err != nil {
			return ToolResponse{}, err
		}
		out = append(out, fmt.Sprintf("%s -> %s | %s | line=%d", fromPath, toPath, edgeType, line))
	}

	if len(out) == 0 {
		return NewTextResponse("No import graph edges found."), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
