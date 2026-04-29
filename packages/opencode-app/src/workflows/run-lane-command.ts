import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import { SessionManager } from "../../../runtime/src/session/session-manager.js";
import { withSessionRunGuard } from "../../../runtime/src/session/session-run-state.js";
import { summarizeWorkflowArtifacts } from "../../../runtime/src/session/session-summary.js";
import { compactSessionContext } from "../../../runtime/src/session/session-compaction.js";
import { resumeSession } from "../../../runtime/src/session/session-resume.js";
import { createRetryingChatProvider } from "../../../runtime/src/reliability/retrying-chat-provider.js";
import { createWorkflowState } from "../../../runtime/src/workflow/workflow-state-manager.js";
import { StageRunner } from "../../../runtime/src/workflow/stage-runner.js";
import { WorkflowAuditService } from "../../../runtime/src/workflow/workflow-audit-service.js";
import { createChatProvider } from "../../../providers/src/chat/create-chat-provider.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { resolveLane } from "../lane/resolve-lane.js";
import { runDeliveryWorkflow } from "./delivery.js";
import { runMigrationWorkflow } from "./migration.js";
import { runQuickWorkflow } from "./quick.js";

export type LaneWorkflowReport = {
  exitCode: number;
  lane: WorkflowLane;
  sessionId: string;
  stage: string;
  agent: string;
  model: string;
  objective: string;
  workflowSummary: string[];
};

