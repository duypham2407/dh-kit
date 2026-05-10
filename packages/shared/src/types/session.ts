import type { SemanticMode, ToolEnforcementLevel, WorkflowLane } from "./lane.js";
import type {
  SessionCheckpointRecord,
  SessionRevertRecord,
  SessionRuntimeEventRecord,
  SessionSummaryRecord,
} from "./session-runtime.js";
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
  latestSummaryId?: string;
  latestCheckpointId?: string;
  latestRevertId?: string;
};

export const SESSION_EXPORT_SCHEMA_VERSION = 1 as const;

export type SessionExportSchemaVersion = typeof SESSION_EXPORT_SCHEMA_VERSION;

export type SessionExportSource = {
  product: "dh";
  version: string;
  repoRoot: string;
};

export type SessionExportPayload = {
  session: SessionState;
  runtimeEvents: SessionRuntimeEventRecord[];
  summaries: SessionSummaryRecord[];
  checkpoints: SessionCheckpointRecord[];
  reverts: SessionRevertRecord[];
};

export type SessionExportDocument = {
  schemaVersion: SessionExportSchemaVersion;
  exportedAt: string;
  source: SessionExportSource;
  sanitized: boolean;
  payload: SessionExportPayload;
};

export type SessionListReport = {
  sessions: SessionState[];
};

export type SessionShowReport = {
  session: SessionState;
  latestSummary?: SessionSummaryRecord;
  counts: {
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionImportReport = {
  sessionId: string;
  imported: {
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionDeleteReport = {
  sessionId: string;
  deleted: {
    session: number;
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionForkReport = {
  sourceSessionId: string;
  sessionId: string;
  copied: {
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionStatsBucket = {
  key: string;
  count: number;
};

export type SessionStatsReport = {
  generatedAt: string;
  days?: number;
  totalSessions: number;
  sessionsByLane: SessionStatsBucket[];
  sessionsByStatus: SessionStatsBucket[];
  runtimeEventsByType: SessionStatsBucket[];
  topModels: SessionStatsBucket[];
  topTools: SessionStatsBucket[];
  tokenUsage: "unavailable" | {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd: "unavailable" | number;
};
