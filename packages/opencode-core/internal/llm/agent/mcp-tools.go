package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"github.com/duypham93/dh/packages/opencode-core/internal/config"
	"github.com/duypham93/dh/packages/opencode-core/internal/dhhooks"
	"github.com/duypham93/dh/packages/opencode-core/internal/llm/tools"
	"github.com/duypham93/dh/packages/opencode-core/internal/logging"
	"github.com/duypham93/dh/packages/opencode-core/internal/permission"
	"github.com/duypham93/dh/packages/opencode-core/internal/session"
	"github.com/duypham93/dh/packages/opencode-core/internal/version"

	"github.com/mark3labs/mcp-go/client"
	"github.com/mark3labs/mcp-go/mcp"
)

type mcpTool struct {
	mcpName     string
	tool        mcp.Tool
	mcpConfig   config.MCPServer
	permissions permission.Service
}

type MCPClient interface {
	Initialize(
		ctx context.Context,
		request mcp.InitializeRequest,
	) (*mcp.InitializeResult, error)
	ListTools(ctx context.Context, request mcp.ListToolsRequest) (*mcp.ListToolsResult, error)
	CallTool(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error)
	Close() error
}

func (b *mcpTool) Info() tools.ToolInfo {
	required := b.tool.InputSchema.Required
	if required == nil {
		required = make([]string, 0)
	}
	return tools.ToolInfo{
		Name:        fmt.Sprintf("%s_%s", b.mcpName, b.tool.Name),
		Description: b.tool.Description,
		Parameters:  b.tool.InputSchema.Properties,
		Required:    required,
	}
}

func runTool(ctx context.Context, c MCPClient, toolName string, input string) (tools.ToolResponse, error) {
	defer c.Close()
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    "DH",
		Version: version.Version,
	}

	_, err := c.Initialize(ctx, initRequest)
	if err != nil {
		return tools.NewTextErrorResponse(err.Error()), nil
	}

	toolRequest := mcp.CallToolRequest{}
	toolRequest.Params.Name = toolName
	var args map[string]any
	if err = json.Unmarshal([]byte(input), &args); err != nil {
		return tools.NewTextErrorResponse(fmt.Sprintf("error parsing parameters: %s", err)), nil
	}
	toolRequest.Params.Arguments = args
	result, err := c.CallTool(ctx, toolRequest)
	if err != nil {
		return tools.NewTextErrorResponse(err.Error()), nil
	}

	output := ""
	for _, v := range result.Content {
		if v, ok := v.(mcp.TextContent); ok {
			output = v.Text
		} else {
			output = fmt.Sprintf("%v", v)
		}
	}

	return tools.NewTextResponse(output), nil
}

func (b *mcpTool) Run(ctx context.Context, params tools.ToolCall) (tools.ToolResponse, error) {
	sessionID, messageID := tools.GetContextValues(ctx)
	if sessionID == "" || messageID == "" {
		return tools.ToolResponse{}, fmt.Errorf("session ID and message ID are required for creating a new file")
	}
	permissionDescription := fmt.Sprintf("execute %s with the following parameters: %s", b.Info().Name, params.Input)
	p := b.permissions.Request(
		permission.CreatePermissionRequest{
			SessionID:   sessionID,
			Path:        config.WorkingDirectory(),
			ToolName:    b.Info().Name,
			Action:      "execute",
			Description: permissionDescription,
			Params:      params.Input,
		},
	)
	if !p {
		return tools.NewTextErrorResponse("permission denied"), nil
	}

	switch b.mcpConfig.Type {
	case config.MCPStdio:
		c, err := client.NewStdioMCPClient(
			b.mcpConfig.Command,
			b.mcpConfig.Env,
			b.mcpConfig.Args...,
		)
		if err != nil {
			return tools.NewTextErrorResponse(err.Error()), nil
		}
		return runTool(ctx, c, b.tool.Name, params.Input)
	case config.MCPSse:
		c, err := client.NewSSEMCPClient(
			b.mcpConfig.URL,
			client.WithHeaders(b.mcpConfig.Headers),
		)
		if err != nil {
			return tools.NewTextErrorResponse(err.Error()), nil
		}
		return runTool(ctx, c, b.tool.Name, params.Input)
	}

	return tools.NewTextErrorResponse("invalid mcp type"), nil
}

