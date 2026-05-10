import type { WorkflowLane } from "./lane.js";

export type AgentMode = "primary" | "subagent";

export type AgentPermissionPolicy = "read_only" | "standard" | "builder" | "restricted";

export type AgentRole =
  | "quick"
  | "coordinator"
  | "analyst"
  | "architect"
  | "implementer"
  | "reviewer"
  | "tester";

export type AgentRegistryEntry = {
  agentId: string;
  displayName: string;
  role: AgentRole;
  lanes: WorkflowLane[];
  configurable: boolean;
  mode?: AgentMode;
  prompt?: string;
  permission?: AgentPermissionPolicy;
  defaultProvider?: string;
  defaultModel?: string;
  defaultVariant?: string;
};

export type AgentConfigSource = "builtin" | "local";

export type AgentPublicEntry = AgentRegistryEntry & {
  mode: AgentMode;
  prompt: string;
  permission: AgentPermissionPolicy;
  source: AgentConfigSource;
};

export type AgentListReport = {
  agents: AgentPublicEntry[];
};

export type AgentCreateInput = {
  id: string;
  mode: AgentMode;
  prompt: string;
  model?: string;
  permission?: AgentPermissionPolicy;
};

export type AgentCreateReport = {
  agent: AgentPublicEntry;
};
