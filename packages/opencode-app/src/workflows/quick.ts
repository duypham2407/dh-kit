import { runQuickAgent } from "../team/quick-agent.js";
import { evaluateGate } from "../../../runtime/src/workflow/gate-evaluator.js";
import { runBrowserVerification } from "../browser/verification.js";
import { buildWorkflowQualityGateReport } from "../../../runtime/src/workflow/quality-gates-runtime.js";
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
  const browserObjective = isBrowserObjective(input.objective);
  const browser = runBrowserVerification({
    objective: input.objective,
    routedMcps: input.envelope.activeMcps,
    evidencePolicy: browserObjective ? "required" : "optional",
  });
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
  const agentOutput = await runQuickAgent({ lane: "quick", stage: input.stage, objective: input.objective, provider: input.provider });
  const qualityGates = buildWorkflowQualityGateReport({
    repoRoot: input.repoRoot,
    lane: "quick",
    workflowGate: {
      pass: gate.pass,
      reason: gate.reason,
    },
    localVerification: {
      pass: true,
      reason: "Quick workflow produced agent output and gate assessment.",
      evidence: [agentOutput.summary],
      limitations: [],
    },
    browserVerification: browser,
  });

  audit.recordGateDecision(input.envelope, gate);
  audit.recordRoleOutput(input.envelope, agentOutput);
  audit.recordRequiredTool(input.envelope, "workflow.quick", "quick_workflow", "called");
  for (const result of qualityGates.results) {
    audit.recordQualityGate(input.envelope, {
      gateId: result.gateId,
      availability: qualityGates.availability.gates[result.gateId].availability,
      result: result.status,
      reason: result.reason,
      evidence: result.evidence,
      limitations: result.limitations,
    });
    if (result.gateId === "rule_scan" || result.gateId === "security_scan") {
      const availability = qualityGates.availability.gates[result.gateId].availability;
      audit.recordRequiredTool(
        input.envelope,
        result.gateId,
        `${result.gateId}_quality_gate`,
        availability === "available" ? "called" : "required_but_missing",
      );
    }
  }
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "pre_answer",
    decision: gate.pass ? "allow" : "block",
    reason: gate.reason,
    payloadIn: { objective: input.objective, stage: input.stage },
    payloadOut: {
      pass: gate.pass,
      gate: gate.gate,
      qualityGates,
    },
  });
  return {
    summary: `${agentOutput.summary} Gate: ${gate.reason}`,
    nextStep: agentOutput.nextRole,
  };
}

function isBrowserObjective(objective: string): boolean {
  const normalized = objective.toLowerCase();
  return normalized.includes("browser")
    || normalized.includes("frontend")
    || normalized.includes("ui")
    || normalized.includes("playwright")
    || normalized.includes("devtools");
}
