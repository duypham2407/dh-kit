import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { nowIso } from "../../../shared/src/utils/time.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { RuntimeEnforcer } from "./runtime-enforcer.js";

let tmpDirs: string[] = [];

function makeRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-runtime-enforcer-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) closeDhDatabase(dir);
  tmpDirs = [];
});

describe("RuntimeEnforcer", () => {
  it("blocks bash grep in strict mode and writes decisions", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    sessions.save({
      sessionId: "s1",
      repoRoot: repo,
      lane: "quick",
      laneLocked: true,
      currentStage: "quick_plan",
      status: "in_progress",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    });

    const enforcer = new RuntimeEnforcer(repo);
    const result = enforcer.preToolExec({
      sessionId: "s1",
      envelopeId: "e1",
      role: "quick",
      intent: "trace_flow",
      toolName: "bash",
      toolArgs: { command: "grep -r auth src" },
    });

    expect(result.allow).toBe(false);
    expect(result.reason).toContain("Blocked by bash guard");
  });

  it("gates structural answer without graph evidence", () => {
    const repo = makeRepo();
    const enforcer = new RuntimeEnforcer(repo);
    const result = enforcer.preAnswer({
      sessionId: "s1",
      envelopeId: "e1",
      intentText: "Who calls function alpha?",
      toolsUsed: ["grep"],
      evidenceScore: 0.9,
    });
    expect(result.allow).toBe(false);
    expect(result.action).toBe("retry_with_more_evidence");
  });
});
