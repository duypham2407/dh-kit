import type { RuntimeAuthorityFields } from "./runtime-authority.js";

export type RunEventType =
  | "session.created"
  | "message.started"
  | "text.delta"
  | "tool.started"
  | "tool.delta"
  | "tool.finished"
  | "permission.requested"
  | "message.finished"
  | "session.finished"
  | "runtime.degraded";

export type RunEventPayload = Record<string, unknown>;

export type RunEvent<TType extends RunEventType = RunEventType> = {
  type: TType;
  sessionId: string;
  sequence: number;
  timestamp: string;
  payload: RunEventPayload;
};

export type RunFileAttachment = {
  path: string;
  content: string;
  byteLength: number;
};

export type RunDirectInput = {
  message: string;
  repoRoot: string;
  continueLatest?: boolean;
  sessionId?: string;
  fork?: boolean;
  model?: string;
  agentId?: string;
  variant?: string;
  files?: string[];
  title?: string;
  autoApprove?: boolean;
};

export type RunDirectReport = RuntimeAuthorityFields & {
  exitCode: number;
  command: "run";
  sessionId: string;
  model: string;
  agentId: string;
  title?: string;
  text: string;
  events: RunEvent[];
  files: Array<Omit<RunFileAttachment, "content">>;
};
