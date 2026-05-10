import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { createSubagentTaskExecutor } from "../agent/subagent-runtime.js";
import { ToolRunner } from "./tool-runner.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-tool-runner-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function makeEnvelope(repo: string): ExecutionEnvelopeState {
  return {
    id: "env-1",
    sessionId: "session-1",
    lane: "quick",
    role: "quick",
    agentId: "quick-agent",
    stage: "quick_execute",
    resolvedModel: { providerId: "openai", modelId: "gpt-5", variantId: "default" },
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    semanticMode: "auto",
    evidencePolicy: "strict",
    createdAt: new Date().toISOString(),
  };
}

function nodeCommand(script: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("ToolRunner", () => {
  it("rejects invalid input before execution and records audit", async () => {
    const repo = makeRepo();
    const runner = new ToolRunner({ repoRoot: repo, envelope: makeEnvelope(repo), intent: "test" });

    const result = await runner.run("read", { path: "" });

    expect(result).toMatchObject({
      toolName: "read",
      status: "failed",
      error: expect.stringContaining("read input is invalid"),
    });
    expect(new ToolUsageAuditRepo(repo).listBySession("session-1").map((record) => record.status)).toEqual([
      "failed",
      "called",
    ]);
  });

  it("emits permission request instead of running write tools by default", async () => {
    const repo = makeRepo();
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const runner = new ToolRunner({
      repoRoot: repo,
      envelope: makeEnvelope(repo),
      intent: "test",
      onEvent: (type, payload) => events.push({ type, payload }),
    });

    const result = await runner.run("write", { path: "a.txt", content: "no" });

    expect(result.status).toBe("permission_required");
    expect(fs.existsSync(path.join(repo, "a.txt"))).toBe(false);
    expect(events).toEqual([
      {
        type: "permission.requested",
        payload: {
          toolName: "write",
          permissionLevel: "ask",
          reason: "Tool 'write' requires permission before execution.",
        },
      },
    ]);
  });

  it("runs read tools with started and finished events", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "hello");
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const runner = new ToolRunner({
      repoRoot: repo,
      envelope: makeEnvelope(repo),
      intent: "test",
      onEvent: (type, payload) => events.push({ type, payload }),
    });

    const result = await runner.run("read", { path: "README.md" });

    expect(result.status).toBe("succeeded");
    expect(events.map((event) => event.type)).toEqual(["tool.started", "tool.finished"]);
    expect(events[0]?.payload).toMatchObject({ toolName: "read" });
    expect(events[1]?.payload).toMatchObject({ toolName: "read", status: "succeeded" });
    expect(new ToolUsageAuditRepo(repo).listBySession("session-1")[0]?.status).toBe("succeeded");
  });

  it("runs shell tools with explicit allow and preserves delta events", async () => {
    const repo = makeRepo();
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const runner = new ToolRunner({
      repoRoot: repo,
      envelope: makeEnvelope(repo),
      intent: "test",
      permissionOverrides: { shell: "allow" },
      onEvent: (type, payload) => events.push({ type, payload }),
    });

    const result = await runner.run("shell", { command: nodeCommand("process.stdout.write('hi')") });

    expect(result).toMatchObject({ status: "succeeded", output: { stdout: "hi" } });
    expect(events.map((event) => event.type)).toEqual(["tool.started", "tool.delta", "tool.finished"]);
  });

  it("returns unsupported for task without an injected executor", async () => {
    const repo = makeRepo();
    const runner = new ToolRunner({
      repoRoot: repo,
      envelope: makeEnvelope(repo),
      intent: "test",
      permissionOverrides: { task: "allow" },
    });

    const result = await runner.run("task", { prompt: "inspect repo" });

    expect(result).toMatchObject({
      toolName: "task",
      status: "unsupported",
      error: "Task tool requires an injected task executor.",
    });
  });

  it("runs task through an injected bounded subagent executor", async () => {
    const repo = makeRepo();
    const runner = new ToolRunner({
      repoRoot: repo,
      envelope: makeEnvelope(repo),
      intent: "test",
      permissionOverrides: { task: "allow" },
      taskExecutor: createSubagentTaskExecutor({ agentId: "plan", maxResultBytes: 64 }),
    });

    const result = await runner.run("task", { prompt: "summarize repo" });

    expect(result).toMatchObject({
      toolName: "task",
      status: "succeeded",
      output: { result: expect.stringContaining("plan") },
    });
    expect(result.metadata.truncated).toBe(false);
  });
});
