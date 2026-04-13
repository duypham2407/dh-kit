import type { WorkflowLane } from "./lane.js";
import type { WorkflowStage } from "./stage.js";

export type SessionRuntimeEventType =
  | "busy"
  | "idle"
  | "cancel"
  | "retry"
  | "retry_give_up"
  | "summary_updated"
  | "compaction"
  | "checkpoint_created"
  | "revert";

export type SessionRuntimeEventRecord = {
  id: string;
  sessionId: string;
  eventType: SessionRuntimeEventType;
  eventJson: Record<string, unknown>;
  createdAt: string;
};

export type SessionSummaryRecord = {
  id: string;
  sessionId: string;
  filesChanged: number;
  additions: number;
  deletions: number;
  lastDiffAt?: string;
  latestStage?: WorkflowStage;
  latestCheckpointId?: string;
  continuationSummary?: string;
  continuationCreatedAt?: string;
  updatedAt: string;
};

export type SessionCheckpointRecord = {
  id: string;
  sessionId: string;
  checkpointType: "session_bootstrap" | "post_workflow" | "post_stage_advance" | "pre_revert";
  lane: WorkflowLane;
  stage: WorkflowStage;
  summarySnapshotJson: Record<string, unknown>;
  workflowSnapshotJson: Record<string, unknown>;
  continuationJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
  createdAt: string;
};

export type SessionRevertRecord = {
  id: string;
  sessionId: string;
  checkpointId: string;
  previousCheckpointId?: string;
  reason: string;
  createdAt: string;
};
