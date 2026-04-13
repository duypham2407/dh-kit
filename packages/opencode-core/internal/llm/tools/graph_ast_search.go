package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphAstSearchToolName = "dh.ast-search"

type graphAstSearchParams struct {
	Text     string `json:"text"`
	NodeType string `json:"nodeType"`
	FilePath string `json:"filePath"`
}

type graphAstSearchTool struct{}

func NewGraphAstSearchTool() BaseTool {
	return &graphAstSearchTool{}
}

func (t *graphAstSearchTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphAstSearchToolName,
		Description: "Lightweight structural search backed by indexed symbols.",
		Parameters: map[string]any{
			"text":     map[string]any{"type": "string", "description": "Symbol text to search."},
			"nodeType": map[string]any{"type": "string", "description": "Optional symbol kind filter."},
			"filePath": map[string]any{"type": "string", "description": "Optional file filter."},
		},
		Required: []string{"text"},
	}
}

func (t *graphAstSearchTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphAstSearchParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}
	if strings.TrimSpace(params.Text) == "" {
		return NewTextErrorResponse("text is required"), nil
	}

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	query := `
    SELECT gn.path, gs.name, gs.kind, gs.line
    FROM graph_symbols gs
    JOIN graph_nodes gn ON gn.id = gs.node_id
    WHERE gs.name LIKE ?
  `
	args := []any{"%" + params.Text + "%"}
	if strings.TrimSpace(params.NodeType) != "" {
		query += " AND gs.kind = ?"
		args = append(args, params.NodeType)
	}
	if strings.TrimSpace(params.FilePath) != "" {
		query += " AND gn.path = ?"
		args = append(args, params.FilePath)
	}
	query += " ORDER BY gn.path ASC, gs.line ASC LIMIT 200"

	rows, err := db.Query(query, args...)
	if err != nil {
		return ToolResponse{}, err
	}
	defer rows.Close()

	out := make([]string, 0)
	for rows.Next() {
		var p, n, k string
		var line int
		if err := rows.Scan(&p, &n, &k, &line); err != nil {
			return ToolResponse{}, err
		}
		out = append(out, fmt.Sprintf("%s | %s | %s | line=%d", p, n, k, line))
	}

	if len(out) == 0 {
		return NewTextResponse("No structural matches found."), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
