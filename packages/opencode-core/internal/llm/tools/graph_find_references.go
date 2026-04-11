package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphFindReferencesToolName = "dh.find-references"

type graphFindReferencesParams struct {
	Symbol string `json:"symbol"`
}

type graphFindReferencesTool struct{}

func NewGraphFindReferencesTool() BaseTool {
	return &graphFindReferencesTool{}
}

func (t *graphFindReferencesTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphFindReferencesToolName,
		Description: "Finds symbol references across files from graph_symbol_references.",
		Parameters: map[string]any{
			"symbol": map[string]any{"type": "string", "description": "Symbol name."},
		},
		Required: []string{"symbol"},
	}
}

func (t *graphFindReferencesTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphFindReferencesParams
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

	rows, err := db.Query(`
    SELECT gn.path, gsr.line, gsr.col, gsr.kind
    FROM graph_symbol_references gsr
    JOIN graph_symbols gs ON gs.id = gsr.symbol_id
    JOIN graph_nodes gn ON gn.id = gsr.node_id
    WHERE gs.name = ?
    ORDER BY gn.path ASC, gsr.line ASC, gsr.col ASC
  `, params.Symbol)
	if err != nil {
		return ToolResponse{}, err
	}
	defer rows.Close()

	var out []string
	for rows.Next() {
		var p, kind string
		var line, col int
		if err := rows.Scan(&p, &line, &col, &kind); err != nil {
			return ToolResponse{}, err
		}
		out = append(out, fmt.Sprintf("%s | line=%d col=%d | %s", p, line, col, kind))
	}

	if len(out) == 0 {
		return NewTextErrorResponse(fmt.Sprintf("Symbol '%s' not found in graph index.", params.Symbol)), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
