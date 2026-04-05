import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";

export function chooseMcps(envelope: ExecutionEnvelopeState, intent: string): string[] {
  const tags = buildMcpTags(intent);
  return DEFAULT_MCP_REGISTRY
    .filter((entry) => entry.lanes.includes(envelope.lane) && entry.roles.includes(envelope.role) && entry.triggerTags.some((tag) => tags.includes(tag)))
    .sort((left, right) => right.priority - left.priority)
    .map((entry) => entry.mcpName);
}

function buildMcpTags(intent: string): string[] {
  const normalized = intent.toLowerCase();
  const tags = ["codebase"];
  if (normalized.includes("trace")) {
    tags.push("trace");
  }
  if (normalized.includes("impact")) {
    tags.push("impact");
  }
  if (normalized.includes("bug") || normalized.includes("debug")) {
    tags.push("bug");
  }
  if (normalized.includes("library") || normalized.includes("framework") || normalized.includes("api")) {
    tags.push("library", "framework", "api");
  }
  if (normalized.includes("browser") || normalized.includes("ui") || normalized.includes("frontend")) {
    tags.push("browser", "frontend", "ui-flow", "performance");
  }
  if (normalized.includes("migration") || normalized.includes("release")) {
    tags.push("migration", "research", "release-notes", "ecosystem", "pattern");
  }
  return tags;
}
