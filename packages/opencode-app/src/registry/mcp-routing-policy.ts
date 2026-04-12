import type { McpRegistryEntry } from "./mcp-registry.js";
import type {
  McpReasonCode,
  McpRuntimeRecord,
  McpRuntimeSnapshot,
  McpRoutingStatus,
} from "../planner/mcp-routing-types.js";

export function inferIntentTags(intent: string): string[] {
  const normalized = intent.toLowerCase();
  const tags = new Set<string>(["codebase"]);

  if (normalized.includes("trace")) {
    tags.add("trace");
  }
  if (normalized.includes("impact")) {
    tags.add("impact");
  }
  if (normalized.includes("bug") || normalized.includes("debug")) {
    tags.add("bug");
  }
  if (normalized.includes("library") || normalized.includes("framework") || normalized.includes("api")) {
    tags.add("library");
    tags.add("framework");
    tags.add("api");
  }
  if (normalized.includes("browser") || normalized.includes("ui") || normalized.includes("frontend")) {
    tags.add("browser");
    tags.add("frontend");
    tags.add("ui-flow");
    tags.add("performance");
  }
  if (normalized.includes("migration") || normalized.includes("release")) {
    tags.add("migration");
    tags.add("research");
    tags.add("release-notes");
    tags.add("ecosystem");
    tags.add("pattern");
  }

  return Array.from(tags);
}

export function scoreRegistryEntry(input: {
  entry: McpRegistryEntry;
  intentTags: string[];
}): { score: number; reasons: McpReasonCode[] } {
  const { entry, intentTags } = input;
  let score = entry.priority;
  const reasons: McpReasonCode[] = ["priority_boost"];

  const hasIntentTagMatch = entry.triggerTags.some((tag) => intentTags.includes(tag));
  if (hasIntentTagMatch) {
    score += 20;
    reasons.push("intent_match", "capability_match");
  } else {
    score -= 25;
    reasons.push("intent_no_match", "deprioritized");
  }

  return { score, reasons };
}

export function runtimeRecordFor(mcpName: string, snapshot?: McpRuntimeSnapshot): McpRuntimeRecord | undefined {
  if (!snapshot) {
    return undefined;
  }
  return snapshot[mcpName];
}

export function runtimeStatusFor(mcpName: string, snapshot?: McpRuntimeSnapshot): McpRoutingStatus | undefined {
  return runtimeRecordFor(mcpName, snapshot)?.status;
}

export function fallbackTargets(entry: McpRegistryEntry): string[] {
  return entry.degradeTo ?? [];
}

export function canUseDegraded(entry: McpRegistryEntry): boolean {
  if (!entry.healthClass) {
    return false;
  }
  return entry.healthClass !== "critical";
}

export function hasAllRequiredCapabilities(entry: McpRegistryEntry, requiredCapabilities: string[]): boolean {
  return requiredCapabilities.every((capability) => entry.capabilities.includes(capability));
}
