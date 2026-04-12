import type {
  ExtensionContractVersion,
  ExtensionSpec,
} from "../../../opencode-sdk/src/index.js";
import type { McpHealthClass } from "../planner/mcp-routing-types.js";

export type McpRegistryEntry = ExtensionSpec & {
  description: string;
  triggerTags: string[];
  requiresAuth?: boolean;
  degradeTo?: string[];
  healthClass?: McpHealthClass;
};

const MCP_EXTENSION_CONTRACT_VERSION: ExtensionContractVersion = "v1";

export const DEFAULT_MCP_REGISTRY: McpRegistryEntry[] = [
  {
    id: "augment_context_engine",
    contractVersion: MCP_EXTENSION_CONTRACT_VERSION,
    entry: "tool:augment_context_engine",
    description: "Semantic workspace code search",
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "analyst", "architect", "implementer", "reviewer"],
    triggerTags: ["codebase", "trace", "impact", "bug"],
    capabilities: ["code_search", "impact_analysis", "traceability"],
    priority: 100,
    healthClass: "critical",
  },
  {
    id: "context7",
    contractVersion: MCP_EXTENSION_CONTRACT_VERSION,
    entry: "tool:context7",
    description: "Official docs and snippets",
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "analyst", "architect", "reviewer"],
    triggerTags: ["library", "framework", "migration", "api"],
    capabilities: ["docs_lookup", "api_reference", "migration_research"],
    priority: 90,
    healthClass: "standard",
  },
  {
    id: "grep_app",
    contractVersion: MCP_EXTENSION_CONTRACT_VERSION,
    entry: "tool:grep_app",
    description: "Real-world GitHub examples",
    lanes: ["delivery", "migration"],
    roles: ["analyst", "architect"],
    triggerTags: ["research", "pattern", "migration"],
    capabilities: ["pattern_research", "migration_research"],
    priority: 80,
    healthClass: "best_effort",
  },
  {
    id: "websearch",
    contractVersion: MCP_EXTENSION_CONTRACT_VERSION,
    entry: "tool:websearch",
    description: "External research and release notes",
    lanes: ["delivery", "migration"],
    roles: ["analyst", "architect", "tester"],
    triggerTags: ["research", "release-notes", "ecosystem"],
    capabilities: ["ecosystem_research", "release_notes", "external_lookup"],
    priority: 70,
    healthClass: "best_effort",
  },
  {
    id: "chrome-devtools",
    contractVersion: MCP_EXTENSION_CONTRACT_VERSION,
    entry: "tool:chrome-devtools",
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
    id: "playwright",
    contractVersion: MCP_EXTENSION_CONTRACT_VERSION,
    entry: "tool:playwright",
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
