import type { AgentRole } from "./agent.js";
import type { WorkflowLane, SemanticMode } from "./lane.js";
import type { ResolvedModelSelection } from "./model.js";
import type { ExecutionEnvelopeBridge } from "../../../opencode-sdk/src/index.js";

type ExecutionEnvelopeBridgeAligned = Pick<
  ExecutionEnvelopeBridge,
  | "sessionId"
  | "lane"
  | "role"
  | "agentId"
  | "stage"
  | "activeSkills"
  | "activeMcps"
  | "requiredTools"
  | "semanticMode"
>;

type ExecutionEnvelopeBase = Omit<ExecutionEnvelopeBridgeAligned, "sessionId"> & {
  id: string;
  sessionId: string;
  role: Exclude<AgentRole, "quick"> | "quick";
  workItemId?: string;
  resolvedModel: ResolvedModelSelection;
  evidencePolicy: "strict";
  createdAt: string;
};

export type ExecutionEnvelopeState = ExecutionEnvelopeBase & {
  lane: WorkflowLane;
  semanticMode: SemanticMode;
};
