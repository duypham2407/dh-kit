package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphFindSymbolToolName = "dh.find-symbol"

type graphFindSymbolParams struct {
	Name string `json:"name"`
}

type graphFindSymbolTool struct{}

func NewGraphFindSymbolTool() BaseTool {
	return &graphFindSymbolTool{}
}

func (t *graphFindSymbolTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphFindSymbolToolName,
		Description: "Finds symbols by name from graph_symbols.",
		Parameters: map[string]any{
			"name": map[string]any{"type": "string", "description": "Symbol name."},
		},
		Required: []string{"name"},
	}
}

func (t *graphFindSymbolTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphFindSymbolParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}
	if strings.TrimSpace(params.Name) == "" {
		return NewTextErrorResponse("name is required"), nil
	}

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	rows, err := db.Query(`
    SELECT gn.path, gs.name, gs.kind, gs.line, gs.is_export
    FROM graph_symbols gs
    JOIN graph_nodes gn ON gn.id = gs.node_id
    WHERE gs.name = ?
    ORDER BY gn.path ASC, gs.line ASC
  `, params.Name)
	if err != nil {
		return ToolResponse{}, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var p, name, kind string
		var line, isExport int
		if err := rows.Scan(&p, &name, &kind, &line, &isExport); err != nil {
			return ToolResponse{}, err
		}
		out = append(out, fmt.Sprintf("%s | %s | %s | line=%d | export=%t", p, name, kind, line, isExport == 1))
	}

	if len(out) == 0 {
		return NewTextErrorResponse(fmt.Sprintf("Symbol '%s' not found in graph index.", params.Name)), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
