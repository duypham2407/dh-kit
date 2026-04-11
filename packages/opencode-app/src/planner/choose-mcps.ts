import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";
import { inferIntentTags, runtimeStatusFor, scoreRegistryEntry } from "../registry/mcp-routing-policy.js";
import type {
  McpReasonCode,
  McpRoutingDecision,
  McpRoutingDecisionOptions,
} from "./mcp-routing-types.js";

export function chooseMcps(envelope: ExecutionEnvelopeState, intent: string): string[] {
  return chooseMcpsDetailed(envelope, intent).selected;
}

export function chooseMcpsDetailed(
  envelope: ExecutionEnvelopeState,
  intent: string,
  options?: McpRoutingDecisionOptions,
): McpRoutingDecision {
  const tags = inferIntentTags(intent);
  const maxSelected = options?.maxSelected ?? 4;
  const selected: string[] = [];
  const reasons: Record<string, McpReasonCode[]> = {};
  const rejected: Record<string, McpReasonCode[]> = {};
  const blocked: string[] = [];
  const warnings: string[] = [];

  const candidates = DEFAULT_MCP_REGISTRY
    .map((entry) => {
      const entryReasons: McpReasonCode[] = [];

      if (!entry.lanes.includes(envelope.lane)) {
        rejected[entry.mcpName] = ["lane_mismatch"];
        return null;
      }
      entryReasons.push("lane_match");

      if (!entry.roles.includes(envelope.role)) {
        rejected[entry.mcpName] = ["role_mismatch"];
        return null;
      }
      entryReasons.push("role_match");

      const scored = scoreRegistryEntry({
        entry,
        intentTags: tags,
      });

      const runtimeStatus = runtimeStatusFor(entry.mcpName, options?.runtimeSnapshot);
      if (!runtimeStatus) {
        entryReasons.push("no_runtime_status");
      }

      return {
        entry,
        score: scored.score,
        reasons: [...entryReasons, ...scored.reasons],
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
    .sort((left, right) => right.score - left.score);

  for (const candidate of candidates) {
    if (selected.length >= maxSelected) {
      rejected[candidate.entry.mcpName] = [...candidate.reasons, "deprioritized"];
      continue;
    }

    selected.push(candidate.entry.mcpName);
    reasons[candidate.entry.mcpName] = candidate.reasons;
  }

  if (selected.length === 0) {
    warnings.push("No MCP candidate selected by lane/role policy. Fallback to augment_context_engine.");
    selected.push("augment_context_engine");
    reasons.augment_context_engine = ["fallback_applied"];
  }

  return {
    selected,
    blocked,
    warnings,
    reasons,
    rejected,
  };
}
