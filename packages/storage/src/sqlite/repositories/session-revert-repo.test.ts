import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { SessionRevertRepo } from "./session-revert-repo.js";
import { SessionsRepo } from "./sessions-repo.js";
import type { SessionState } from "../../../../shared/src/types/session.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-revert-repo-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
  }
  repos = [];
});

describe("SessionRevertRepo", () => {
  it("saves and returns latest revert record", () => {
    const repo = makeRepo();
    const sessionsRepo = new SessionsRepo(repo);
    const session: SessionState = {
      sessionId: "sess-1",
      repoRoot: repo,
      lane: "quick",
      laneLocked: true,
      currentStage: "quick_plan",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessionsRepo.save(session);
    const reverts = new SessionRevertRepo(repo);

    reverts.save({ sessionId: "sess-1", checkpointId: "cp-1", reason: "manual" });
    const latest = reverts.save({ sessionId: "sess-1", checkpointId: "cp-2", reason: "manual-2" });

    const found = reverts.findLatestBySession("sess-1");
    expect(found?.id).toBe(latest.id);
    expect(found?.checkpointId).toBe("cp-2");
  });

  it("lists, upserts, and deletes reverts by session", () => {
    const repo = makeRepo();
    const sessionsRepo = new SessionsRepo(repo);
    const session: SessionState = {
      sessionId: "session-revert",
      repoRoot: repo,
      lane: "quick",
      laneLocked: true,
      currentStage: "quick_plan",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessionsRepo.save(session);
    const reverts = new SessionRevertRepo(repo);

    reverts.saveRecord({
      id: "revert-imported",
      sessionId: "session-revert",
      checkpointId: "checkpoint-imported",
      reason: "imported",
      createdAt: "2026-05-10T02:00:00.000Z",
    });

    expect(reverts.listBySession("session-revert").map((revert) => revert.id)).toEqual(["revert-imported"]);
    expect(reverts.deleteBySession("session-revert")).toBe(1);
    expect(reverts.listBySession("session-revert")).toHaveLength(0);
  });
});
