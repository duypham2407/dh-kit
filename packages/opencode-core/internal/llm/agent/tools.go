package agent

import (
	"context"

	"github.com/duypham93/dh/packages/opencode-core/internal/history"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/tools"
	"github.com/duypham93/dh/packages/opencode-core/internal/lsp"
	"github.com/duypham93/dh/packages/opencode-core/internal/message"
	"github.com/duypham93/dh/packages/opencode-core/internal/permission"
	"github.com/duypham93/dh/packages/opencode-core/internal/session"
)

func CoderAgentTools(
	permissions permission.Service,
	sessions session.Service,
	messages message.Service,
	history history.Service,
	lspClients map[string]*lsp.Client,
) []tools.BaseTool {
	ctx := context.Background()
	otherTools := GetMcpTools(ctx, permissions)
	if len(lspClients) > 0 {
		otherTools = append(otherTools, tools.NewDiagnosticsTool(lspClients))
	}
	return append(
		[]tools.BaseTool{
			tools.NewBashTool(permissions),
			tools.NewEditTool(lspClients, permissions, history),
			tools.NewFetchTool(permissions),
			tools.NewGlobTool(),
			tools.NewGrepTool(),
			tools.NewLsTool(),
			tools.NewGraphFindDependenciesTool(),
			tools.NewGraphFindDependentsTool(),
			tools.NewGraphFindSymbolTool(),
			tools.NewGraphFindReferencesTool(),
			tools.NewGraphCallHierarchyTool(),
			tools.NewGraphGotoDefinitionTool(),
			tools.NewGraphSyntaxOutlineTool(),
			tools.NewGraphAstSearchTool(),
			tools.NewGraphRenamePreviewTool(),
			tools.NewGraphImportGraphTool(),
			tools.NewSourcegraphTool(),
			tools.NewViewTool(lspClients),
			tools.NewPatchTool(lspClients, permissions, history),
			tools.NewWriteTool(lspClients, permissions, history),
			NewAgentTool(sessions, messages, lspClients),
		}, otherTools...,
	)
}

func TaskAgentTools(lspClients map[string]*lsp.Client) []tools.BaseTool {
	return []tools.BaseTool{
		tools.NewGlobTool(),
		tools.NewGrepTool(),
		tools.NewLsTool(),
		tools.NewSourcegraphTool(),
		tools.NewViewTool(lspClients),
	}
}
