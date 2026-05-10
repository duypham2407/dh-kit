import type { McpDebugReport } from "../../../shared/src/types/mcp.js";
import { McpConfigService } from "./mcp-config-service.js";

export function buildMcpDebugReport(repoRoot: string, name: string): McpDebugReport {
  const service = new McpConfigService(repoRoot);
  const server = service.getPublicServer(name);
  if (!server) {
    throw new Error(`MCP server '${name}' was not found.`);
  }

  return {
    name: server.name,
    source: server.source,
    enabled: server.enabled,
    authStatus: server.authStatus,
    description: server.description,
    requiresAuth: server.requiresAuth,
    capabilities: [...server.capabilities],
    toolCount: server.toolCount,
    resourceCount: server.resourceCount,
    promptCount: server.promptCount,
    launch: server.command
      ? {
          command: server.command,
          args: [...server.args],
          env: { ...server.env },
        }
      : undefined,
    runtime: {
      state: "not_launched",
      reason: "MCP stdio runtime is not implemented in this milestone.",
    },
    lastFailure: server.lastFailure,
  };
}
