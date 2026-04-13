package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphGotoDefinitionToolName = "dh.goto-definition"

type graphGotoDefinitionParams struct {
	Symbol string `json:"symbol"`
}

type graphGotoDefinitionTool struct{}

func NewGraphGotoDefinitionTool() BaseTool {
	return &graphGotoDefinitionTool{}
}

func (t *graphGotoDefinitionTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphGotoDefinitionToolName,
		Description: "Finds exported definitions for a symbol.",
		Parameters: map[string]any{
			"symbol": map[string]any{"type": "string", "description": "Symbol name."},
		},
		Required: []string{"symbol"},
	}
}

func (t *graphGotoDefinitionTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphGotoDefinitionParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}
	if strings.TrimSpace(params.Symbol) == "" {
		return NewTextErrorResponse("symbol is required"), nil
	}

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	row := db.QueryRow(`
    SELECT gn.path, gs.line, gs.kind
    FROM graph_symbols gs
    JOIN graph_nodes gn ON gn.id = gs.node_id
    WHERE gs.name = ? AND gs.is_export = 1
    ORDER BY gs.line ASC
    LIMIT 1
  `, params.Symbol)

	var p, kind string
	var line int
	if err := row.Scan(&p, &line, &kind); err != nil {
		return NewTextErrorResponse(fmt.Sprintf("Symbol '%s' not found in graph index.", params.Symbol)), nil
	}

	return NewTextResponse(fmt.Sprintf("%s | line=%d | kind=%s", p, line, kind)), nil
}
