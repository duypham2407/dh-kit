import type { RunDirectInput, RunDirectReport, RunEvent } from "../../../packages/shared/src/types/run.js";
import type {
  DhPermissionDecision,
  DhPermissionResponse,
  DhPermissionResponseInput,
  DhSessionDeleteResponse,
  DhSessionForkInput,
  DhSessionForkResponse,
} from "../../../packages/sdk/src/client.js";
import { renderTuiScreen } from "./render.js";
import {
  createInitialTuiState,
  reduceTuiState,
  type TuiSessionSummary,
  type TuiState,
} from "./state.js";

export type TuiAppClient = {
  health: () => Promise<{ ok: boolean; product: string }>;
  sessions: () => Promise<{ sessions: TuiSessionSummary[] }>;
  run: (input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }) => Promise<RunDirectReport>;
  runStream?: (input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }) => AsyncIterable<RunEvent>;
  respondPermission?: (input: DhPermissionResponseInput) => Promise<DhPermissionResponse>;
  forkSession?: (input: DhSessionForkInput) => Promise<DhSessionForkResponse>;
  deleteSession?: (sessionId: string) => Promise<DhSessionDeleteResponse>;
};

export type TuiApp = {
  attach: () => Promise<void>;
  submitPrompt: (message: string) => Promise<void>;
  applyEvent: (event: RunEvent) => void;
  respondPermission: (decision: DhPermissionDecision, reason?: string) => Promise<void>;
  selectSession: (sessionId: string) => void;
  nextSession: () => void;
  forkCurrentSession: (title?: string) => Promise<void>;
  deleteSession: (sessionId?: string) => Promise<void>;
  getState: () => TuiState;
  render: () => string;
};

export function createTuiApp(options: { serverUrl: string; client: TuiAppClient }): TuiApp {
  let state = createInitialTuiState({ serverUrl: options.serverUrl });

  return {
    async attach() {
      try {
        await options.client.health();
        state = reduceTuiState(state, { type: "server.connected" });
        const sessions = await options.client.sessions();
        state = reduceTuiState(state, { type: "sessions.loaded", sessions: sessions.sessions });
      } catch (error) {
        state = reduceTuiState(state, { type: "server.failed", reason: errorMessage(error) });
      }
    },
    async submitPrompt(message: string) {
      const trimmed = message.trim();
      if (!trimmed || state.status === "read_only") return;
      state = reduceTuiState(state, { type: "run.started", message: trimmed });
      try {
        const input = {
          message: trimmed,
          sessionId: state.currentSessionId,
          model: state.model,
          agentId: state.agentId,
        };
        if (options.client.runStream) {
          for await (const event of options.client.runStream(input)) {
            state = reduceTuiState(state, { type: "run.event", event });
          }
        } else {
          const report = await options.client.run(input);
          state = reduceTuiState(state, { type: "run.reported", report });
        }
      } catch (error) {
        state = reduceTuiState(state, { type: "server.failed", reason: errorMessage(error) });
      }
    },
    applyEvent(event: RunEvent) {
      state = reduceTuiState(state, { type: "run.event", event });
    },
    selectSession(sessionId: string) {
      state = reduceTuiState(state, { type: "session.selected", sessionId });
    },
    nextSession() {
      state = reduceTuiState(state, { type: "session.next" });
    },
    async forkCurrentSession(title?: string) {
      if (!state.currentSessionId) return;
      try {
        if (!options.client.forkSession) throw new Error("session fork is not supported by this server.");
        const input = {
          sessionId: state.currentSessionId,
          ...(title ? { title } : {}),
        };
        const report = await options.client.forkSession(input);
        state = reduceTuiState(state, {
          type: "session.forked",
          sourceSessionId: report.sourceSessionId,
          sessionId: report.sessionId,
          title,
        });
      } catch (error) {
        state = reduceTuiState(state, { type: "server.failed", reason: errorMessage(error) });
      }
    },
    async deleteSession(sessionId?: string) {
      const targetSessionId = sessionId ?? state.currentSessionId;
      if (!targetSessionId) return;
      try {
        if (!options.client.deleteSession) throw new Error("session delete is not supported by this server.");
        const report = await options.client.deleteSession(targetSessionId);
        state = reduceTuiState(state, { type: "session.deleted", sessionId: report.sessionId });
      } catch (error) {
        state = reduceTuiState(state, { type: "server.failed", reason: errorMessage(error) });
      }
    },
    async respondPermission(decision: DhPermissionDecision, reason?: string) {
      if (!state.permissionPrompt) return;
      const input = {
        sessionId: state.permissionPrompt.sessionId,
        tool: state.permissionPrompt.tool,
        decision,
        ...(reason ? { reason } : {}),
      };
      try {
        if (options.client.respondPermission) await options.client.respondPermission(input);
        state = reduceTuiState(state, { type: "permission.responded", decision, reason });
      } catch (error) {
        state = reduceTuiState(state, { type: "server.failed", reason: errorMessage(error) });
      }
    },
    getState() {
      return state;
    },
    render() {
      return renderTuiScreen(state);
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
