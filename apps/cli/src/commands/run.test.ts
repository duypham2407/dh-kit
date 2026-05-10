import { afterEach, describe, expect, it, vi } from "vitest";
import { runRunCommand } from "./run.js";
import type { RuntimeClient } from "../runtime-client.js";
import type { RunDirectReport } from "../../../../packages/shared/src/types/run.js";
import type { FullWorkflowReport } from "../../../../packages/shared/src/types/full-workflow.js";

function makeReport(overrides: Partial<RunDirectReport> = {}): RunDirectReport {
  return {
    exitCode: 0,
    command: "run",
    sessionId: "session-run-1",
    model: "openai/gpt-5",
    agentId: "quick-agent",
    text: "ok",
    events: [
      {
        type: "text.delta",
        sessionId: "session-run-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: { text: "ok" },
      },
    ],
    files: [],
    runtimeAuthority: "rust",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

function runtime(calls: unknown[]): RuntimeClient {
  return {
    runDirect: async (input) => {
      calls.push(input);
      return makeReport();
    },
    runFullWorkflow: async (input) => {
      calls.push(input);
      return makeFullWorkflowReport();
    },
  } as RuntimeClient;
}

function makeFullWorkflowReport(): FullWorkflowReport {
  return {
    parentSessionId: "session-full-1",
    state: {
      parentSessionId: "session-full-1",
      objective: "ship auth refactor",
      currentStage: "full_product",
      currentOwner: "product_lead",
      status: "running",
      childSessions: [],
      approvals: [],
      artifacts: [],
      rerouteIssues: [],
      evidenceLedgerRefs: [],
      audit: [],
      concurrency: { maxReadOnlyWorkers: 3, singleWriteOwner: "fullstack_agent" },
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe("runRunCommand", () => {
  it("parses run flags and writes plain text output", async () => {
    const calls: unknown[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runRunCommand(
      ["--model", "openai/gpt-5", "--file", "README.md", "summarize", "repo"],
      "/repo",
      runtime(calls),
    );

    expect(exitCode).toBe(0);
    expect(calls[0]).toMatchObject({
      message: "summarize repo",
      model: "openai/gpt-5",
      files: ["README.md"],
    });
    expect(String(stdout.mock.calls[0]?.[0])).toContain("session: session-run-1");
  });

  it("writes NDJSON for --json", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runRunCommand(["--json", "hello"], "/repo", runtime([]));
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]).trim()).type).toBe("text.delta");
  });

  it("starts bounded full workflow for --multi", async () => {
    const calls: unknown[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runRunCommand(["--multi", "--json", "ship", "auth", "refactor"], "/repo", runtime(calls));

    expect(exitCode).toBe(0);
    expect(calls[0]).toMatchObject({ repoRoot: "/repo", objective: "ship auth refactor" });
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    expect(payload.parentSessionId).toBe("session-full-1");
    expect(payload.state.currentStage).toBe("full_product");
    expect(payload.state.currentOwner).toBe("product_lead");
  });

  it("rejects invalid flag combinations", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitCode = await runRunCommand(["--continue", "--session", "session-1", "hello"], "/repo", runtime([]));
    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("--continue cannot be combined with --session");
  });
});
