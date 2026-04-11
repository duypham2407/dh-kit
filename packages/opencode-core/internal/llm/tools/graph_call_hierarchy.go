package tools

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
)

const GraphCallHierarchyToolName = "dh.call-hierarchy"

type graphCallHierarchyParams struct {
	Symbol    string `json:"symbol"`
	Direction string `json:"direction"`
}

type graphCallHierarchyTool struct{}

func NewGraphCallHierarchyTool() BaseTool {
	return &graphCallHierarchyTool{}
}

func (t *graphCallHierarchyTool) Info() ToolInfo {
	return ToolInfo{
		Name:        GraphCallHierarchyToolName,
		Description: "Returns callers/callees for a symbol from graph_calls.",
		Parameters: map[string]any{
			"symbol":    map[string]any{"type": "string", "description": "Symbol name."},
			"direction": map[string]any{"type": "string", "description": "callers|callees|both"},
		},
		Required: []string{"symbol"},
	}
}

func (t *graphCallHierarchyTool) Run(ctx context.Context, call ToolCall) (ToolResponse, error) {
	var params graphCallHierarchyParams
	if err := json.Unmarshal([]byte(call.Input), &params); err != nil {
		return NewTextErrorResponse("invalid parameters"), nil
	}
	if strings.TrimSpace(params.Symbol) == "" {
		return NewTextErrorResponse("symbol is required"), nil
	}
	direction := strings.ToLower(strings.TrimSpace(params.Direction))
	if direction == "" {
		direction = "both"
	}

	db, err := openGraphDB()
	if err != nil {
		return graphIndexUnavailable(), nil
	}
	defer db.Close()

	var symbolID string
	if err := db.QueryRow("SELECT id FROM graph_symbols WHERE name = ? LIMIT 1", params.Symbol).Scan(&symbolID); err != nil {
		if err == sql.ErrNoRows {
			return NewTextErrorResponse(fmt.Sprintf("Symbol '%s' not found in graph index.", params.Symbol)), nil
		}
		return ToolResponse{}, err
	}

	out := make([]string, 0)

	if direction == "both" || direction == "callers" {
		callerRows, err := db.Query(`
      SELECT gs.name, gc.line
      FROM graph_calls gc
      JOIN graph_symbols gs ON gs.id = gc.caller_symbol_id
      WHERE gc.callee_symbol_id = ?
      ORDER BY gc.line ASC
    `, symbolID)
		if err != nil {
			return ToolResponse{}, err
		}
		defer callerRows.Close()
		out = append(out, "callers:")
		for callerRows.Next() {
			var name string
			var line int
			if err := callerRows.Scan(&name, &line); err != nil {
				return ToolResponse{}, err
			}
			out = append(out, fmt.Sprintf("- %s (line=%d)", name, line))
		}
	}

	if direction == "both" || direction == "callees" {
		calleeRows, err := db.Query(`
      SELECT gc.callee_name, gc.line
      FROM graph_calls gc
      WHERE gc.caller_symbol_id = ?
      ORDER BY gc.line ASC
    `, symbolID)
		if err != nil {
			return ToolResponse{}, err
		}
		defer calleeRows.Close()
		out = append(out, "callees:")
		for calleeRows.Next() {
			var name string
			var line int
			if err := calleeRows.Scan(&name, &line); err != nil {
				return ToolResponse{}, err
			}
			out = append(out, fmt.Sprintf("- %s (line=%d)", name, line))
		}
	}

	if len(out) == 0 {
		return NewTextResponse("No call hierarchy entries found."), nil
	}
	return NewTextResponse(strings.Join(out, "\n")), nil
}
