import { STAGES_BY_LANE } from "../../../shared/src/constants/stages.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { WorkflowState, WorkflowStage } from "../../../shared/src/types/stage.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { WorkflowStateRepo } from "../../../storage/src/sqlite/repositories/workflow-state-repo.js";
import { SessionStore } from "../../../storage/src/fs/session-store.js";
import { writeWorkflowCompatibilityMirror } from "./workflow-state-mirror.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";

export type StageTransitionResult = {
  session: SessionState;
  workflow: WorkflowState;
};

export class StageRunner {
  private readonly sessionsRepo: SessionsRepo;
  private readonly workflowStateRepo: WorkflowStateRepo;
  private readonly sessionStore: SessionStore;

  constructor(private readonly repoRoot: string) {
    this.sessionsRepo = new SessionsRepo(repoRoot);
    this.workflowStateRepo = new WorkflowStateRepo(repoRoot);
    this.sessionStore = new SessionStore(repoRoot);
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
