import type {
  McpRoutingStatus,
  McpRuntimeSnapshot,
} from "../planner/mcp-routing-types.js";

function buildMcpServerKey(mcpName: string, serverIdentity?: string): string {
  return `${mcpName}::${serverIdentity ?? "default"}`;
}

export function getMcpRuntimeSnapshot(input?: {
  statusByMcp?: Record<string, "available" | "degraded" | "needs_auth" | "unavailable">;
  authReadyByServerKey?: Record<string, boolean>;
  serverIdentityByMcp?: Record<string, string>;
  observedAtByMcp?: Record<string, string>;
  freshnessWindowMs?: number;
  now?: Date;
  previousSnapshot?: McpRuntimeSnapshot;
}): McpRuntimeSnapshot | undefined {
  const statusByMcp = input?.statusByMcp ?? {};
  const serverIdentityByMcp = input?.serverIdentityByMcp ?? {};
  const authReadyByServerKey = input?.authReadyByServerKey;
  const observedAtByMcp = input?.observedAtByMcp ?? {};
  const nowEpochMs = (input?.now ?? new Date()).getTime();
  const freshnessWindowMs = input?.freshnessWindowMs ?? 5 * 60_000;
  const previousSnapshot = input?.previousSnapshot;
  const mcpNames = new Set<string>([
    ...Object.keys(statusByMcp),
    ...Object.keys(serverIdentityByMcp),
    ...Object.keys(observedAtByMcp),
  ]);

  if (mcpNames.size === 0) {
    return undefined;
  }

  const snapshot: McpRuntimeSnapshot = {};
  for (const mcpName of mcpNames) {
    const status = statusByMcp[mcpName];
    const normalizedStatus = status ?? previousSnapshot?.[mcpName]?.status ?? "needs_auth";
    const signalMissing = status === undefined;
    const previousRecord = previousSnapshot?.[mcpName];
    const serverIdentity = serverIdentityByMcp[mcpName];
    const serverKey = buildMcpServerKey(mcpName, serverIdentity);
    const authReady = authReadyByServerKey?.[serverKey];
    const observedAt = normalizeObservedAt(observedAtByMcp[mcpName], nowEpochMs);
    const stale = nowEpochMs - Date.parse(observedAt) > freshnessWindowMs;

    let transitionReason = "status_observed";
    let transitionFrom: McpRoutingStatus | undefined;
    if (signalMissing) {
      transitionReason = "missing_runtime_signal";
    }
    if (stale) {
      transitionReason = "status_stale";
    }
    if (previousRecord && previousRecord.status !== normalizedStatus) {
      transitionFrom = previousRecord.status;
      transitionReason = `status_transition:${previousRecord.status}->${normalizedStatus}`;
    }

    snapshot[mcpName] = {
      status: normalizedStatus,
      serverKey,
      authReady,
      observedAt,
      freshnessWindowMs,
      stale,
      transitionReason,
      transitionFrom,
      signalMissing,
    };
  }
  return snapshot;
}

function normalizeObservedAt(observedAt: string | undefined, fallbackNowMs: number): string {
  if (!observedAt) {
    return new Date(fallbackNowMs).toISOString();
  }
  const epoch = Date.parse(observedAt);
  if (Number.isNaN(epoch)) {
    return new Date(fallbackNowMs).toISOString();
  }
  return new Date(epoch).toISOString();
}
