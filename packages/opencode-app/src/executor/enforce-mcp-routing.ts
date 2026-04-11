import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { chooseMcpsDetailed } from "../planner/choose-mcps.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";
import { canUseDegraded, fallbackTargets, runtimeRecordFor } from "../registry/mcp-routing-policy.js";
import type { McpRegistryEntry } from "../registry/mcp-registry.js";
import type {
  McpReasonCode,
  McpRoutingDecision,
  McpRoutingDecisionOptions,
} from "../planner/mcp-routing-types.js";

export function enforceMcpRouting(envelope: ExecutionEnvelopeState, intent: string): string[] {
  return enforceMcpRoutingDetailed(envelope, intent).selected;
}

export function enforceMcpRoutingDetailed(
  envelope: ExecutionEnvelopeState,
  intent: string,
  options?: McpRoutingDecisionOptions,
): McpRoutingDecision {
  const planned = chooseMcpsDetailed(envelope, intent, options);
  const reasons: Record<string, McpReasonCode[]> = { ...planned.reasons };
  const rejected: Record<string, McpReasonCode[]> = { ...planned.rejected };
  const blocked = [...planned.blocked];
  const warnings = [...planned.warnings];
  const selected: string[] = [];

  const registryByName = new Map<string, McpRegistryEntry>(
    DEFAULT_MCP_REGISTRY.map((entry) => [entry.mcpName, entry]),
  );

  const blockMcp = (mcpName: string, code: McpReasonCode) => {
    if (!blocked.includes(mcpName)) {
      blocked.push(mcpName);
    }
    const existing = rejected[mcpName] ?? [];
    rejected[mcpName] = existing.includes(code) ? existing : [...existing, code];
  };

  for (const mcpName of planned.selected) {
    const entry = registryByName.get(mcpName);
    if (!entry) {
      blockMcp(mcpName, "blocked_by_precondition");
      warnings.push(`MCP '${mcpName}' is not present in registry metadata.`);
      continue;
    }

    const runtimeRecord = runtimeRecordFor(mcpName, options?.runtimeSnapshot);
    if (!runtimeRecord) {
      reasons[mcpName] = [...(reasons[mcpName] ?? []), "no_runtime_status"];
      warnings.push(`No runtime status for '${mcpName}', using metadata-only routing.`);
      selected.push(mcpName);
      continue;
    }

    if (runtimeRecord.status === "unavailable") {
      blockMcp(mcpName, "status_unavailable");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      const fallback = pickFallback(entry, blocked, options);
      if (fallback) {
        selected.push(fallback);
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "status_unavailable"];
        warnings.push(`Fallback applied: '${mcpName}' unavailable -> '${fallback}'.`);
      } else {
        warnings.push(`No fallback available for unavailable MCP '${mcpName}'.`);
      }
      continue;
    }

    if (runtimeRecord.status === "needs_auth") {
      blockMcp(mcpName, "needs_auth");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      const fallback = pickFallback(entry, blocked, options);
      if (fallback) {
        selected.push(fallback);
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "needs_auth"];
        warnings.push(`Fallback applied: '${mcpName}' needs auth -> '${fallback}'.`);
      } else {
        warnings.push(`MCP '${mcpName}' needs auth and has no fallback.`);
      }
      continue;
    }

    if (entry.requiresAuth && runtimeRecord.authReady === false) {
      blockMcp(mcpName, "requires_auth");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      const fallback = pickFallback(entry, blocked, options);
      if (fallback) {
        selected.push(fallback);
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "requires_auth"];
        warnings.push(`Fallback applied: '${mcpName}' auth not ready -> '${fallback}'.`);
      } else {
        warnings.push(`MCP '${mcpName}' requires auth and no non-auth fallback is available.`);
      }
      continue;
    }

    if (entry.requiresAuth && runtimeRecord.authReady === undefined) {
      warnings.push(`Auth context missing for '${mcpName}'.`);
      reasons[mcpName] = [...(reasons[mcpName] ?? []), "requires_auth", "no_auth_context"];
    }

    if (runtimeRecord.status === "degraded") {
      if (!canUseDegraded(entry)) {
        blockMcp(mcpName, "status_degraded");
        const fallback = pickFallback(entry, blocked, options);
        if (fallback) {
          selected.push(fallback);
          reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "status_degraded"];
          warnings.push(`Fallback applied: critical MCP '${mcpName}' degraded -> '${fallback}'.`);
        } else {
          warnings.push(`Critical MCP '${mcpName}' is degraded and has no fallback.`);
        }
        continue;
      }
      reasons[mcpName] = [...(reasons[mcpName] ?? []), "status_degraded"];
      warnings.push(`MCP '${mcpName}' is degraded but still allowed by policy.`);
    }

    selected.push(mcpName);
  }

  const dedupSelected = dedupeExcluding(selected, blocked);
  if (dedupSelected.length === 0) {
    warnings.push("All selected MCPs were blocked; forcing safe fallback to augment_context_engine.");
    dedupSelected.push("augment_context_engine");
    reasons.augment_context_engine = [...(reasons.augment_context_engine ?? []), "fallback_applied"];
  }

  return {
    selected: dedupSelected,
    blocked,
    warnings,
    reasons,
    rejected,
  };
}

function pickFallback(
  entry: McpRegistryEntry,
  blocked: string[],
  options?: McpRoutingDecisionOptions,
): string | undefined {
  const fallbacks = fallbackTargets(entry);
  for (const fallback of fallbacks) {
    if (blocked.includes(fallback)) {
      continue;
    }
    const runtime = runtimeRecordFor(fallback, options?.runtimeSnapshot);
    if (!runtime) {
      return fallback;
    }
    if (runtime.status === "unavailable" || runtime.status === "needs_auth") {
      continue;
    }
    return fallback;
  }
  return undefined;
}

function dedupeExcluding(values: string[], blocked: string[]): string[] {
  const blockedSet = new Set(blocked);
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    if (blockedSet.has(value) || seen.has(value)) {
      continue;
    }
    seen.add(value);
    output.push(value);
  }
  return output;
}
