import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runLaneWorkflow } from "./run-lane-command.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { createChatProviderError, type ChatProvider } from "../../../providers/src/chat/types.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-lane-run-test-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runLaneWorkflow", () => {
  it("fails with exit code 1 when objective is missing", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "quick",
      objective: "",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(1);
    expect(report.workflowSummary[0]).toContain("Missing objective");
  });

  it("runs delivery lane and returns structured summary output", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "delivery",
      objective: "deliver browser feature",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.lane).toBe("delivery");
    expect(report.objective).toContain("deliver browser feature");
    expect(report.workflowSummary.some((line) => line.includes("Executed work items:"))).toBe(true);
  });

  it("runs migration lane and enforces migration summary semantics", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "migration",
      objective: "migrate frontend build",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.lane).toBe("migration");
    expect(report.workflowSummary[0]).toContain("Migration mode preserves behavior by default.");
  });

  it("retries transient provider errors through shared retry wrapper", async () => {
    const repo = makeTmpRepo();
    let calls = 0;
    const flakyProvider: ChatProvider = {
      providerId: "flaky",
      async chat() {
        calls += 1;
        if (calls === 1) {
          throw createChatProviderError({
            message: "rate limited",
            providerId: "flaky",
            kind: "rate_limit",
            statusCode: 429,
            retryAfterMs: 1,
          });
        }
        return {
          content: JSON.stringify({ summary: "ok" }),
          model: "mock",
          finishReason: "stop",
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
          },
        };
      },
    };

    const report = await runLaneWorkflow({
      lane: "quick",
      objective: "retry through provider wrapper",
      repoRoot: repo,
      provider: flakyProvider,
    });

    expect(report.exitCode).toBe(0);
    expect(calls).toBeGreaterThan(1);
    const events = new SessionRuntimeEventsRepo(repo).listBySession(report.sessionId);
    expect(events.some((event) => event.eventType === "retry" && event.eventJson.providerId === "flaky")).toBe(true);
  });

  it("uses injected provider as the base provider for quick workflow execution", async () => {
    const repo = makeTmpRepo();
    let calls = 0;
    const provider: ChatProvider = {
      providerId: "injected-base",
      async chat() {
        calls += 1;
        return {
          content: JSON.stringify({
            lane: "quick",
            stage: "quick_plan",
            nextRole: "complete",
            summary: "Injected provider handled quick workflow.",
            handoffNotes: [],
            blockers: [],
          }),
          model: "mock",
          finishReason: "stop",
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
          },
        };
      },
    };

    const report = await runLaneWorkflow({
      lane: "quick",
      objective: "use injected provider",
      repoRoot: repo,
      provider,
    });

    expect(report.exitCode).toBe(0);
    expect(calls).toBe(1);
    expect(report.workflowSummary[0]).toContain("Injected provider handled quick workflow.");
  });

  it("resumes existing session instead of creating a new one", async () => {
    const repo = makeTmpRepo();

    const first = await runLaneWorkflow({
      lane: "quick",
      objective: "initial run",
      repoRoot: repo,
    });

    const resumed = await runLaneWorkflow({
      lane: "quick",
      objective: "resume run",
      repoRoot: repo,
      resumeSessionId: first.sessionId,
    });

    expect(first.exitCode).toBe(0);
    expect(resumed.exitCode).toBe(0);
    expect(resumed.sessionId).toBe(first.sessionId);
    expect(resumed.model).toBe(first.model);
  });
});
