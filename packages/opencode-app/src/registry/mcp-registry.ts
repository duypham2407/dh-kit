import type { AgentRole } from "../../../shared/src/types/agent.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { McpHealthClass } from "../planner/mcp-routing-types.js";

export type McpRegistryEntry = {
  mcpName: string;
  description: string;
  lanes: WorkflowLane[];
  roles: Array<AgentRole | "quick">;
  triggerTags: string[];
  capabilities: string[];
  priority: number;
  requiresAuth?: boolean;
  degradeTo?: string[];
  healthClass?: McpHealthClass;
};

export const DEFAULT_MCP_REGISTRY: McpRegistryEntry[] = [
  {
    mcpName: "augment_context_engine",
    description: "Semantic workspace code search",
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "analyst", "architect", "implementer", "reviewer"],
    triggerTags: ["codebase", "trace", "impact", "bug"],
    capabilities: ["code_search", "impact_analysis", "traceability"],
    priority: 100,
    healthClass: "critical",
  },
  {
    mcpName: "context7",
    description: "Official docs and snippets",
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "analyst", "architect", "reviewer"],
    triggerTags: ["library", "framework", "migration", "api"],
    capabilities: ["docs_lookup", "api_reference", "migration_research"],
    priority: 90,
    healthClass: "standard",
  },
  {
    mcpName: "grep_app",
    description: "Real-world GitHub examples",
    lanes: ["delivery", "migration"],
    roles: ["analyst", "architect"],
    triggerTags: ["research", "pattern", "migration"],
    capabilities: ["pattern_research", "migration_research"],
    priority: 80,
    healthClass: "best_effort",
  },
  {
    mcpName: "websearch",
    description: "External research and release notes",
    lanes: ["delivery", "migration"],
    roles: ["analyst", "architect", "tester"],
    triggerTags: ["research", "release-notes", "ecosystem"],
    capabilities: ["ecosystem_research", "release_notes", "external_lookup"],
    priority: 70,
    healthClass: "best_effort",
  },
  {
    mcpName: "chrome-devtools",
    description: "Browser diagnostics",
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "tester"],
    triggerTags: ["browser", "frontend", "performance"],
    capabilities: ["browser_diag", "performance_diagnostics"],
    priority: 95,
    requiresAuth: true,
    degradeTo: ["playwright", "augment_context_engine"],
    healthClass: "standard",
  },
  {
    mcpName: "playwright",
    description: "Browser automation",
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "tester"],
    triggerTags: ["browser", "frontend", "ui-flow"],
    capabilities: ["browser_automation", "ui_flow", "frontend_verification"],
    priority: 85,
    requiresAuth: true,
    degradeTo: ["augment_context_engine"],
    healthClass: "standard",
  },
];
