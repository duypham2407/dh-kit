import { STAGES_BY_LANE } from "../../../shared/src/constants/stages.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { WorkflowState } from "../../../shared/src/types/stage.js";

export function createWorkflowState(session: SessionState): WorkflowState {
  const stages = STAGES_BY_LANE[session.lane];
  return {
    lane: session.lane,
    stage: stages[0],
    stageStatus: "in_progress",
    previousStage: undefined,
    nextStage: stages[1],
    gateStatus: "pending",
    blockers: [],
  };
}
