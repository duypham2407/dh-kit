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
    models: async () => ({ models: [{ id: "openai/gpt-5-codex", name: "GPT-5 Codex", providerId: "openai", modelId: "gpt-5-codex" }] }),
    agents: async () => ({ agents: [{ id: "build", displayName: "Build", role: "implementer", permission: "builder" }] }),
    inspectContext: async (input) => ({
      query: input.query,
      ledger: { id: "ledger-1", entries: [] },
      coverage: { included: 0, skipped: 0, warnings: [] },
      cache: { status: "miss", workspaceFingerprint: "fp" },
      metrics: { latencyMs: { fingerprint: 0, retrieval: 0, planning: 0, total: 0 } },
      generatedAt: "2026-05-10T00:00:00.000Z",
    }),
    run: async () => makeReport(),
    respondPermission: async (input) => ({ ...input, recorded: true }),
    forkSession: async (input) => ({ sourceSessionId: input.sessionId, sessionId: "session-fork", copied: { runtimeEvents: 0, summaries: 0, checkpoints: 0, reverts: 0 } }),
    deleteSession: async (sessionId) => ({ sessionId, deleted: { session: 1, runtimeEvents: 0, summaries: 0, checkpoints: 0, reverts: 0 } }),
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
      models: [{ id: "openai/gpt-5-codex", name: "GPT-5 Codex", providerId: "openai", modelId: "gpt-5-codex" }],
      agents: [{ id: "build", displayName: "Build", role: "implementer", permission: "builder" }],
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

  it("streams prompt events into transcript and event log when available", async () => {
    async function* runStream() {
      yield {
        type: "message.started" as const,
        sessionId: "session-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: {},
      };
      yield {
        type: "text.delta" as const,
        sessionId: "session-1",
        sequence: 2,
        timestamp: "2026-05-10T00:00:00.001Z",
        payload: { text: "streamed " },
      };
      yield {
        type: "tool.started" as const,
        sessionId: "session-1",
        sequence: 3,
        timestamp: "2026-05-10T00:00:00.002Z",
        payload: { tool: "read", path: "README.md" },
      };
      yield {
        type: "text.delta" as const,
        sessionId: "session-1",
        sequence: 4,
        timestamp: "2026-05-10T00:00:00.003Z",
        payload: { text: "answer" },
      };
      yield {
        type: "message.finished" as const,
        sessionId: "session-1",
        sequence: 5,
        timestamp: "2026-05-10T00:00:00.004Z",
        payload: { finalStatus: "clean_success" },
      };
    }
    const run = vi.fn(async () => makeReport({ text: "non-stream fallback" }));
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ run, runStream }),
    });
    await app.attach();

    await app.submitPrompt("summarize repo");

    expect(run).not.toHaveBeenCalled();
    expect(app.getState().transcript).toEqual([
      { role: "user", text: "summarize repo", sessionId: "session-1" },
      { role: "assistant", text: "streamed answer", sessionId: "session-1" },
    ]);
    expect(app.getState().eventLog).toEqual([
      { type: "message.started", sessionId: "session-1", label: "message.started" },
      { type: "tool.started", sessionId: "session-1", label: "tool.started: read README.md" },
      { type: "message.finished", sessionId: "session-1", label: "message.finished" },
    ]);
    expect(app.render()).toContain("events:");
    expect(app.render()).toContain("tool.started: read README.md");
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

  it("sends permission responses for the active prompt", async () => {
    const respondPermission = vi.fn(async (input: { sessionId: string; tool: string; decision: "allow" | "deny"; reason?: string }) => ({
      ...input,
      recorded: true,
    }));
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ respondPermission }),
    });
    await app.attach();
    await app.submitPrompt("needs permission");
    app.applyEvent({
      type: "permission.requested",
      sessionId: "session-1",
      sequence: 1,
      timestamp: "2026-05-10T00:00:00.000Z",
      payload: { tool: "write", reason: "modify file" },
    });

    await app.respondPermission("deny", "not needed");

    expect(respondPermission).toHaveBeenCalledWith({
      sessionId: "session-1",
      tool: "write",
      decision: "deny",
      reason: "not needed",
    });
    expect(app.getState().permissionPrompt).toBeUndefined();
    expect(app.render()).toContain("permission.denied: write not needed");
  });

  it("resumes selected sessions and sends subsequent prompts to that session", async () => {
    const run = vi.fn(async (input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }) =>
      makeReport({ sessionId: input.sessionId ?? "session-1", text: `answer: ${input.message}` }),
    );
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({
        sessions: async () => ({
          sessions: [
            { id: "session-1", title: "Current work" },
            { id: "session-2", title: "Bug fix" },
          ],
        }),
        run,
      }),
    });
    await app.attach();

    app.selectSession("session-2");
    await app.submitPrompt("resume this");

    expect(run).toHaveBeenCalledWith({
      message: "resume this",
      sessionId: "session-2",
      model: "default",
      agentId: "general",
    });
    expect(app.getState().currentSessionId).toBe("session-2");
  });

  it("forks and deletes the active session through the client", async () => {
    const forkSession = vi.fn(async (input: { sessionId: string; title?: string }) => ({
      sourceSessionId: input.sessionId,
      sessionId: "session-fork",
      copied: { runtimeEvents: 1, summaries: 0, checkpoints: 0, reverts: 0 },
    }));
    const deleteSession = vi.fn(async (sessionId: string) => ({
      sessionId,
      deleted: { session: 1, runtimeEvents: 1, summaries: 0, checkpoints: 0, reverts: 0 },
    }));
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ forkSession, deleteSession }),
    });
    await app.attach();

    await app.forkCurrentSession("Forked work");
    await app.deleteSession("session-fork");

    expect(forkSession).toHaveBeenCalledWith({ sessionId: "session-1", title: "Forked work" });
    expect(deleteSession).toHaveBeenCalledWith("session-fork");
    expect(app.getState().currentSessionId).toBe("session-1");
    expect(app.render()).toContain("session.deleted: session-fork");
  });

  it("selects model and agent options for subsequent prompts", async () => {
    const run = vi.fn(async (input: Omit<RunDirectInput, "repoRoot"> & { repoRoot?: string }) =>
      makeReport({ model: input.model ?? "default", agentId: input.agentId ?? "general" }),
    );
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ run }),
    });
    await app.attach();

    app.selectModel("openai/gpt-5-codex");
    app.selectAgent("build");
    await app.submitPrompt("use selected runtime");

    expect(run).toHaveBeenCalledWith({
      message: "use selected runtime",
      sessionId: "session-1",
      model: "openai/gpt-5-codex",
      agentId: "build",
    });
    expect(app.render()).toContain("model: openai/gpt-5-codex");
    expect(app.render()).toContain("agent: build");
  });

  it("plans context before submitting a prompt", async () => {
    const inspectContext = vi.fn(async (input: { query: string }) => ({
      query: input.query,
      ledger: {
        id: "ledger-1",
        entries: [{
          id: "evidence-1",
          filePath: "src/auth.ts",
          lineRange: [1, 20] as [number, number],
          reason: "Matched query.",
          score: 0.95,
          source: "symbol",
        }],
      },
      coverage: {
        included: 1,
        skipped: 0,
        warnings: [{ code: "dependency_graph_unavailable" as const, message: "Graph unavailable." }],
      },
      cache: { status: "miss" as const, workspaceFingerprint: "fp" },
      metrics: { latencyMs: { fingerprint: 0, retrieval: 0, planning: 0, total: 0 } },
      generatedAt: "2026-05-10T00:00:00.000Z",
    }));
    const app = createTuiApp({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient({ inspectContext }),
    });
    await app.attach();

    await app.submitPrompt("inspect auth");

    expect(inspectContext).toHaveBeenCalledWith({ query: "inspect auth" });
    expect(app.render()).toContain("src/auth.ts:1-20 - Matched query.");
    expect(app.render()).toContain("context warning: Graph unavailable.");
  });
});
