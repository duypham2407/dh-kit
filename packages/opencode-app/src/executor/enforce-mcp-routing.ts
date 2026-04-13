import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { ExtensionSpec } from "../../../opencode-sdk/src/index.js";
import { chooseMcpsDetailed } from "../planner/choose-mcps.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";
import {
  canUseDegraded,
  fallbackTargets,
  hasAllRequiredCapabilities,
  runtimeRecordFor,
} from "../registry/mcp-routing-policy.js";
import type { McpRegistryEntry } from "../registry/mcp-registry.js";
import type {
  McpReasonCode,
  McpRoutingDecision,
  McpRoutingDecisionOptions,
} from "../planner/mcp-routing-types.js";
import { touchExtensionState } from "../../../runtime/src/extensions/touch-extension-state.js";
import { buildExtensionStateDriftReport } from "../../../runtime/src/extensions/extension-drift-report.js";

export function enforceMcpRouting(envelope: ExecutionEnvelopeState, intent: string): string[] {
  return enforceMcpRoutingDetailed(envelope, intent, {
    supportedContractVersions: ["v1"],
  }).selected;
}

export function enforceMcpRoutingDetailed(
  envelope: ExecutionEnvelopeState,
  intent: string,
  options?: McpRoutingDecisionOptions,
): McpRoutingDecision {
  const planned = chooseMcpsDetailed(envelope, intent, options);
  const decisions = { ...planned.decisions };
  const reasons: Record<string, McpReasonCode[]> = { ...planned.reasons };
  const rejected: Record<string, McpReasonCode[]> = { ...planned.rejected };
  const blocked = [...planned.blocked];
  const warnings = [...planned.warnings];
  const selected: string[] = [];
  const runtimeStates: Record<string, { state: "first" | "updated" | "same"; fingerprint: string }> = {};
  const requiredCapabilities = options?.requiredCapabilities ?? [];
  const supportedContractVersions = options?.supportedContractVersions ?? ["v1"];
  const runtimeStateRepoRoot = options?.runtimeStateRepoRoot;
  const staleRuntimeFailSafe = options?.staleRuntimeFailSafe ?? "degrade_or_fallback";
  const missingRuntimeFailSafe = options?.missingRuntimeFailSafe ?? "degrade_or_fallback";

  const registryByName = new Map<string, McpRegistryEntry>(
    DEFAULT_MCP_REGISTRY.map((entry) => [entry.id, entry]),
  );

  const blockMcp = (mcpName: string, code: McpReasonCode) => {
    if (!blocked.includes(mcpName)) {
      blocked.push(mcpName);
    }
    const existing = rejected[mcpName] ?? [];
    rejected[mcpName] = existing.includes(code) ? existing : [...existing, code];
    decisions[mcpName] = "block";
  };

  for (const mcpName of planned.selected) {
    const entry = registryByName.get(mcpName);
    if (!entry) {
      blockMcp(mcpName, "blocked_by_precondition");
      warnings.push(`MCP '${mcpName}' is not present in registry metadata.`);
      continue;
    }

    if (!supportedContractVersions.includes(entry.contractVersion)) {
      blockMcp(mcpName, "contract_version_mismatch");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      warnings.push(`MCP '${mcpName}' contract version '${entry.contractVersion}' is not supported.`);
      continue;
    }

    if (!entry.entry) {
      blockMcp(mcpName, "entry_missing");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      warnings.push(`MCP '${mcpName}' is missing required entry metadata.`);
      continue;
    }

    if (!entry.lanes.includes(envelope.lane)) {
      blockMcp(mcpName, "lane_mismatch");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      warnings.push(`MCP '${mcpName}' is not allowed for lane '${envelope.lane}'.`);
      continue;
    }

    if (!entry.roles.includes(envelope.role)) {
      blockMcp(mcpName, "role_mismatch");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      warnings.push(`MCP '${mcpName}' is not allowed for role '${envelope.role}'.`);
      continue;
    }

    if (!hasAllRequiredCapabilities(entry, requiredCapabilities)) {
      blockMcp(mcpName, "capability_denied");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      warnings.push(`MCP '${mcpName}' does not satisfy required capabilities: ${requiredCapabilities.join(",")}.`);
      continue;
    }

    const runtimeRecord = runtimeRecordFor(mcpName, options?.runtimeSnapshot);
    if (!runtimeRecord) {
      if (missingRuntimeFailSafe === "allow_with_warning") {
        reasons[mcpName] = [...(reasons[mcpName] ?? []), "no_runtime_status"];
        decisions[mcpName] = "allow";
        warnings.push(`No runtime status for '${mcpName}', using metadata-only routing.`);
        applyRuntimeStateTouch(entry, runtimeStateRepoRoot, runtimeStates, warnings);
        selected.push(mcpName);
      } else {
        blockMcp(mcpName, "missing_runtime_signal");
        if (reasons[mcpName]) {
          delete reasons[mcpName];
        }
        const fallback = pickFallback(entry, blocked, options);
        if (fallback) {
          const fallbackEntry = registryByName.get(fallback);
          selected.push(fallback);
          decisions[fallback] = "modify";
          reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "missing_runtime_signal"];
          warnings.push(`Fail-safe fallback applied: '${mcpName}' missing runtime signal -> '${fallback}'.`);
          if (fallbackEntry) {
            applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
          }
        } else {
          warnings.push(`MCP '${mcpName}' missing runtime signal and no fallback is available.`);
        }
      }
      continue;
    }

    if (runtimeRecord.signalMissing && missingRuntimeFailSafe === "degrade_or_fallback") {
      blockMcp(mcpName, "missing_runtime_signal");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      const fallback = pickFallback(entry, blocked, options);
      if (fallback) {
        const fallbackEntry = registryByName.get(fallback);
        selected.push(fallback);
        decisions[fallback] = "modify";
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "missing_runtime_signal"];
        warnings.push(`Fail-safe fallback applied: '${mcpName}' missing runtime signal -> '${fallback}'.`);
        if (fallbackEntry) {
          applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
        }
      } else {
        warnings.push(`MCP '${mcpName}' missing runtime signal and no fallback is available.`);
      }
      continue;
    }

    if (runtimeRecord.stale && staleRuntimeFailSafe === "degrade_or_fallback") {
      blockMcp(mcpName, "status_stale");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      const fallback = pickFallback(entry, blocked, options);
      if (fallback) {
        const fallbackEntry = registryByName.get(fallback);
        selected.push(fallback);
        decisions[fallback] = "modify";
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "status_stale"];
        warnings.push(`Fail-safe fallback applied: '${mcpName}' stale runtime status -> '${fallback}'.`);
        if (fallbackEntry) {
          applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
        }
      } else {
        warnings.push(`MCP '${mcpName}' runtime status is stale and no fallback is available.`);
      }
      continue;
    }

    if (runtimeRecord.signalMissing && missingRuntimeFailSafe === "allow_with_warning") {
      reasons[mcpName] = [...(reasons[mcpName] ?? []), "missing_runtime_signal"];
      warnings.push(`MCP '${mcpName}' runtime signal is missing; continuing with caution.`);
    }

    if (runtimeRecord.stale && staleRuntimeFailSafe === "allow_with_warning") {
      reasons[mcpName] = [...(reasons[mcpName] ?? []), "status_stale"];
      warnings.push(`MCP '${mcpName}' runtime status is stale; continuing with caution.`);
    }

    if (runtimeRecord.status === "unavailable") {
      blockMcp(mcpName, "status_unavailable");
      if (reasons[mcpName]) {
        delete reasons[mcpName];
      }
      const fallback = pickFallback(entry, blocked, options);
      if (fallback) {
        const fallbackEntry = registryByName.get(fallback);
        selected.push(fallback);
        decisions[fallback] = "modify";
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "status_unavailable"];
        warnings.push(`Fallback applied: '${mcpName}' unavailable -> '${fallback}'.`);
        if (fallbackEntry) {
          applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
        }
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
        const fallbackEntry = registryByName.get(fallback);
        selected.push(fallback);
        decisions[fallback] = "modify";
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "needs_auth"];
        warnings.push(`Fallback applied: '${mcpName}' needs auth -> '${fallback}'.`);
        if (fallbackEntry) {
          applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
        }
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
        const fallbackEntry = registryByName.get(fallback);
        selected.push(fallback);
        decisions[fallback] = "modify";
        reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "requires_auth"];
        warnings.push(`Fallback applied: '${mcpName}' auth not ready -> '${fallback}'.`);
        if (fallbackEntry) {
          applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
        }
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
          decisions[fallback] = "modify";
          reasons[fallback] = [...(reasons[fallback] ?? []), "fallback_applied", "status_degraded"];
          warnings.push(`Fallback applied: critical MCP '${mcpName}' degraded -> '${fallback}'.`);
        } else {
          warnings.push(`Critical MCP '${mcpName}' is degraded and has no fallback.`);
        }
        continue;
      }
      reasons[mcpName] = [...(reasons[mcpName] ?? []), "status_degraded"];
      decisions[mcpName] = "modify";
      warnings.push(`MCP '${mcpName}' is degraded but still allowed by policy.`);
    }

    decisions[mcpName] = decisions[mcpName] ?? "allow";
    applyRuntimeStateTouch(entry, runtimeStateRepoRoot, runtimeStates, warnings);
    selected.push(mcpName);
  }

  const dedupSelected = dedupeExcluding(selected, blocked);
  const runtimeStateDrift = runtimeStateRepoRoot
    ? buildExtensionStateDriftReport({
        repoRoot: runtimeStateRepoRoot,
        runtimeStates,
      })
    : undefined;
  if (runtimeStateDrift?.warnings.length) {
    warnings.push(...runtimeStateDrift.warnings);
  }
  if (dedupSelected.length === 0) {
    const safeFallback = pickGlobalSafeFallback(blocked, options);
    if (safeFallback) {
      warnings.push(`All selected MCPs were blocked; forcing safe fallback to ${safeFallback}.`);
      dedupSelected.push(safeFallback);
      decisions[safeFallback] = "modify";
      reasons[safeFallback] = [...(reasons[safeFallback] ?? []), "fallback_applied"];
      const fallbackEntry = registryByName.get(safeFallback);
      if (fallbackEntry) {
        applyRuntimeStateTouch(fallbackEntry, runtimeStateRepoRoot, runtimeStates, warnings);
      }
    } else {
      warnings.push("All selected MCPs were blocked and no safe fallback is available.");
    }
  }

  return {
    selected: dedupSelected,
    blocked,
    warnings,
    decisions,
    reasons,
    rejected,
    runtimeStates,
    runtimeStateDrift,
  };
}

