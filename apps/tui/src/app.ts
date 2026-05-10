import type { RunDirectInput, RunDirectReport, RunEvent } from "../../../packages/shared/src/types/run.js";
import type { DhPermissionDecision, DhPermissionResponse, DhPermissionResponseInput } from "../../../packages/sdk/src/client.js";
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
};

export type TuiApp = {
  attach: () => Promise<void>;
  submitPrompt: (message: string) => Promise<void>;
  applyEvent: (event: RunEvent) => void;
  respondPermission: (decision: DhPermissionDecision, reason?: string) => Promise<void>;
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
