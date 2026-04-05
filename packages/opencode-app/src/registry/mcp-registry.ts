import type { AgentRole } from "../../../shared/src/types/agent.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";

export type McpRegistryEntry = {
  mcpName: string;
  description: string;
  lanes: WorkflowLane[];
  roles: Array<AgentRole | "quick">;
  triggerTags: string[];
  priority: number;
};

export const DEFAULT_MCP_REGISTRY: McpRegistryEntry[] = [
  { mcpName: "augment_context_engine", description: "Semantic workspace code search", lanes: ["quick", "delivery", "migration"], roles: ["quick", "analyst", "architect", "implementer", "reviewer"], triggerTags: ["codebase", "trace", "impact", "bug"], priority: 100 },
  { mcpName: "context7", description: "Official docs and snippets", lanes: ["quick", "delivery", "migration"], roles: ["quick", "analyst", "architect", "reviewer"], triggerTags: ["library", "framework", "migration", "api"], priority: 90 },
  { mcpName: "grep_app", description: "Real-world GitHub examples", lanes: ["delivery", "migration"], roles: ["analyst", "architect"], triggerTags: ["research", "pattern", "migration"], priority: 80 },
  { mcpName: "websearch", description: "External research and release notes", lanes: ["delivery", "migration"], roles: ["analyst", "architect", "tester"], triggerTags: ["research", "release-notes", "ecosystem"], priority: 70 },
  { mcpName: "chrome-devtools", description: "Browser diagnostics", lanes: ["quick", "delivery", "migration"], roles: ["quick", "tester"], triggerTags: ["browser", "frontend", "performance"], priority: 95 },
  { mcpName: "playwright", description: "Browser automation", lanes: ["quick", "delivery", "migration"], roles: ["quick", "tester"], triggerTags: ["browser", "frontend", "ui-flow"], priority: 85 },
];
