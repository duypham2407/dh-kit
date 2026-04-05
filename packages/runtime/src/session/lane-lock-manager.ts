import { STAGES_BY_LANE } from "../../../shared/src/constants/stages.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";

export function createLaneLockedSession(repoRoot: string, lane: WorkflowLane): SessionState {
  const timestamp = nowIso();
  return {
    sessionId: createId("session"),
    repoRoot,
    lane,
    laneLocked: true,
    currentStage: STAGES_BY_LANE[lane][0],
    status: "in_progress",
    createdAt: timestamp,
    updatedAt: timestamp,
    activeWorkItemIds: [],
    semanticMode: "always",
    toolEnforcementLevel: "very-hard",
  };
}
