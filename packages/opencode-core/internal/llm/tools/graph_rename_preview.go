package tools

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphRenamePreviewToolName = "dh.rename-preview"

type graphRenamePreviewParams struct {
	Symbol  string `json:"symbol"`
	NewName string `json:"newName"`
}

type graphRenamePreviewTool struct{}

func NewGraphRenamePreviewTool() BaseTool {
	return &graphRenamePreviewTool{}
}

func (t *graphRenamePreviewTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphRenamePreviewToolName,
		Description: "Previews definition and reference impact for a symbol rename.",
		Parameters: map[string]any{
			"symbol":  map[string]any{"type": "string", "description": "Current symbol name."},
			"newName": map[string]any{"type": "string", "description": "Desired new name."},
		},
		Required: []string{"symbol", "newName"},
	}
}

func (t *graphRenamePreviewTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphRenamePreviewParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}
	if strings.TrimSpace(params.Symbol) == "" {
		return NewTextErrorResponse("symbol is required"), nil
	}
	if strings.TrimSpace(params.NewName) == "" {
		return NewTextErrorResponse("newName is required"), nil
	}

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	defRows, err := db.Query(`
    SELECT gn.path, gs.line, gs.kind
    FROM graph_symbols gs
    JOIN graph_nodes gn ON gn.id = gs.node_id
    WHERE gs.name = ?
    ORDER BY gn.path ASC, gs.line ASC
  `, params.Symbol)
	if err != nil {
		return ToolResponse{}, err
	}
	defer defRows.Close()

	refRows, err := db.Query(`
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
	defer refRows.Close()

	lines := []string{fmt.Sprintf("rename preview: %s -> %s", params.Symbol, params.NewName), "definitions:"}
	defCount := 0
	for defRows.Next() {
		var p, kind string
		var line int
		if err := defRows.Scan(&p, &line, &kind); err != nil {
			return ToolResponse{}, err
		}
		lines = append(lines, fmt.Sprintf("- %s | line=%d | %s", p, line, kind))
		defCount++
	}

	lines = append(lines, "references:")
	refCount := 0
	for refRows.Next() {
		var p, kind string
		var line, col int
		if err := refRows.Scan(&p, &line, &col, &kind); err != nil {
			return ToolResponse{}, err
		}
		lines = append(lines, fmt.Sprintf("- %s | line=%d col=%d | %s", p, line, col, kind))
		refCount++
	}

	if defCount == 0 && refCount == 0 {
		return NewTextErrorResponse(fmt.Sprintf("Symbol '%s' not found in graph index.", params.Symbol)), nil
	}

	lines = append(lines, fmt.Sprintf("summary: %d definitions, %d references", defCount, refCount))
	return NewTextResponse(strings.Join(lines, "\n")), nil
}
