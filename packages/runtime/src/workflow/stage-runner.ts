import { STAGES_BY_LANE } from "../../../shared/src/constants/stages.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { WorkflowState, WorkflowStage } from "../../../shared/src/types/stage.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { WorkflowStateRepo } from "../../../storage/src/sqlite/repositories/workflow-state-repo.js";
import { SessionStore } from "../../../storage/src/fs/session-store.js";
import { writeWorkflowCompatibilityMirror } from "./workflow-state-mirror.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";

export type StageTransitionResult = {
  session: SessionState;
  workflow: WorkflowState;
};

export class StageRunner {
  private readonly sessionsRepo: SessionsRepo;
  private readonly workflowStateRepo: WorkflowStateRepo;
  private readonly sessionStore: SessionStore;
  private readonly sessionCheckpointsRepo: SessionCheckpointsRepo;
  private readonly sessionRuntimeEventsRepo: SessionRuntimeEventsRepo;
  private readonly sessionSummaryRepo: SessionSummaryRepo;

  constructor(private readonly repoRoot: string) {
    this.sessionsRepo = new SessionsRepo(repoRoot);
    this.workflowStateRepo = new WorkflowStateRepo(repoRoot);
    this.sessionStore = new SessionStore(repoRoot);
    this.sessionCheckpointsRepo = new SessionCheckpointsRepo(repoRoot);
    this.sessionRuntimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
    this.sessionSummaryRepo = new SessionSummaryRepo(repoRoot);
  }

  async advance(input: {
    session: SessionState;
    workflow: WorkflowState;
    latestEnvelope: ExecutionEnvelopeState;
  }): Promise<StageTransitionResult> {
    const stages = STAGES_BY_LANE[input.session.lane];
    const currentIndex = stages.indexOf(input.workflow.stage);
    if (currentIndex === -1) {
      throw new Error(`Stage '${input.workflow.stage}' is not valid for lane '${input.session.lane}'.`);
    }

    const nextStage = stages[currentIndex + 1];
    if (!nextStage) {
      return { session: input.session, workflow: input.workflow };
    }

    const updatedSession: SessionState = {
      ...input.session,
      currentStage: nextStage,
      updatedAt: nowIso(),
    };

    const updatedWorkflow: WorkflowState = {
      ...input.workflow,
      previousStage: input.workflow.stage,
      stage: nextStage,
      stageStatus: nextStage.endsWith("complete") ? "passed" : "in_progress",
      nextStage: getNextStage(stages, nextStage),
      gateStatus: "pending",
    };

    const latestSummary = this.sessionSummaryRepo.findLatestBySession(input.session.sessionId);
    const checkpoint = this.sessionCheckpointsRepo.save({
      sessionId: input.session.sessionId,
      checkpointType: "post_stage_advance",
      lane: updatedSession.lane,
      stage: updatedSession.currentStage,
      summarySnapshotJson: latestSummary ? {
        filesChanged: latestSummary.filesChanged,
        additions: latestSummary.additions,
        deletions: latestSummary.deletions,
        lastDiffAt: latestSummary.lastDiffAt,
        latestStage: latestSummary.latestStage,
        latestCheckpointId: latestSummary.latestCheckpointId,
        continuationSummary: latestSummary.continuationSummary,
        continuationCreatedAt: latestSummary.continuationCreatedAt,
      } : {},
      workflowSnapshotJson: updatedWorkflow as Record<string, unknown>,
      continuationJson: {
        continuationSummary: latestSummary?.continuationSummary,
      },
      metadataJson: {
        source: "stage-runner.advance",
      },
    });

    updatedSession.latestCheckpointId = checkpoint.id;

    this.sessionsRepo.save(updatedSession);
    this.workflowStateRepo.save(updatedSession.sessionId, updatedWorkflow);
    await this.sessionStore.write({
      session: updatedSession,
      workflow: updatedWorkflow,
      envelopes: [input.latestEnvelope],
    });
    await writeWorkflowCompatibilityMirror({
      repoRoot: this.repoRoot,
      session: updatedSession,
      workflow: updatedWorkflow,
      latestEnvelope: input.latestEnvelope,
    });
    this.sessionRuntimeEventsRepo.save({
      sessionId: updatedSession.sessionId,
      eventType: "checkpoint_created",
      eventJson: {
        checkpointId: checkpoint.id,
        checkpointType: checkpoint.checkpointType,
      },
    });

    return {
      session: updatedSession,
      workflow: updatedWorkflow,
    };
  }
}

function getNextStage(stages: WorkflowStage[], currentStage: WorkflowStage): WorkflowStage | undefined {
  const index = stages.indexOf(currentStage);
  return index === -1 ? undefined : stages[index + 1];
}
