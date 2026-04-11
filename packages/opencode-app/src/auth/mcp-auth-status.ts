import type { McpRuntimeSnapshot } from "../planner/mcp-routing-types.js";

function buildMcpServerKey(mcpName: string, serverIdentity?: string): string {
  return `${mcpName}::${serverIdentity ?? "default"}`;
}

export function getMcpRuntimeSnapshot(input?: {
  statusByMcp?: Record<string, "available" | "degraded" | "needs_auth" | "unavailable">;
  authReadyByServerKey?: Record<string, boolean>;
  serverIdentityByMcp?: Record<string, string>;
}): McpRuntimeSnapshot | undefined {
  if (!input?.statusByMcp) {
    return undefined;
  }

  const snapshot: McpRuntimeSnapshot = {};
  for (const [mcpName, status] of Object.entries(input.statusByMcp)) {
    const serverIdentity = input.serverIdentityByMcp?.[mcpName];
    const serverKey = buildMcpServerKey(mcpName, serverIdentity);
    const authReady = input.authReadyByServerKey?.[serverKey];
    snapshot[mcpName] = {
      status,
      serverKey,
      authReady,
    };
  }
  return snapshot;
}
