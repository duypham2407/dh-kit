import type { WorkflowLane } from "./lane.js";

export type StageStatus = "pending" | "in_progress" | "passed" | "failed" | "blocked";

export type WorkflowStage =
  | "quick_intake"
  | "quick_plan"
  | "quick_execute"
  | "quick_verify"
  | "quick_complete"
  | "delivery_intake"
  | "delivery_analysis"
  | "delivery_solution"
  | "delivery_task_split"
  | "delivery_execute"
  | "delivery_review"
  | "delivery_verify"
  | "delivery_complete"
  | "migration_intake"
  | "migration_baseline"
  | "migration_strategy"
  | "migration_task_split"
  | "migration_execute"
  | "migration_review"
  | "migration_verify"
  | "migration_complete";

export type WorkflowState = {
  lane: WorkflowLane;
  stage: WorkflowStage;
  stageStatus: StageStatus;
  previousStage?: WorkflowStage;
  nextStage?: WorkflowStage;
  gateStatus: "pending" | "pass" | "fail";
  blockers: string[];
};
