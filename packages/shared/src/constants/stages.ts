import type { WorkflowLane } from "../types/lane.js";
import type { WorkflowStage } from "../types/stage.js";

export const STAGES_BY_LANE: Record<WorkflowLane, WorkflowStage[]> = {
  quick: ["quick_intake", "quick_plan", "quick_execute", "quick_verify", "quick_complete"],
  delivery: [
    "delivery_intake",
    "delivery_analysis",
    "delivery_solution",
    "delivery_task_split",
    "delivery_execute",
    "delivery_review",
    "delivery_verify",
    "delivery_complete",
  ],
  migration: [
    "migration_intake",
    "migration_baseline",
    "migration_strategy",
    "migration_task_split",
    "migration_execute",
    "migration_review",
    "migration_verify",
    "migration_complete",
  ],
};
