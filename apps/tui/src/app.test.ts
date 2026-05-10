import { describe, expect, it, vi } from "vitest";
import type { RunDirectInput, RunDirectReport } from "../../../packages/shared/src/types/run.js";
import { createTuiApp, type TuiAppClient } from "./app.js";

function makeReport(overrides: Partial<RunDirectReport> = {}): RunDirectReport {
  return {
    exitCode: 0,
    command: "run",
    sessionId: "session-1",
    model: "openai/gpt-5",
    agentId: "general",
    text: "answer",
    events: [],
    files: [],
    runtimeAuthority: "typescript_worker",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

function makeClient(overrides: Partial<TuiAppClient> = {}): TuiAppClient {
  return {
    health: async () => ({ ok: true, product: "dh" }),
    sessions: async () => ({ sessions: [{ id: "session-1", title: "Current work" }] }),
    run: async () => makeReport(),
    ...overrides,
  };
}

describe("createTuiApp", () => {
  it("attaches to health and sessions", async () => {
    const app = createTuiApp({ serverUrl: "http://127.0.0.1:3000", client: makeClient() });

    await app.attach();

    expect(app.getState()).toMatchObject({
      status: "connected",
      currentSessionId: "session-1",
      sessions: [{ id: "session-1", title: "Current work" }],
    });
    expect(app.render()).toContain("status: connected");
  });

  it("falls back to read-only state when attach fails", async () => {
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:9",
      client: makeClient({
        health: async () => {
          throw new Error("connection refused");
        },
      }),
    });

    await app.attach();

    expect(app.getState()).toMatchObject({
      status: "read_only",
      readOnlyReason: "connection refused",
    });
  });

  it("submits a prompt through the client and appends the report", async () => {
    const run = vi.fn(async (input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }) =>
      makeReport({ text: `answer: ${input.message}` }),
    );
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ run }),
    });
    await app.attach();

    await app.submitPrompt("summarize repo");

    expect(run).toHaveBeenCalledWith({
      message: "summarize repo",
      sessionId: "session-1",
      model: "default",
      agentId: "general",
    });
    expect(app.getState().transcript).toEqual([
      { role: "user", text: "summarize repo", sessionId: "session-1" },
      { role: "assistant", text: "answer: summarize repo", sessionId: "session-1" },
    ]);
  });

  it("ignores empty prompts", async () => {
    const run = vi.fn(async () => makeReport());
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ run }),
    });
    await app.attach();

    await app.submitPrompt("   ");

    expect(run).not.toHaveBeenCalled();
    expect(app.getState().transcript).toEqual([]);
  });
});
