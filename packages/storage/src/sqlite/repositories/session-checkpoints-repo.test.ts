import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { SessionCheckpointsRepo } from "./session-checkpoints-repo.js";
import { SessionsRepo } from "./sessions-repo.js";
import type { SessionState } from "../../../../shared/src/types/session.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-checkpoints-repo-"));
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

describe("SessionCheckpointsRepo", () => {
  it("saves and lists checkpoints by session", () => {
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
    const checkpoints = new SessionCheckpointsRepo(repo);

    const first = checkpoints.save({
      sessionId: "sess-1",
      checkpointType: "session_bootstrap",
      lane: "quick",
      stage: "quick_plan",
    });
    checkpoints.save({
      sessionId: "sess-1",
      checkpointType: "post_workflow",
      lane: "quick",
      stage: "quick_execute",
    });

    const listed = checkpoints.listBySession("sess-1");
    expect(listed).toHaveLength(2);
    expect(checkpoints.findById(first.id)?.id).toBe(first.id);
  });

  it("upserts imported checkpoints and deletes checkpoints by session", () => {
    const repo = makeRepo();
    const sessionsRepo = new SessionsRepo(repo);
    const session: SessionState = {
      sessionId: "session-checkpoint",
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
    const checkpoints = new SessionCheckpointsRepo(repo);

    checkpoints.saveRecord({
      id: "checkpoint-imported",
      sessionId: "session-checkpoint",
      checkpointType: "post_workflow",
      lane: "quick",
      stage: "quick_plan",
      summarySnapshotJson: { filesChanged: 1 },
      workflowSnapshotJson: {},
      continuationJson: {},
      metadataJson: {},
      createdAt: "2026-05-10T02:00:00.000Z",
    });

    expect(checkpoints.listBySession("session-checkpoint")).toHaveLength(1);
    expect(checkpoints.deleteBySession("session-checkpoint")).toBe(1);
    expect(checkpoints.listBySession("session-checkpoint")).toHaveLength(0);
  });
});