function applyRuntimeStateTouch(
  entry: McpRegistryEntry,
  repoRoot: string | undefined,
  runtimeStates: Record<string, { state: "first" | "updated" | "same"; fingerprint: string }>,
  warnings: string[],
): void {
  if (!repoRoot) {
    return;
  }
  if (runtimeStates[entry.id]) {
    return;
  }
  const result = touchExtensionState({
    repoRoot,
    spec: toExtensionSpec(entry),
  });
  runtimeStates[entry.id] = {
    state: result.state,
    fingerprint: result.fingerprint,
  };
  if (result.warning) {
    warnings.push(result.warning);
  }
}

function toExtensionSpec(entry: McpRegistryEntry): ExtensionSpec {
  return {
    id: entry.id,
    contractVersion: entry.contractVersion,
    entry: entry.entry,
    capabilities: entry.capabilities,
    priority: entry.priority,
    lanes: entry.lanes,
    roles: entry.roles,
  };
}

function pickFallback(
  entry: McpRegistryEntry,
  blocked: string[],
  options?: McpRoutingDecisionOptions,
): string | undefined {
  const fallbacks = fallbackTargets(entry);
  const staleRuntimeFailSafe = options?.staleRuntimeFailSafe ?? "degrade_or_fallback";
  const missingRuntimeFailSafe = options?.missingRuntimeFailSafe ?? "degrade_or_fallback";
  for (const fallback of fallbacks) {
    if (blocked.includes(fallback)) {
      continue;
    }
    const requiredCapabilities = options?.requiredCapabilities ?? [];
    const supportedContractVersions = options?.supportedContractVersions ?? ["v1"];
    const registryEntry = DEFAULT_MCP_REGISTRY.find((candidate) => candidate.id === fallback);
    if (!registryEntry) {
      continue;
    }
    if (!supportedContractVersions.includes(registryEntry.contractVersion)) {
      continue;
    }
    if (!registryEntry.entry) {
      continue;
    }
    if (!hasAllRequiredCapabilities(registryEntry, requiredCapabilities)) {
      continue;
    }

    const runtime = runtimeRecordFor(fallback, options?.runtimeSnapshot);
    if (!runtime) {
      if (missingRuntimeFailSafe === "degrade_or_fallback") {
        continue;
      }
      return fallback;
    }
    if (runtime.status === "unavailable" || runtime.status === "needs_auth") {
      continue;
    }
    if (staleRuntimeFailSafe === "degrade_or_fallback" && runtime.stale) {
      continue;
    }
    if (missingRuntimeFailSafe === "degrade_or_fallback" && runtime.signalMissing) {
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

function pickGlobalSafeFallback(
  blocked: string[],
  options?: McpRoutingDecisionOptions,
): string | undefined {
  const blockedSet = new Set(blocked);
  const requiredCapabilities = options?.requiredCapabilities ?? [];
  const supportedContractVersions = options?.supportedContractVersions ?? ["v1"];
  const staleRuntimeFailSafe = options?.staleRuntimeFailSafe ?? "degrade_or_fallback";
  const missingRuntimeFailSafe = options?.missingRuntimeFailSafe ?? "degrade_or_fallback";

  const orderedRegistry = [...DEFAULT_MCP_REGISTRY].sort((left, right) => {
    if (right.priority !== left.priority) {
      return right.priority - left.priority;
    }
    return left.id.localeCompare(right.id);
  });

  for (const candidate of orderedRegistry) {
    if (blockedSet.has(candidate.id)) {
      continue;
    }
    if (!supportedContractVersions.includes(candidate.contractVersion)) {
      continue;
    }
    if (!candidate.entry) {
      continue;
    }
    if (!hasAllRequiredCapabilities(candidate, requiredCapabilities)) {
      continue;
    }
    const runtime = runtimeRecordFor(candidate.id, options?.runtimeSnapshot);
    if (!runtime && missingRuntimeFailSafe === "degrade_or_fallback") {
      continue;
    }
    if (runtime && (runtime.status === "unavailable" || runtime.status === "needs_auth")) {
      continue;
    }
    if (runtime && staleRuntimeFailSafe === "degrade_or_fallback" && runtime.stale) {
      continue;
    }
    if (runtime && missingRuntimeFailSafe === "degrade_or_fallback" && runtime.signalMissing) {
      continue;
    }
    return candidate.id;
  }

  return undefined;
}
