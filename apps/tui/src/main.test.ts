import { describe, expect, it } from "vitest";
import type { TuiAppClient } from "./app.js";
import { runTui } from "./main.js";

function makeClient(): TuiAppClient {
  return {
    health: async () => ({ ok: true, product: "dh" }),
    sessions: async () => ({ sessions: [{ id: "session-1", title: "Current work" }] }),
    run: async (input) => ({
      exitCode: 0,
      command: "run",
      sessionId: "session-1",
      model: "openai/gpt-5",
      agentId: "general",
      text: `answer: ${input.message}`,
      events: [],
      files: [],
      runtimeAuthority: "typescript_worker",
      finalStatus: "clean_success",
      degradedReason: null,
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
});
