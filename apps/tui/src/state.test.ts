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

  it("switches, forks, and deletes sessions from the active shell", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, {
      type: "sessions.loaded",
      sessions: [
        { id: "session-1", title: "Current work" },
        { id: "session-2", title: "Bug fix" },
      ],
    });

    state = reduceTuiState(state, { type: "session.selected", sessionId: "session-2" });
    state = reduceTuiState(state, {
      type: "session.forked",
      sourceSessionId: "session-2",
      sessionId: "session-3",
      title: "Forked bug fix",
    });
    state = reduceTuiState(state, { type: "session.deleted", sessionId: "session-3" });

    expect(state.currentSessionId).toBe("session-1");
    expect(state.sessions).toEqual([
      { id: "session-1", title: "Current work" },
      { id: "session-2", title: "Bug fix" },
    ]);
    expect(state.eventLog.map((event) => event.label)).toEqual([
      "session.selected: session-2",
      "session.forked: session-2 -> session-3",
      "session.deleted: session-3",
    ]);
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

  it("tracks model and agent options plus selected context evidence", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, {
      type: "models.loaded",
      models: [{ id: "openai/gpt-5-codex", name: "GPT-5 Codex", providerId: "openai", modelId: "gpt-5-codex" }],
    });
    state = reduceTuiState(state, {
      type: "agents.loaded",
      agents: [{ id: "build", displayName: "Build", role: "implementer", permission: "builder" }],
    });
    state = reduceTuiState(state, { type: "model.selected", model: "openai/gpt-5-codex" });
    state = reduceTuiState(state, { type: "agent.selected", agentId: "build" });
    state = reduceTuiState(state, {
      type: "run.reported",
      report: makeReport({
        model: "openai/gpt-5-codex",
        agentId: "build",
        finalStatus: "degraded_success",
        degradedReason: "rust host unavailable",
        files: [{ path: "src/auth.ts", byteLength: 120 }],
      }),
    });

    expect(state.model).toBe("openai/gpt-5-codex");
    expect(state.agentId).toBe("build");
    expect(state.models).toEqual([{ id: "openai/gpt-5-codex", name: "GPT-5 Codex", providerId: "openai", modelId: "gpt-5-codex" }]);
    expect(state.agents).toEqual([{ id: "build", displayName: "Build", role: "implementer", permission: "builder" }]);
    expect(state.contextItems).toEqual([
      { path: "src/auth.ts", label: "src/auth.ts (120 bytes)", reason: "attached file", byteLength: 120 },
    ]);
    expect(state.finalStatus).toBe("degraded_success");
    expect(state.runtimeDegradedReason).toBe("rust host unavailable");
    expect(state.eventLog.map((event) => event.label)).toContain("model.selected: openai/gpt-5-codex");
    expect(state.eventLog.map((event) => event.label)).toContain("agent.selected: build");
  });

  it("applies streamed text deltas and tool events", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, { type: "run.started", message: "inspect auth" });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "text.delta",
        sessionId: "session-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: { text: "first " },
      },
    });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "tool.started",
        sessionId: "session-1",
        sequence: 2,
        timestamp: "2026-05-10T00:00:00.001Z",
        payload: { tool: "read", path: "src/auth.ts" },
      },
    });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "text.delta",
        sessionId: "session-1",
        sequence: 3,
        timestamp: "2026-05-10T00:00:00.002Z",
        payload: { text: "second" },
      },
    });

    expect(state.transcript).toEqual([
      { role: "user", text: "inspect auth", sessionId: undefined },
      { role: "assistant", text: "first second", sessionId: "session-1" },
    ]);
    expect(state.currentSessionId).toBe("session-1");
    expect(state.eventLog).toEqual([
      { type: "tool.started", sessionId: "session-1", label: "tool.started: read src/auth.ts" },
    ]);
  });

  it("returns to connected state when a streamed message finishes", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, { type: "run.started", message: "inspect auth" });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "message.finished",
        sessionId: "session-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: {},
      },
    });

    expect(state.status).toBe("connected");
  });

  it("renders runtime degradation and tool paths from streamed events as context", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, { type: "run.started", message: "inspect auth" });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "tool.started",
        sessionId: "session-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: { tool: "read", path: "src/auth.ts" },
      },
    });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "runtime.degraded",
        sessionId: "session-1",
        sequence: 2,
        timestamp: "2026-05-10T00:00:00.001Z",
        payload: { reason: "rust host unavailable" },
      },
    });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "message.finished",
        sessionId: "session-1",
        sequence: 3,
        timestamp: "2026-05-10T00:00:00.002Z",
        payload: { finalStatus: "degraded_success" },
      },
    });

    expect(state.contextItems).toEqual([
      { path: "src/auth.ts", label: "src/auth.ts", reason: "tool.started: read" },
    ]);
    expect(state.runtimeDegradedReason).toBe("rust host unavailable");
    expect(state.finalStatus).toBe("degraded_success");
  });

  it("clears permission prompt after approval or denial", () => {
    let state = createInitialTuiState({ serverUrl: "http://127.0.0.1:3000" });
    state = reduceTuiState(state, {
      type: "run.event",
      event: {
        type: "permission.requested",
        sessionId: "session-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: { tool: "write", reason: "modify file" },
      },
    });

    state = reduceTuiState(state, {
      type: "permission.responded",
      decision: "deny",
      reason: "not needed",
    });

    expect(state.permissionPrompt).toBeUndefined();
    expect(state.eventLog.at(-1)).toEqual({
      type: "permission.requested",
      sessionId: "session-1",
      label: "permission.denied: write not needed",
    });
  });

  it("enters read-only fallback when the server cannot be reached", () => {
    const initial = createInitialTuiState({ serverUrl: "http://127.0.0.1:9" });
    const state = reduceTuiState(initial, { type: "server.failed", reason: "connection refused" });

    expect(state.status).toBe("read_only");
    expect(state.readOnlyReason).toBe("connection refused");
  });
});
