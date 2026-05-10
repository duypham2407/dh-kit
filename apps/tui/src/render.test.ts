import { describe, expect, it } from "vitest";
import type { TuiState } from "./state.js";
import { createInitialTuiState, reduceTuiState } from "./state.js";
import { renderTuiScreen } from "./render.js";

function connectedState(): TuiState {
  let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
  state = reduceTuiState(state, { type: "server.connected" });
  state = reduceTuiState(state, {
    type: "sessions.loaded",
    sessions: [{ id: "session-1", title: "Current work" }],
  });
  return state;
}

describe("renderTuiScreen", () => {
  it("renders the attached session shell", () => {
    const output = renderTuiScreen(connectedState());

    expect(output).toContain("DH TUI");
    expect(output).toContain("server: http://127.0.0.1:3000");
    expect(output).toContain("status: connected");
    expect(output).toContain("session-1 Current work");
    expect(output).toContain("prompt:");
  });

  it("renders transcript and permission prompt", () => {
    let state = connectedState();
    state = reduceTuiState(state, {
      type: "run.reported",
      report: {
        exitCode: 0,
        command: "run",
        sessionId: "session-1",
        model: "openai/gpt-5",
        agentId: "general",
        text: "done",
        events: [
          {
            type: "permission.requested",
            sessionId: "session-1",
            sequence: 1,
            timestamp: "2026-05-10T00:00:00.000Z",
            payload: { tool: "edit", reason: "modify file" },
          },
        ],
        files: [],
        runtimeAuthority: "typescript_worker",
        finalStatus: "clean_success",
        degradedReason: null,
      },
    });

    const output = renderTuiScreen(state);

    expect(output).toContain("assistant: done");
    expect(output).toContain("permission: edit");
    expect(output).toContain("modify file");
  });

  it("renders read-only fallback", () => {
    const state = reduceTuiState(
      createInitialTuiState({ serverUrl: "http://127.0.0.1:9" }),
      { type: "server.failed", reason: "connection refused" },
    );

    const output = renderTuiScreen(state);

    expect(output).toContain("status: read_only");
    expect(output).toContain("read-only: connection refused");
  });
});