export async function runLaneWorkflow(input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
  provider?: ChatProvider;
}): Promise<LaneWorkflowReport> {
  if (!input.objective) {
    return {
      exitCode: 1,
      lane: input.lane,
      sessionId: "",
      stage: "",
      agent: "",
      model: "",
      objective: input.objective,
      workflowSummary: [`Missing objective for ${input.lane} command.`],
    };
  }

  const lane = resolveLane(input.lane);
  const sessionManager = new SessionManager(input.repoRoot);

  if (input.resumeSessionId) {
    const resumed = await resumeSession(input.repoRoot, input.resumeSessionId, lane);
    if (!resumed.ok) {
      return {
        exitCode: 1,
        lane,
        sessionId: input.resumeSessionId,
        stage: "",
        agent: "",
        model: "",
        objective: input.objective,
        workflowSummary: [resumed.reason],
      };
    }
  }

  const agent = DEFAULT_AGENT_REGISTRY.find((entry) => entry.lanes.includes(lane));
  if (!agent) {
    throw new Error(`No agent registered for lane '${lane}'.`);
  }

  const isResumed = Boolean(input.resumeSessionId);
  const initial = isResumed
    ? await sessionManager.readSession(input.resumeSessionId!)
    : undefined;

  if (isResumed && !initial) {
    return {
      exitCode: 1,
      lane,
      sessionId: input.resumeSessionId!,
      stage: "",
      agent: "",
      model: "",
      objective: input.objective,
      workflowSummary: [`Session '${input.resumeSessionId}' could not be resumed from session store.`],
    };
  }

  const created = !isResumed ? await sessionManager.createSession(lane, agent) : undefined;

  const envelope = isResumed
    ? initial!.envelopes[initial!.envelopes.length - 1]
    : created!.envelope;

  if (!envelope) {
    return {
      exitCode: 1,
      lane,
      sessionId: isResumed ? input.resumeSessionId! : "",
      stage: "",
      agent: agent.displayName,
      model: "",
      objective: input.objective,
      workflowSummary: [
        `Session '${input.resumeSessionId}' has no execution envelope to resume.`,
      ],
    };
  }

  let session = isResumed ? initial!.session : created!.session;
  const workflow = isResumed ? initial!.workflow : createWorkflowState(session);
  const stageRunner = new StageRunner(input.repoRoot);
  const audit = new WorkflowAuditService(input.repoRoot);
  const configRepo = new ConfigRepo(input.repoRoot);
  const runtimeEventsRepo = new SessionRuntimeEventsRepo(input.repoRoot);
  const summaryRepo = new SessionSummaryRepo(input.repoRoot);
  const checkpointsRepo = new SessionCheckpointsRepo(input.repoRoot);
  const sessionsRepo = new SessionsRepo(input.repoRoot);

  const baseProvider = input.provider ?? await tryCreateChatProvider(input.repoRoot, envelope.resolvedModel);

  const provider = createRetryingChatProvider(baseProvider, {
    audit: {
      onRetryAttempt: async (attempt) => {
        audit.recordRuntimeEvent({
          sessionId: session.sessionId,
          eventType: "retry",
          eventJson: attempt,
        });
      },
      onRetryGiveUp: async (failed) => {
        audit.recordRuntimeEvent({
          sessionId: session.sessionId,
          eventType: "retry_give_up",
          eventJson: failed,
        });
      },
    },
  });

  if (!isResumed) {
    const bootstrapCheckpoint = checkpointsRepo.save({
      sessionId: session.sessionId,
      checkpointType: "session_bootstrap",
      lane: session.lane,
      stage: workflow.stage,
      summarySnapshotJson: {},
      workflowSnapshotJson: workflow as Record<string, unknown>,
      continuationJson: {},
      metadataJson: { source: "run-lane-command" },
    });
    session = {
      ...session,
      latestCheckpointId: bootstrapCheckpoint.id,
      updatedAt: nowIso(),
    };
    sessionsRepo.save(session);
    audit.recordRuntimeEvent({
      sessionId: session.sessionId,
      eventType: "checkpoint_created",
      eventJson: {
        checkpointId: bootstrapCheckpoint.id,
        checkpointType: bootstrapCheckpoint.checkpointType,
      },
    });
  }

  let workflowSummary: string[] = [];
  const transition = await withSessionRunGuard(
    session.sessionId,
    async () => {
      if (lane === "quick") {
        const quick = await runQuickWorkflow({
          objective: input.objective,
          stage: session.currentStage,
          repoRoot: input.repoRoot,
          envelope,
          provider,
        });
        workflowSummary = [quick.summary, `next: ${quick.nextStep}`];
      } else if (lane === "delivery") {
        const delivery = await runDeliveryWorkflow({
          sessionId: session.sessionId,
          objective: input.objective,
          stage: session.currentStage,
          repoRoot: input.repoRoot,
          envelope,
          provider,
        });
        workflowSummary = delivery.summary;
      } else {
        const migration = await runMigrationWorkflow({
          sessionId: session.sessionId,
          objective: input.objective,
          stage: session.currentStage,
          repoRoot: input.repoRoot,
          envelope,
          provider,
        });
        workflowSummary = migration.summary;
      }

      const previousSummary = summaryRepo.findLatestBySession(session.sessionId);
      const autoCompaction = configRepo.read<boolean>("session.auto_compaction") ?? false;
      const compactionResult = compactSessionContext({
        sessionId: session.sessionId,
        workflowSummary,
        runtimeEvents: runtimeEventsRepo.listBySession(session.sessionId),
        summary: previousSummary,
      });
      if (compactionResult.overflow) {
        audit.recordRuntimeEvent({
          sessionId: session.sessionId,
          eventType: "compaction",
          eventJson: {
            enabled: autoCompaction,
            continuationSummaryCreated: Boolean(autoCompaction && compactionResult.continuationSummary),
          },
        });
      }

      const summarySeed = summarizeWorkflowArtifacts({
        workflowSummary: autoCompaction && compactionResult.overflow ? compactionResult.trimmedWorkflowSummary : workflowSummary,
        stage: session.currentStage,
        previous: previousSummary,
        latestCheckpointId: session.latestCheckpointId,
        continuationSummary: autoCompaction && compactionResult.overflow ? compactionResult.continuationSummary : undefined,
      });
      const summary = summaryRepo.save({
        sessionId: session.sessionId,
        filesChanged: summarySeed.filesChanged,
        additions: summarySeed.additions,
        deletions: summarySeed.deletions,
        lastDiffAt: summarySeed.lastDiffAt,
        latestStage: summarySeed.latestStage,
        latestCheckpointId: summarySeed.latestCheckpointId,
        continuationSummary: summarySeed.continuationSummary,
        continuationCreatedAt: summarySeed.continuationCreatedAt,
      });
      audit.recordRuntimeEvent({
        sessionId: session.sessionId,
        eventType: "summary_updated",
        eventJson: {
          summaryId: summary.id,
          filesChanged: summary.filesChanged,
          additions: summary.additions,
          deletions: summary.deletions,
        },
      });

      const postWorkflowCheckpoint = checkpointsRepo.save({
        sessionId: session.sessionId,
        checkpointType: "post_workflow",
        lane: session.lane,
        stage: session.currentStage,
        summarySnapshotJson: {
          filesChanged: summary.filesChanged,
          additions: summary.additions,
          deletions: summary.deletions,
          lastDiffAt: summary.lastDiffAt,
          latestStage: summary.latestStage,
          latestCheckpointId: summary.latestCheckpointId,
          continuationSummary: summary.continuationSummary,
          continuationCreatedAt: summary.continuationCreatedAt,
        },
        workflowSnapshotJson: workflow as Record<string, unknown>,
        continuationJson: {
          continuationSummary: summary.continuationSummary,
          anchors: compactionResult.anchors,
        },
        metadataJson: {
          objective: input.objective,
          compacted: autoCompaction && compactionResult.overflow,
        },
      });
      session = {
        ...session,
        latestSummaryId: summary.id,
        latestCheckpointId: postWorkflowCheckpoint.id,
        updatedAt: nowIso(),
      };
      sessionsRepo.save(session);
      audit.recordRuntimeEvent({
        sessionId: session.sessionId,
        eventType: "checkpoint_created",
        eventJson: {
          checkpointId: postWorkflowCheckpoint.id,
          checkpointType: postWorkflowCheckpoint.checkpointType,
        },
      });

      return stageRunner.advance({
        session,
        workflow,
        latestEnvelope: envelope,
      });
    },
    {
      metadata: {
        lane,
        stage: session.currentStage,
      },
      onBusy: async (entry) => {
        audit.recordRuntimeEvent({
          sessionId: session.sessionId,
          eventType: "busy",
          eventJson: {
            runId: entry.runId,
            lane,
            stage: session.currentStage,
          },
        });
      },
      onIdle: async (entry) => {
        audit.recordRuntimeEvent({
          sessionId: session.sessionId,
          eventType: "idle",
          eventJson: {
            runId: entry.runId,
            cancelRequestedAt: entry.cancelRequestedAt,
          },
        });
      },
    }
  );

  return {
    exitCode: 0,
    lane,
    sessionId: session.sessionId,
    stage: transition.session.currentStage,
    agent: agent.displayName,
    model: `${envelope.resolvedModel.providerId}/${envelope.resolvedModel.modelId}/${envelope.resolvedModel.variantId}`,
    objective: input.objective,
    workflowSummary,
  };
}

/**
 * Attempt to create a real ChatProvider from the repo config.
 * Returns undefined if config is missing, the model is unavailable,
 * or any other setup error occurs — callers fall back to offline mode
 * (each team agent has its own fallback path when provider is undefined).
 */
async function tryCreateChatProvider(
  repoRoot: string,
  selection: import("../../../shared/src/types/model.js").ResolvedModelSelection,
): Promise<ChatProvider | undefined> {
  try {
    return await createChatProvider(repoRoot, selection);
  } catch {
    return undefined;
  }
}
