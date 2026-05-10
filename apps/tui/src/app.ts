import type { RunDirectInput, RunDirectReport } from "../../../packages/shared/src/types/run.js";
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
};

export type TuiApp = {
  attach: () => Promise<void>;
  submitPrompt: (message: string) => Promise<void>;
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
        const report = await options.client.run({
          message: trimmed,
          sessionId: state.currentSessionId,
          model: state.model,
          agentId: state.agentId,
        });
        state = reduceTuiState(state, { type: "run.reported", report });
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
