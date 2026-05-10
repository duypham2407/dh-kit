import type { RunDirectReport, RunEvent } from "../../../packages/shared/src/types/run.js";

export type TuiStatus = "attaching" | "connected" | "running" | "read_only";

export type TuiSessionSummary = {
  id: string;
  title?: string;
};

export type TuiTranscriptItem = {
  role: "assistant" | "user" | "system";
  sessionId?: string;
  text: string;
};

export type TuiPermissionPrompt = {
  sessionId: string;
  tool: string;
  reason?: string;
};

export type TuiState = {
  serverUrl: string;
  status: TuiStatus;
  sessions: TuiSessionSummary[];
  currentSessionId?: string;
  transcript: TuiTranscriptItem[];
  prompt: string;
  model: string;
  agentId: string;
  permissionPrompt?: TuiPermissionPrompt;
  readOnlyReason?: string;
};

export type TuiAction =
  | { type: "server.connected" }
  | { type: "server.failed"; reason: string }
  | { type: "sessions.loaded"; sessions: TuiSessionSummary[] }
  | { type: "prompt.changed"; value: string }
  | { type: "model.selected"; model: string }
  | { type: "agent.selected"; agentId: string }
  | { type: "run.started"; message: string }
  | { type: "run.reported"; report: RunDirectReport };

export function createInitialTuiState(options: { serverUrl: string }): TuiState {
  return {
    serverUrl: options.serverUrl,
    status: "attaching",
    sessions: [],
    transcript: [],
    prompt: "",
    model: "default",
    agentId: "general",
  };
}

export function reduceTuiState(state: TuiState, action: TuiAction): TuiState {
  switch (action.type) {
    case "server.connected":
      return { ...state, status: "connected", readOnlyReason: undefined };
    case "server.failed":
      return { ...state, status: "read_only", readOnlyReason: action.reason };
    case "sessions.loaded": {
      return {
        ...state,
        sessions: action.sessions,
        currentSessionId: state.currentSessionId ?? action.sessions[0]?.id,
      };
    }
    case "prompt.changed":
      return { ...state, prompt: action.value };
    case "model.selected":
      return { ...state, model: action.model };
    case "agent.selected":
      return { ...state, agentId: action.agentId };
    case "run.started":
      return {
        ...state,
        status: "running",
        prompt: action.message,
        transcript: [...state.transcript, { role: "user", text: action.message, sessionId: state.currentSessionId }],
      };
    case "run.reported": {
      const permissionPrompt = findPermissionPrompt(action.report);
      const sessions = upsertSession(state.sessions, {
        id: action.report.sessionId,
        title: action.report.title ?? action.report.sessionId,
      });
      return {
        ...state,
        status: "connected",
        sessions,
        currentSessionId: action.report.sessionId,
        prompt: "",
        model: action.report.model,
        agentId: action.report.agentId,
        transcript: [
          ...state.transcript,
          { role: "assistant", sessionId: action.report.sessionId, text: action.report.text },
        ],
        permissionPrompt,
      };
    }
  }
}

function upsertSession(sessions: TuiSessionSummary[], session: TuiSessionSummary): TuiSessionSummary[] {
  if (sessions.some((entry) => entry.id === session.id)) {
    return sessions.map((entry) => (entry.id === session.id ? { ...entry, ...session } : entry));
  }
  return [session, ...sessions];
}

function findPermissionPrompt(report: RunDirectReport): TuiPermissionPrompt | undefined {
  const event = [...report.events].reverse().find(isPermissionEvent);
  if (!event) return undefined;
  return {
    sessionId: event.sessionId,
    tool: stringPayload(event.payload.tool) ?? "unknown",
    reason: stringPayload(event.payload.reason),
  };
}

function isPermissionEvent(event: RunEvent): boolean {
  return event.type === "permission.requested";
}

function stringPayload(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
