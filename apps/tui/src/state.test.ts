import { describe, expect, it } from "vitest";
import type { RunDirectReport } from "../../../packages/shared/src/types/run.js";
import { createInitialTuiState, reduceTuiState } from "./state.js";

function makeReport(overrides: Partial<RunDirectReport> = {}): RunDirectReport {
  return {
    exitCode: 0,
    command: "run",
    sessionId: "session-1",
    model: "openai/gpt-5",
    agentId: "general",
    text: "hello from dh",
    events: [
      {
        type: "permission.requested",
        sessionId: "session-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: { tool: "bash", reason: "run tests" },
      },
    ],
    files: [],
    runtimeAuthority: "typescript_worker",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

describe("TUI state reducer", () => {
  it("tracks attach and loaded sessions", () => {
    const initial = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    const connected = reduceTuiState(initial, { type: "server.connected" });
    const loaded = reduceTuiState(connected, {
      type: "sessions.loaded",
      sessions: [{ id: "session-1", title: "Current work" }],
    });

    expect(loaded.status).toBe("connected");
    expect(loaded.serverUrl).toBe("http://127.0.0.1:3000");
    expect(loaded.sessions).toEqual([{ id: "session-1", title: "Current work" }]);
    expect(loaded.currentSessionId).toBe("session-1");
  });

  it("captures prompt, model, agent, transcript, and permission request state", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, { type: "prompt.changed", value: "summarize repo" });
    state = reduceTuiState(state, { type: "model.selected", model: "anthropic/claude-sonnet-4.5" });
    state = reduceTuiState(state, { type: "agent.selected", agentId: "build" });
    state = reduceTuiState(state, { type: "run.reported", report: makeReport() });

    expect(state.prompt).toBe("");
    expect(state.model).toBe("openai/gpt-5");
    expect(state.agentId).toBe("general");
    expect(state.transcript).toEqual([
      {
        role: "assistant",
        sessionId: "session-1",
        text: "hello from dh",
      },
    ]);
    expect(state.permissionPrompt).toEqual({
      sessionId: "session-1",
      tool: "bash",
      reason: "run tests",
    });
  });

  it("enters read-only fallback when the server cannot be reached", () => {
    const initial = createInitialTuiState({ serverUrl: "http://127.0.0.1:9" });
    const state = reduceTuiState(initial, { type: "server.failed", reason: "connection refused" });

    expect(state.status).toBe("read_only");
    expect(state.readOnlyReason).toBe("connection refused");
  });
});
