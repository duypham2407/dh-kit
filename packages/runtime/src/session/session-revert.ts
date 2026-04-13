import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { WorkflowStateRepo } from "../../../storage/src/sqlite/repositories/workflow-state-repo.js";
import { assertNotBusy } from "./session-run-state.js";

export class SessionRevertService {
  private readonly checkpointsRepo: SessionCheckpointsRepo;
  private readonly revertRepo: SessionRevertRepo;
  private readonly summaryRepo: SessionSummaryRepo;
  private readonly sessionsRepo: SessionsRepo;
  private readonly workflowStateRepo: WorkflowStateRepo;
  private readonly runtimeEventsRepo: SessionRuntimeEventsRepo;

  constructor(private readonly repoRoot: string) {
    this.checkpointsRepo = new SessionCheckpointsRepo(repoRoot);
    this.revertRepo = new SessionRevertRepo(repoRoot);
    this.summaryRepo = new SessionSummaryRepo(repoRoot);
    this.sessionsRepo = new SessionsRepo(repoRoot);
    this.workflowStateRepo = new WorkflowStateRepo(repoRoot);
    this.runtimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  }

  revertTo(sessionId: string, checkpointId: string, reason = "manual-revert"): { revertId: string; checkpointId: string } {
    const latestBefore = this.revertRepo.findLatestBySession(sessionId);
    assertNotBusy(sessionId);

    const checkpoint = this.checkpointsRepo.findById(checkpointId);
    if (!checkpoint || checkpoint.sessionId !== sessionId) {
      throw new Error(`Checkpoint '${checkpointId}' does not exist for session '${sessionId}'.`);
    }

    const session = this.sessionsRepo.findById(sessionId);
    if (!session) {
      throw new Error(`Session '${sessionId}' was not found.`);
    }

    this.workflowStateRepo.save(sessionId, checkpoint.workflowSnapshotJson as never);

    const summarySnapshot = checkpoint.summarySnapshotJson as {
      filesChanged?: number;
      additions?: number;
      deletions?: number;
      lastDiffAt?: string;
      latestStage?: string;
      latestCheckpointId?: string;
      continuationSummary?: string;
      continuationCreatedAt?: string;
    };

    const summary = this.summaryRepo.save({
      sessionId,
      filesChanged: summarySnapshot.filesChanged ?? 0,
      additions: summarySnapshot.additions ?? 0,
      deletions: summarySnapshot.deletions ?? 0,
      lastDiffAt: summarySnapshot.lastDiffAt,
      latestStage: summarySnapshot.latestStage,
      latestCheckpointId: summarySnapshot.latestCheckpointId ?? checkpoint.id,
      continuationSummary: summarySnapshot.continuationSummary,
      continuationCreatedAt: summarySnapshot.continuationCreatedAt,
    });

    const previous = this.revertRepo.findLatestBySession(sessionId);
    const revert = this.revertRepo.save({
      sessionId,
      checkpointId,
      previousCheckpointId: previous?.checkpointId,
      reason,
    });

    if (latestBefore && previous?.id && latestBefore.id !== previous.id) {
      throw new Error(`Revert history changed during revert for session '${sessionId}'.`);
    }

    this.sessionsRepo.save({
      ...session,
      currentStage: checkpoint.stage,
      latestCheckpointId: checkpoint.id,
      latestSummaryId: summary.id,
      latestRevertId: revert.id,
      updatedAt: new Date().toISOString(),
    });

    this.runtimeEventsRepo.save({
      sessionId,
      eventType: "revert",
      eventJson: {
        checkpointId,
        revertId: revert.id,
        reason,
      },
    });

    return {
      revertId: revert.id,
      checkpointId,
    };
  }

  undoRevert(sessionId: string): { revertId: string; checkpointId: string } {
    const latest = this.revertRepo.findLatestBySession(sessionId);
    if (!latest?.previousCheckpointId) {
      throw new Error(`No previous checkpoint available for undoRevert on session '${sessionId}'.`);
    }

    const previousCheckpoint = this.checkpointsRepo.findById(latest.previousCheckpointId);
    if (!previousCheckpoint || previousCheckpoint.sessionId !== sessionId) {
      throw new Error(`Cannot undo revert for session '${sessionId}' because previous checkpoint '${latest.previousCheckpointId}' is unavailable.`);
    }

    if (latest.checkpointId === latest.previousCheckpointId) {
      throw new Error(`Cannot undo revert for session '${sessionId}' because revert history is self-referential.`);
    }

    return this.revertTo(sessionId, latest.previousCheckpointId, "undo-revert");
  }
}
