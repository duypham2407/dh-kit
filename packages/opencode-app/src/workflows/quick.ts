import { runCoordinator } from "../team/coordinator.js";
import { evaluateGate } from "../../../runtime/src/workflow/gate-evaluator.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { WorkflowAuditService } from "../../../runtime/src/workflow/workflow-audit-service.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";

export async function runQuickWorkflow(input: {
  objective: string;
  stage: string;
  repoRoot: string;
  envelope: ExecutionEnvelopeState;
  provider?: ChatProvider;
}): Promise<{ summary: string; nextStep: string }> {
  const audit = new WorkflowAuditService(input.repoRoot);
  const gate = evaluateGate({
    workflow: {
      lane: "quick",
      stage: input.stage as never,
      stageStatus: "in_progress",
      gateStatus: "pending",
      blockers: [],
    },
    objective: input.objective,
    evidence: {
      requirementsClear: true,
      acceptanceCriteriaDefined: true,
      verificationEvidencePresent: true,
    },
  });
  const coordinator = await runCoordinator({ lane: "quick", stage: input.stage, objective: input.objective, provider: input.provider });
  audit.recordRoleOutput(input.envelope, coordinator);
  audit.recordRequiredTool(input.envelope, "workflow.quick", "quick_workflow", "called");
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "pre_answer",
    decision: gate.pass ? "allow" : "block",
    reason: gate.reason,
    payloadIn: { objective: input.objective, stage: input.stage },
    payloadOut: { pass: gate.pass, gate: gate.gate },
  });
  return {
    summary: `${coordinator.summary} Gate: ${gate.reason}`,
    nextStep: coordinator.nextRole,
  };
}
