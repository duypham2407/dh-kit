import { describe, expect, it } from "vitest";
import type { TuiAppClient } from "./app.js";
import { runTui } from "./main.js";

function makeClient(): TuiAppClient {
  return {
    health: async () => ({ ok: true, product: "dh" }),
    sessions: async () => ({
      sessions: [
        { id: "session-1", title: "Current work" },
        { id: "session-2", title: "Bug fix" },
      ],
    }),
    run: async (input) => ({
      exitCode: 0,
      command: "run",
      sessionId: input.sessionId ?? "session-1",
      model: "openai/gpt-5",
      agentId: "general",
      text: `answer: ${input.message}`,
      events: [],
      files: [],
      runtimeAuthority: "typescript_worker",
      finalStatus: "clean_success",
      degradedReason: null,
    }),
    forkSession: async (input) => ({
      sourceSessionId: input.sessionId,
      sessionId: "session-fork",
      copied: { runtimeEvents: 0, summaries: 0, checkpoints: 0, reverts: 0 },
    }),
    deleteSession: async (sessionId) => ({
      sessionId,
      deleted: { session: 1, runtimeEvents: 0, summaries: 0, checkpoints: 0, reverts: 0 },
    }),
  };
}

describe("runTui", () => {
  it("renders once and exits for non-interactive input", async () => {
    const chunks: string[] = [];

    await runTui({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient(),
      input: { isTTY: false },
      output: { write: (chunk: string) => chunks.push(chunk) },
    });

    expect(chunks.join("")).toContain("DH TUI");
    expect(chunks.join("")).toContain("session-1 Current work");
  });

  it("supports approve and deny commands in interactive mode", async () => {
    const chunks: string[] = [];
    const input = {
      isTTY: true,
    };
    const questions = ["/approve", "/deny no", "/quit"];

    await runTui({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient(),
      input,
      output: { write: (chunk: string) => chunks.push(chunk) },
      createQuestionLoop: () => ({
        question: async () => questions.shift() ?? "/quit",
        close: () => undefined,
      }),
    });

    expect(chunks.join("")).toContain("DH TUI");
  });

  it("supports session lifecycle commands in interactive mode", async () => {
    const chunks: string[] = [];
    const input = {
      isTTY: true,
    };
    const questions = ["/resume session-2", "continue", "/fork Forked work", "/delete session-fork", "/quit"];

    await runTui({
      serverUrl: "http://127.0.0.1:3000",
      client: makeClient(),
      input,
      output: { write: (chunk: string) => chunks.push(chunk) },
      createQuestionLoop: () => ({
        question: async () => questions.shift() ?? "/quit",
        close: () => undefined,
      }),
    });

    const output = chunks.join("");
    expect(output).toContain("* session-2 Bug fix");
    expect(output).toContain("assistant: answer: continue");
    expect(output).toContain("session.forked: session-2 -> session-fork");
    expect(output).toContain("session.deleted: session-fork");
  });
});
