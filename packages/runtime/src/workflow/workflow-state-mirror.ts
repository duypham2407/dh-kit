import fs from "node:fs/promises";
import path from "node:path";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { WorkflowState } from "../../../shared/src/types/stage.js";

export async function writeWorkflowCompatibilityMirror(input: {
  repoRoot: string;
  session: SessionState;
  workflow: WorkflowState;
  latestEnvelope: ExecutionEnvelopeState;
}): Promise<void> {
  const mirrorPath = path.join(input.repoRoot, ".dh", "workflow-state.json");
  await fs.mkdir(path.dirname(mirrorPath), { recursive: true });
  await fs.writeFile(
    mirrorPath,
    `${JSON.stringify(
      {
        sessionId: input.session.sessionId,
        lane: input.session.lane,
        laneLocked: input.session.laneLocked,
        currentStage: input.workflow.stage,
        stageStatus: input.workflow.stageStatus,
        semanticMode: input.session.semanticMode,
        toolEnforcementLevel: input.session.toolEnforcementLevel,
        activeWorkItemIds: input.session.activeWorkItemIds,
        latestEnvelope: {
          id: input.latestEnvelope.id,
          agentId: input.latestEnvelope.agentId,
          role: input.latestEnvelope.role,
          stage: input.latestEnvelope.stage,
          resolvedModel: input.latestEnvelope.resolvedModel,
        },
        updatedAt: input.session.updatedAt,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
