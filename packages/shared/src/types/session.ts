import type { SemanticMode, ToolEnforcementLevel, WorkflowLane } from "./lane.js";
import type { WorkflowStage } from "./stage.js";

export type SessionStatus = "pending" | "in_progress" | "blocked" | "complete";

export type SessionState = {
  sessionId: string;
  repoRoot: string;
  lane: WorkflowLane;
  laneLocked: true;
  currentStage: WorkflowStage;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  activeWorkItemIds: string[];
  semanticMode: SemanticMode;
  toolEnforcementLevel: ToolEnforcementLevel;
};
