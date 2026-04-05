import { describe, it, expect, afterEach } from "vitest";
import { HookEnforcer } from "./hook-enforcer.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-enforcer-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

function makeEnvelope(overrides?: Partial<ExecutionEnvelopeState>): ExecutionEnvelopeState {
  return {
    id: "env-1",
    sessionId: "sess-1",
    lane: "quick",
    role: "quick",
    agentId: "agent-1",
    stage: "quick_execute",
    resolvedModel: { providerId: "openai", modelId: "gpt-4o", variantId: "default" },
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    semanticMode: "auto",
    evidencePolicy: "strict",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("HookEnforcer.preToolExec", () => {
  it("allows a non-blocked tool and writes an allow decision to DB", () => {
    const repoRoot = makeTmpRepo();
    const enforcer = new HookEnforcer(repoRoot);
    const envelope = makeEnvelope();

    const result = enforcer.preToolExec(envelope, "semantic-search", {});

    expect(result.allow).toBe(true);
    expect(result.decision).toBe("allow");
    expect(result.logId).toMatch(/^hook-/);

    // Verify written to DB
    const logs = new HookInvocationLogsRepo(repoRoot);
    const latest = logs.findLatestDecision("sess-1", "env-1", "pre_tool_exec");
    expect(latest).toBeDefined();
    expect(latest!.decision).toBe("allow");
  });

  it("blocks a hard-blocked OS tool and writes a block decision", () => {
    const repoRoot = makeTmpRepo();
    const enforcer = new HookEnforcer(repoRoot);
    const envelope = makeEnvelope();

    const result = enforcer.preToolExec(envelope, "grep", { args: ["pattern"] });

    expect(result.allow).toBe(false);
    expect(result.decision).toBe("block");
    expect(result.reason).toContain("blocked");

    const logs = new HookInvocationLogsRepo(repoRoot);
    const latest = logs.findLatestDecision("sess-1", "env-1", "pre_tool_exec");
    expect(latest!.decision).toBe("block");
  });
});

describe("HookEnforcer.preAnswer", () => {
  it("allows an answer with sufficient evidence and all required tools used", () => {
    const repoRoot = makeTmpRepo();
    const enforcer = new HookEnforcer(repoRoot);
    // Set explicit required tools so we control the gate criteria
    const envelope = makeEnvelope({ requiredTools: ["keyword_search", "semantic_search"] });

    const result = enforcer.preAnswer(envelope, ["keyword_search", "semantic_search"], 0.8);

    expect(result.allow).toBe(true);
    expect(result.decision).toBe("allow");

    const logs = new HookInvocationLogsRepo(repoRoot);
    const latest = logs.findLatestDecision("sess-1", "env-1", "pre_answer");
    expect(latest!.decision).toBe("allow");
  });

  it("blocks an answer with low evidence score", () => {
    const repoRoot = makeTmpRepo();
    const enforcer = new HookEnforcer(repoRoot);
    const envelope = makeEnvelope();

    const result = enforcer.preAnswer(envelope, ["Read"], 0.1);

    expect(result.allow).toBe(false);
    expect(result.decision).toBe("block");

    const logs = new HookInvocationLogsRepo(repoRoot);
    const latest = logs.findLatestDecision("sess-1", "env-1", "pre_answer");
    expect(latest!.decision).toBe("block");
  });

  it("blocks when required tools were not used", () => {
    const repoRoot = makeTmpRepo();
    const enforcer = new HookEnforcer(repoRoot);
    const envelope = makeEnvelope({ requiredTools: ["semantic-search"] });

    const result = enforcer.preAnswer(envelope, [], 0.9);

    expect(result.allow).toBe(false);
    expect(result.reason).toContain("Missing required tools");
  });

  it("persists multiple decisions and findLatestDecision returns the most recent", () => {
    const repoRoot = makeTmpRepo();
    const enforcer = new HookEnforcer(repoRoot);
    const envelope = makeEnvelope({ requiredTools: ["keyword_search"] });

    // First attempt: low evidence → block
    enforcer.preAnswer(envelope, ["keyword_search"], 0.1);
    // Second attempt: good evidence → allow
    enforcer.preAnswer(envelope, ["keyword_search"], 0.9);

    const logs = new HookInvocationLogsRepo(repoRoot);
    const latest = logs.findLatestDecision("sess-1", "env-1", "pre_answer");
    expect(latest!.decision).toBe("allow");
  });
});
