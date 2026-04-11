import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionRevertService } from "./session-revert.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { WorkflowStateRepo } from "../../../storage/src/sqlite/repositories/workflow-state-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { markBusy, markIdle } from "./session-run-state.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { WorkflowState } from "../../../shared/src/types/stage.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-revert-"));
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

describe("session-revert", () => {
  it("blocks revert while session is busy", () => {
    const repo = makeRepo();
    const service = new SessionRevertService(repo);
    const sessionId = "sess-busy";
    markBusy(sessionId);
    expect(() => service.revertTo(sessionId, "cp-1")).toThrow("busy");
    markIdle(sessionId);
  });

  it("restores checkpoint-level state and updates session pointers", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    const workflowRepo = new WorkflowStateRepo(repo);
    const checkpoints = new SessionCheckpointsRepo(repo);
    const summaries = new SessionSummaryRepo(repo);
    const service = new SessionRevertService(repo);

    const session: SessionState = {
      sessionId: "sess-1",
      repoRoot: repo,
      lane: "delivery",
      laneLocked: true,
      currentStage: "delivery_execute",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessions.save(session);

    const workflow: WorkflowState = {
      lane: "delivery",
      stage: "delivery_review",
      stageStatus: "in_progress",
      previousStage: "delivery_execute",
      nextStage: "delivery_verify",
      gateStatus: "pending",
      blockers: [],
    };
    workflowRepo.save(session.sessionId, workflow);

    const checkpoint = checkpoints.save({
      sessionId: session.sessionId,
      checkpointType: "post_workflow",
      lane: "delivery",
      stage: "delivery_review",
      summarySnapshotJson: {
        filesChanged: 2,
        additions: 5,
        deletions: 1,
        latestStage: "delivery_review",
      },
      workflowSnapshotJson: workflow as Record<string, unknown>,
      continuationJson: {},
      metadataJson: {},
    });
    summaries.save({ sessionId: session.sessionId, filesChanged: 1, additions: 1, deletions: 0 });

    const reverted = service.revertTo(session.sessionId, checkpoint.id);
    expect(reverted.checkpointId).toBe(checkpoint.id);

    const restored = sessions.findById(session.sessionId);
    expect(restored?.currentStage).toBe("delivery_review");
    expect(restored?.latestCheckpointId).toBe(checkpoint.id);
    expect(restored?.latestSummaryId).toBeDefined();
    expect(restored?.latestRevertId).toBeDefined();
  });

  it("undoRevert performs a single-step rollback using previous checkpoint chain", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    const workflowRepo = new WorkflowStateRepo(repo);
    const checkpoints = new SessionCheckpointsRepo(repo);
    const reverts = new SessionRevertRepo(repo);
    const service = new SessionRevertService(repo);

    const session: SessionState = {
      sessionId: "sess-undo",
      repoRoot: repo,
      lane: "delivery",
      laneLocked: true,
      currentStage: "delivery_execute",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessions.save(session);

    const cp1Workflow: WorkflowState = {
      lane: "delivery",
      stage: "delivery_execute",
      stageStatus: "in_progress",
      gateStatus: "pending",
      blockers: [],
    };
    const cp2Workflow: WorkflowState = {
      lane: "delivery",
      stage: "delivery_review",
      stageStatus: "in_progress",
      gateStatus: "pending",
      blockers: [],
      previousStage: "delivery_execute",
      nextStage: "delivery_verify",
    };
    workflowRepo.save(session.sessionId, cp2Workflow);

    const cp1 = checkpoints.save({
      sessionId: session.sessionId,
      checkpointType: "post_workflow",
      lane: "delivery",
      stage: "delivery_execute",
      summarySnapshotJson: {},
      workflowSnapshotJson: cp1Workflow as Record<string, unknown>,
      continuationJson: {},
      metadataJson: {},
    });
    const cp2 = checkpoints.save({
      sessionId: session.sessionId,
      checkpointType: "post_workflow",
      lane: "delivery",
      stage: "delivery_review",
      summarySnapshotJson: {},
      workflowSnapshotJson: cp2Workflow as Record<string, unknown>,
      continuationJson: {},
      metadataJson: {},
    });

    reverts.save({
      sessionId: session.sessionId,
      checkpointId: cp2.id,
      previousCheckpointId: cp1.id,
      reason: "manual-revert",
    });

    const undo = service.undoRevert(session.sessionId);
    expect(undo.checkpointId).toBe(cp1.id);
    const restored = sessions.findById(session.sessionId);
    expect(restored?.currentStage).toBe("delivery_execute");
  });

  it("undoRevert fails safely when previous checkpoint is missing", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    const reverts = new SessionRevertRepo(repo);
    const service = new SessionRevertService(repo);

    const session: SessionState = {
      sessionId: "sess-missing-prev",
      repoRoot: repo,
      lane: "delivery",
      laneLocked: true,
      currentStage: "delivery_execute",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessions.save(session);
    reverts.save({
      sessionId: session.sessionId,
      checkpointId: "cp-now",
      previousCheckpointId: "cp-missing",
      reason: "manual-revert",
    });

    expect(() => service.undoRevert(session.sessionId)).toThrow("previous checkpoint");
  });

  it("undoRevert fails safely on self-referential checkpoint chain", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    const checkpoints = new SessionCheckpointsRepo(repo);
    const reverts = new SessionRevertRepo(repo);
    const service = new SessionRevertService(repo);

    const session: SessionState = {
      sessionId: "sess-self-ref",
      repoRoot: repo,
      lane: "delivery",
      laneLocked: true,
      currentStage: "delivery_execute",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessions.save(session);

    const cp = checkpoints.save({
      sessionId: session.sessionId,
      checkpointType: "post_workflow",
      lane: "delivery",
      stage: "delivery_execute",
      summarySnapshotJson: {},
      workflowSnapshotJson: {
        lane: "delivery",
        stage: "delivery_execute",
        stageStatus: "in_progress",
        gateStatus: "pending",
        blockers: [],
      },
      continuationJson: {},
      metadataJson: {},
    });

    reverts.save({
      sessionId: session.sessionId,
      checkpointId: cp.id,
      previousCheckpointId: cp.id,
      reason: "manual-revert",
    });

    expect(() => service.undoRevert(session.sessionId)).toThrow("self-referential");
  });
});
