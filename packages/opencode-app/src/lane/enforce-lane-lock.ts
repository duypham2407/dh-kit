import type { WorkflowLane } from "../../../shared/src/types/lane.js";

export function enforceLaneLock(currentLane: WorkflowLane, requestedLane: WorkflowLane): void {
  if (currentLane !== requestedLane) {
    throw new Error(`Lane is locked to '${currentLane}', cannot switch to '${requestedLane}' without explicit user command.`);
  }
}
