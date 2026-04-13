package tools

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphSyntaxOutlineToolName = "dh.syntax-outline"

type graphSyntaxOutlineParams struct {
	FilePath string `json:"filePath"`
}

type graphSyntaxOutlineTool struct{}

func NewGraphSyntaxOutlineTool() BaseTool {
	return &graphSyntaxOutlineTool{}
}

func (t *graphSyntaxOutlineTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphSyntaxOutlineToolName,
		Description: "Returns indexed symbol outline for a file.",
		Parameters: map[string]any{
			"filePath": map[string]any{"type": "string", "description": "Project-relative file path."},
		},
		Required: []string{"filePath"},
	}
}

func (t *graphSyntaxOutlineTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphSyntaxOutlineParams
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
    SELECT name, kind, line, is_export
    FROM graph_symbols
    WHERE node_id = ?
    ORDER BY line ASC
  `, nodeID)
	if err != nil {
		return ToolResponse{}, err
	}
	defer rows.Close()

	out := make([]string, 0)
	for rows.Next() {
		var name, kind string
		var line, isExport int
		if err := rows.Scan(&name, &kind, &line, &isExport); err != nil {
			return ToolResponse{}, err
		}
		out = append(out, fmt.Sprintf("%s | %s | line=%d | export=%t", name, kind, line, isExport == 1))
	}

	if len(out) == 0 {
		return NewTextResponse("No symbols found for file."), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
