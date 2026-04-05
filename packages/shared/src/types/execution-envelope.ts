import type { AgentRole } from "./agent.js";
import type { WorkflowLane, SemanticMode } from "./lane.js";
import type { ResolvedModelSelection } from "./model.js";

export type ExecutionEnvelopeState = {
  id: string;
  sessionId: string;
  lane: WorkflowLane;
  role: Exclude<AgentRole, "quick"> | "quick";
  agentId: string;
  stage: string;
  workItemId?: string;
  resolvedModel: ResolvedModelSelection;
  activeSkills: string[];
  activeMcps: string[];
  requiredTools: string[];
  semanticMode: SemanticMode;
  evidencePolicy: "strict";
  createdAt: string;
};
