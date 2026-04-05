import type { WorkflowLane } from "./lane.js";

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
  defaultProvider?: string;
  defaultModel?: string;
  defaultVariant?: string;
};
