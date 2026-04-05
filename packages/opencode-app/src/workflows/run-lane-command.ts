import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import { SessionManager } from "../../../runtime/src/session/session-manager.js";
import { resumeSession } from "../../../runtime/src/session/session-resume.js";
import { createWorkflowState } from "../../../runtime/src/workflow/workflow-state-manager.js";
import { StageRunner } from "../../../runtime/src/workflow/stage-runner.js";
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

  const result = await sessionManager.createSession(lane, agent);
  const workflow = createWorkflowState(result.session);
  const stageRunner = new StageRunner(input.repoRoot);

  let workflowSummary: string[] = [];
  if (lane === "quick") {
    const quick = await runQuickWorkflow({
      objective: input.objective,
      stage: result.session.currentStage,
      repoRoot: input.repoRoot,
      envelope: result.envelope,
    });
    workflowSummary = [quick.summary, `next: ${quick.nextStep}`];
  } else if (lane === "delivery") {
    const delivery = await runDeliveryWorkflow({
      sessionId: result.session.sessionId,
      objective: input.objective,
      stage: result.session.currentStage,
      repoRoot: input.repoRoot,
      envelope: result.envelope,
    });
    workflowSummary = delivery.summary;
  } else {
    const migration = await runMigrationWorkflow({
      sessionId: result.session.sessionId,
      objective: input.objective,
      stage: result.session.currentStage,
      repoRoot: input.repoRoot,
      envelope: result.envelope,
    });
    workflowSummary = migration.summary;
  }

  const transition = await stageRunner.advance({
    session: result.session,
    workflow,
    latestEnvelope: result.envelope,
  });

  return {
    exitCode: 0,
    lane,
    sessionId: result.session.sessionId,
    stage: transition.session.currentStage,
    agent: agent.displayName,
    model: `${result.envelope.resolvedModel.providerId}/${result.envelope.resolvedModel.modelId}/${result.envelope.resolvedModel.variantId}`,
    objective: input.objective,
    workflowSummary,
  };
}