func NewMcpTool(name string, tool mcp.Tool, permissions permission.Service, mcpConfig config.MCPServer) tools.BaseTool {
	return &mcpTool{
		mcpName:     name,
		tool:        tool,
		mcpConfig:   mcpConfig,
		permissions: permissions,
	}
}

var mcpTools []tools.BaseTool

func getTools(ctx context.Context, name string, m config.MCPServer, permissions permission.Service, c MCPClient) []tools.BaseTool {
	var stdioTools []tools.BaseTool
	initRequest := mcp.InitializeRequest{}
	initRequest.Params.ProtocolVersion = mcp.LATEST_PROTOCOL_VERSION
	initRequest.Params.ClientInfo = mcp.Implementation{
		Name:    "DH",
		Version: version.Version,
	}

	_, err := c.Initialize(ctx, initRequest)
	if err != nil {
		logging.Error("error initializing mcp client", "error", err)
		return stdioTools
	}
	toolsRequest := mcp.ListToolsRequest{}
	tools, err := c.ListTools(ctx, toolsRequest)
	if err != nil {
		logging.Error("error listing tools", "error", err)
		return stdioTools
	}
	for _, t := range tools.Tools {
		stdioTools = append(stdioTools, NewMcpTool(name, t, permissions, m))
	}
	defer c.Close()
	return stdioTools
}

func GetMcpTools(ctx context.Context, permissions permission.Service) []tools.BaseTool {
	if len(mcpTools) > 0 {
		return mcpTools
	}
	sessionID, _ := tools.GetContextValues(ctx)
	intent := inferMcpRoutingIntent(sessionID)

	// [dh hook] MCP Routing: get priority/blocked lists from dh
	priority, blocked, hookErr := dhhooks.OnMcpRouting(ctx, sessionID, sessionID, intent)
	if hookErr != nil {
		logging.Warn("dh MCP routing hook error", "error", hookErr)
	}
	blockedSet := make(map[string]bool)
	for _, b := range blocked {
		blockedSet[b] = true
	}
	serverNames := orderedMcpServerNames(config.Get().MCPServers, priority, blockedSet)

	for _, name := range serverNames {
		m := config.Get().MCPServers[name]

		switch m.Type {
		case config.MCPStdio:
			c, err := client.NewStdioMCPClient(
				m.Command,
				m.Env,
				m.Args...,
			)
			if err != nil {
				logging.Error("error creating mcp client", "error", err)
				continue
			}

			mcpTools = append(mcpTools, getTools(ctx, name, m, permissions, c)...)
		case config.MCPSse:
			c, err := client.NewSSEMCPClient(
				m.URL,
				client.WithHeaders(m.Headers),
			)
			if err != nil {
				logging.Error("error creating mcp client", "error", err)
				continue
			}
			mcpTools = append(mcpTools, getTools(ctx, name, m, permissions, c)...)
		}
	}

	return mcpTools
}

func orderedMcpServerNames(servers map[string]config.MCPServer, priority []string, blockedSet map[string]bool) []string {
	ordered := make([]string, 0, len(servers))
	seen := make(map[string]bool, len(servers))

	for _, name := range priority {
		if blockedSet[name] {
			continue
		}
		if _, exists := servers[name]; !exists {
			continue
		}
		if !seen[name] {
			ordered = append(ordered, name)
			seen[name] = true
		}
	}

	remaining := make([]string, 0, len(servers))
	for name := range servers {
		if blockedSet[name] || seen[name] {
			continue
		}
		remaining = append(remaining, name)
	}
	sort.Strings(remaining)
	ordered = append(ordered, remaining...)
	return ordered
}

func inferMcpRoutingIntent(sessionID string) string {
	if sessionID == "" {
		return "general"
	}
	state, ok := session.GetDhSessionState(sessionID)
	if !ok {
		return "general"
	}

	lane := strings.ToLower(state.Lane)
	stage := strings.ToLower(state.CurrentStage)

	if strings.Contains(stage, "migration") || lane == "migration" {
		return "migration"
	}
	if strings.Contains(stage, "delivery") || lane == "delivery" {
		return "delivery"
	}
	if strings.Contains(stage, "quick") || lane == "quick" {
		return "quick"
	}
	return "general"
}
