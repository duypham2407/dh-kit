import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";
import {
  hasAllRequiredCapabilities,
  inferIntentTags,
  runtimeStatusFor,
  scoreRegistryEntry,
} from "../registry/mcp-routing-policy.js";
import type {
  McpReasonCode,
  McpRoutingDecision,
  McpRoutingDecisionOptions,
} from "./mcp-routing-types.js";

export function chooseMcps(envelope: ExecutionEnvelopeState, intent: string): string[] {
  return chooseMcpsDetailed(envelope, intent, {
    supportedContractVersions: ["v1"],
  }).selected;
}

export function chooseMcpsDetailed(
  envelope: ExecutionEnvelopeState,
  intent: string,
  options?: McpRoutingDecisionOptions,
): McpRoutingDecision {
  const tags = inferIntentTags(intent);
  const maxSelected = options?.maxSelected ?? 4;
  const requiredCapabilities = options?.requiredCapabilities ?? [];
  const supportedContractVersions = options?.supportedContractVersions ?? ["v1"];
  const staleRuntimeFailSafe = options?.staleRuntimeFailSafe ?? "allow_with_warning";
  const missingRuntimeFailSafe = options?.missingRuntimeFailSafe ?? "allow_with_warning";
  const selected: string[] = [];
  const reasons: Record<string, McpReasonCode[]> = {};
  const rejected: Record<string, McpReasonCode[]> = {};
  const decisions: Record<string, "allow" | "block" | "modify"> = {};
  const blocked: string[] = [];
  const warnings: string[] = [];

  const candidates = DEFAULT_MCP_REGISTRY
    .map((entry) => {
      const entryReasons: McpReasonCode[] = [];

      if (!supportedContractVersions.includes(entry.contractVersion)) {
        rejected[entry.id] = ["contract_version_mismatch"];
        return null;
      }

      if (!entry.entry) {
        rejected[entry.id] = ["entry_missing"];
        return null;
      }

      if (!entry.lanes.includes(envelope.lane)) {
        rejected[entry.id] = ["lane_mismatch"];
        return null;
      }
      entryReasons.push("lane_match");

      if (!entry.roles.includes(envelope.role)) {
        rejected[entry.id] = ["role_mismatch"];
        return null;
      }
      entryReasons.push("role_match");

      if (!hasAllRequiredCapabilities(entry, requiredCapabilities)) {
        rejected[entry.id] = ["capability_denied"];
        return null;
      }
      if (requiredCapabilities.length > 0) {
        entryReasons.push("capability_match");
      }

      const scored = scoreRegistryEntry({
        entry,
        intentTags: tags,
      });

      const runtimeStatus = runtimeStatusFor(entry.id, options?.runtimeSnapshot);
      if (!runtimeStatus) {
        if (missingRuntimeFailSafe === "allow_with_warning") {
          entryReasons.push("no_runtime_status");
        } else {
          rejected[entry.id] = [...entryReasons, "missing_runtime_signal"];
          return null;
        }
      }

      const runtimeRecord = options?.runtimeSnapshot?.[entry.id];
      if (runtimeRecord?.signalMissing && missingRuntimeFailSafe === "degrade_or_fallback") {
        rejected[entry.id] = [...entryReasons, "missing_runtime_signal"];
        return null;
      }

      if (runtimeRecord?.signalMissing && missingRuntimeFailSafe === "allow_with_warning") {
        entryReasons.push("missing_runtime_signal");
      }

      if (runtimeRecord?.stale && staleRuntimeFailSafe === "degrade_or_fallback") {
        rejected[entry.id] = [...entryReasons, "status_stale"];
        return null;
      }

      if (runtimeRecord?.stale && staleRuntimeFailSafe === "allow_with_warning") {
        entryReasons.push("status_stale");
      }

      return {
        entry,
        score: scored.score,
        reasons: [...entryReasons, ...scored.reasons],
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score;
      }
      return left.entry.id.localeCompare(right.entry.id);
    });

  for (const candidate of candidates) {
    if (selected.length >= maxSelected) {
      rejected[candidate.entry.id] = [...candidate.reasons, "deprioritized"];
      continue;
    }

    selected.push(candidate.entry.id);
    decisions[candidate.entry.id] = "allow";
    reasons[candidate.entry.id] = candidate.reasons;
  }

  if (selected.length === 0) {
    const safeFallback = pickPlannerSafeFallback(envelope, options);
    if (safeFallback) {
      warnings.push(`No MCP candidate selected by lane/role policy. Fallback to ${safeFallback}.`);
      selected.push(safeFallback);
      decisions[safeFallback] = "modify";
      reasons[safeFallback] = ["fallback_applied"];
    } else {
      warnings.push("No MCP candidate selected by lane/role policy and no safe fallback is available.");
    }
  }

  return {
    selected,
    blocked,
    warnings,
    decisions,
    reasons,
    rejected,
  };
}

function pickPlannerSafeFallback(
  envelope: ExecutionEnvelopeState,
  options?: McpRoutingDecisionOptions,
): string | undefined {
  const requiredCapabilities = options?.requiredCapabilities ?? [];
  const supportedContractVersions = options?.supportedContractVersions ?? ["v1"];
  const staleRuntimeFailSafe = options?.staleRuntimeFailSafe ?? "allow_with_warning";
  const missingRuntimeFailSafe = options?.missingRuntimeFailSafe ?? "allow_with_warning";
  const sorted = [...DEFAULT_MCP_REGISTRY].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }
    return left.id.localeCompare(right.id);
  });

  for (const entry of sorted) {
    if (!supportedContractVersions.includes(entry.contractVersion)) {
      continue;
    }
    if (!entry.entry) {
      continue;
    }
    if (!entry.lanes.includes(envelope.lane)) {
      continue;
    }
    if (!entry.roles.includes(envelope.role)) {
      continue;
    }
    if (!hasAllRequiredCapabilities(entry, requiredCapabilities)) {
      continue;
    }

    const runtimeRecord = options?.runtimeSnapshot?.[entry.id];
    if (!runtimeRecord && missingRuntimeFailSafe === "degrade_or_fallback") {
      continue;
    }
    if (runtimeRecord?.signalMissing && missingRuntimeFailSafe === "degrade_or_fallback") {
      continue;
    }
    if (runtimeRecord?.stale && staleRuntimeFailSafe === "degrade_or_fallback") {
      continue;
    }
    if (runtimeRecord && (runtimeRecord.status === "unavailable" || runtimeRecord.status === "needs_auth")) {
      continue;
    }

    return entry.id;
  }

  return undefined;
}
