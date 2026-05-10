import type { RunDirectReport, RunEvent } from "../../../packages/shared/src/types/run.js";

export type TuiStatus = "attaching" | "connected" | "running" | "read_only";

export type TuiSessionSummary = {
  id: string;
  title?: string;
  status?: string;
  stage?: string;
  updatedAt?: string;
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

export type TuiEventLogItemType = RunEvent["type"] | "session.selected" | "session.forked" | "session.deleted";

export type TuiEventLogItem = {
  type: TuiEventLogItemType;
  sessionId: string;
  label: string;
};

export type TuiState = {
  serverUrl: string;
  status: TuiStatus;
  sessions: TuiSessionSummary[];
  currentSessionId?: string;
  transcript: TuiTranscriptItem[];
  eventLog: TuiEventLogItem[];
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
  | { type: "session.selected"; sessionId: string }
  | { type: "session.next" }
  | { type: "session.forked"; sourceSessionId: string; sessionId: string; title?: string }
  | { type: "session.deleted"; sessionId: string }
  | { type: "prompt.changed"; value: string }
  | { type: "model.selected"; model: string }
  | { type: "agent.selected"; agentId: string }
  | { type: "run.started"; message: string }
  | { type: "run.event"; event: RunEvent }
  | { type: "permission.responded"; decision: "allow" | "deny"; reason?: string }
  | { type: "run.reported"; report: RunDirectReport };

export function createInitialTuiState(options: { serverUrl: string }): TuiState {
  return {
    serverUrl: options.serverUrl,
    status: "attaching",
    sessions: [],
    transcript: [],
    eventLog: [],
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
        currentSessionId: state.currentSessionId && action.sessions.some((session) => session.id === state.currentSessionId)
          ? state.currentSessionId
          : action.sessions[0]?.id,
      };
    }
    case "session.selected":
      return selectSession(state, action.sessionId);
    case "session.next":
      return selectNextSession(state);
    case "session.forked":
      return forkSession(state, action.sourceSessionId, action.sessionId, action.title);
    case "session.deleted":
      return deleteSession(state, action.sessionId);
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
        eventLog: [],
        transcript: [...state.transcript, { role: "user", text: action.message, sessionId: state.currentSessionId }],
      };
    case "run.event":
      return applyRunEvent(state, action.event);
    case "permission.responded":
      return applyPermissionResponse(state, action.decision, action.reason);
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

function selectSession(state: TuiState, sessionId: string): TuiState {
  if (!state.sessions.some((session) => session.id === sessionId)) return state;
  return {
    ...state,
    currentSessionId: sessionId,
    eventLog: [...state.eventLog, { type: "session.selected", sessionId, label: `session.selected: ${sessionId}` }],
  };
}

function selectNextSession(state: TuiState): TuiState {
  if (state.sessions.length === 0) return state;
  const currentIndex = state.sessions.findIndex((session) => session.id === state.currentSessionId);
  const next = state.sessions[(currentIndex + 1) % state.sessions.length] ?? state.sessions[0];
  return next ? selectSession(state, next.id) : state;
}

function forkSession(state: TuiState, sourceSessionId: string, sessionId: string, title?: string): TuiState {
  return {
    ...state,
    currentSessionId: sessionId,
    sessions: upsertSession(state.sessions, {
      id: sessionId,
      title: title ?? `Fork of ${sourceSessionId}`,
    }),
    eventLog: [
      ...state.eventLog,
      { type: "session.forked", sessionId, label: `session.forked: ${sourceSessionId} -> ${sessionId}` },
    ],
  };
}

function deleteSession(state: TuiState, sessionId: string): TuiState {
  const sessions = state.sessions.filter((session) => session.id !== sessionId);
  return {
    ...state,
    sessions,
    currentSessionId: state.currentSessionId === sessionId ? sessions[0]?.id : state.currentSessionId,
    eventLog: [
      ...state.eventLog,
      { type: "session.deleted", sessionId, label: `session.deleted: ${sessionId}` },
    ],
  };
}

function applyPermissionResponse(state: TuiState, decision: "allow" | "deny", reason?: string): TuiState {
  if (!state.permissionPrompt) return state;
  const suffix = reason ? ` ${reason}` : "";
  return {
    ...state,
    permissionPrompt: undefined,
    eventLog: [
      ...state.eventLog,
      {
        type: "permission.requested",
        sessionId: state.permissionPrompt.sessionId,
        label: `permission.${decision === "allow" ? "approved" : "denied"}: ${state.permissionPrompt.tool}${suffix}`,
      },
    ],
  };
}

function applyRunEvent(state: TuiState, event: RunEvent): TuiState {
  const base: TuiState = {
    ...state,
    currentSessionId: event.sessionId,
    status: event.type === "message.finished" || event.type === "session.finished" ? "connected" : state.status,
  };

  if (event.type === "text.delta") {
    return {
      ...base,
      transcript: appendAssistantDelta(base.transcript, event.sessionId, stringPayload(event.payload.text) ?? ""),
    };
  }

  if (event.type === "permission.requested") {
    return {
      ...base,
      permissionPrompt: {
        sessionId: event.sessionId,
        tool: stringPayload(event.payload.tool) ?? "unknown",
        reason: stringPayload(event.payload.reason),
      },
      eventLog: [...base.eventLog, toEventLogItem(event)],
    };
  }

  return {
    ...base,
    eventLog: [...base.eventLog, toEventLogItem(event)],
  };
}

function appendAssistantDelta(transcript: TuiTranscriptItem[], sessionId: string, delta: string): TuiTranscriptItem[] {
  const last = transcript[transcript.length - 1];
  if (last?.role === "assistant" && last.sessionId === sessionId) {
    return [
      ...transcript.slice(0, -1),
      { ...last, text: `${last.text}${delta}` },
    ];
  }
  return [...transcript, { role: "assistant", sessionId, text: delta }];
}

function toEventLogItem(event: RunEvent): TuiEventLogItem {
  return {
    type: event.type,
    sessionId: event.sessionId,
    label: eventLabel(event),
  };
}

function eventLabel(event: RunEvent): string {
  const tool = stringPayload(event.payload.tool);
  const path = stringPayload(event.payload.path);
  if (tool) return `${event.type}: ${path ? `${tool} ${path}` : tool}`;
  return event.type;
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
