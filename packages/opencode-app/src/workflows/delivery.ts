import { runAnalyst } from "../team/analyst.js";
import { runArchitect } from "../team/architect.js";
import { runCoordinator } from "../team/coordinator.js";
import { runImplementer } from "../team/implementer.js";
import { runReviewer } from "../team/reviewer.js";
import { runTester } from "../team/tester.js";
import { evaluateGate } from "../../../runtime/src/workflow/gate-evaluator.js";
import { buildHandoff } from "../../../runtime/src/workflow/handoff-manager.js";
import { planWorkItems } from "../../../runtime/src/workflow/work-item-planner.js";
import { WorkflowAuditService } from "../../../runtime/src/workflow/workflow-audit-service.js";
import { WorkItemsRepo } from "../../../storage/src/sqlite/repositories/work-items-repo.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { WorkItemState } from "../../../shared/src/types/work-item.js";
import type { ChatProvider } from "../../../providers/src/chat/types.js";
import { enforceMcpRoutingDetailed } from "../executor/enforce-mcp-routing.js";

export async function runDeliveryWorkflow(input: {
  sessionId: string;
  objective: string;
  stage: string;
  repoRoot: string;
  envelope: ExecutionEnvelopeState;
  provider?: ChatProvider;
}): Promise<{ summary: string[] }> {
  const audit = new WorkflowAuditService(input.repoRoot);
  const coordinator = await runCoordinator({ lane: "delivery", stage: input.stage, objective: input.objective, provider: input.provider });
  const analyst = await runAnalyst({ objective: input.objective, provider: input.provider });
  const architect = await runArchitect({ sessionId: input.sessionId, lane: "delivery", objective: input.objective, provider: input.provider });
  const workItemsRepo = new WorkItemsRepo(input.repoRoot);
  for (const workItem of architect.workItems) {
    workItemsRepo.save(workItem);
  }
  const planned = planWorkItems(architect.workItems);

  const executionReports: WorkItemExecutionReport[] = [];
  for (const group of planned.executionOrder) {
    for (const workItem of group) {
      const implementer = await runImplementer({
        workItemId: workItem.id,
        summary: `${architect.solutionSummary} Execute '${workItem.title}'.`,
        provider: input.provider,
      });
      const reviewer = await runReviewer({
        changedAreas: implementer.changedAreas,
        implementerSummary: implementer.summary,
        provider: input.provider,
      });
      const tester = await runTester({
        objective: `${input.objective}; ${workItem.title}`,
        acceptanceCriteria: workItem.acceptance,
        validationPlan: workItem.validationPlan,
        requiredMcps: input.envelope.activeMcps,
        browserEvidencePolicy: requiresBrowserVerification(input.objective) ? "required" : "optional",
        browserVerificationRequired: requiresBrowserVerification(input.objective),
        provider: input.provider,
      });
      const reviewGate = evaluateGate({
        workflow: {
          lane: "delivery",
          stage: "delivery_review",
          stageStatus: "in_progress",
          gateStatus: "pending",
          blockers: [],
        },
        objective: input.objective,
        evidence: {
          blockerFindingsResolved: reviewer.status !== "FAIL",
        },
      });
      const verificationGate = evaluateGate({
        workflow: {
          lane: "delivery",
          stage: "delivery_verify",
          stageStatus: "in_progress",
          gateStatus: "pending",
          blockers: [],
        },
        objective: input.objective,
        evidence: {
          verificationEvidencePresent: tester.evidence.length > 0,
        },
      });

      executionReports.push({
        workItem,
        implementer,
        reviewer,
        tester,
        reviewGate,
        verificationGate,
      });

      audit.recordRoleOutput(input.envelope, implementer);
      audit.recordRoleOutput(input.envelope, reviewer);
      audit.recordRoleOutput(input.envelope, tester);
    }
  }

  const aggregateReviewPass = executionReports.every((report) => report.reviewGate.pass);
  const aggregateVerificationPass = executionReports.every((report) => report.verificationGate.pass);
  const browserEvidenceAvailable = executionReports.some((report) => {
    return report.tester.evidence.some((item) => item.toLowerCase().includes("browser verification evidence"));
  });

  const handoff = buildHandoff({ lane: "delivery", fromRole: "architect", toRole: "implementer", stage: input.stage });
  const mcpDecision = enforceMcpRoutingDetailed(input.envelope, input.objective);

  audit.recordRoleOutput(input.envelope, coordinator);
  audit.recordRoleOutput(input.envelope, analyst);
  audit.recordRoleOutput(input.envelope, architect);
  audit.recordRequiredTool(input.envelope, "workflow.delivery", "delivery_workflow", "called");
  audit.recordSkillActivation(input.envelope, "verification-before-completion", "Delivery lane requires verification discipline.");
  audit.recordMcpRoute(input.envelope, "augment_context_engine", "Delivery workflow needs codebase understanding.");
  for (const mcpName of mcpDecision.selected) {
    const reasonCodes = mcpDecision.reasons[mcpName] ?? [];
    audit.recordMcpRoute(input.envelope, mcpName, reasonCodes.join(",") || "selected");
  }
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "skill_activation",
    decision: "modify",
    reason: "Delivery workflow activates verification-before-completion.",
    payloadIn: { lane: "delivery", role: input.envelope.role },
    payloadOut: { skills: input.envelope.activeSkills.length > 0 ? input.envelope.activeSkills : ["verification-before-completion"] },
  });
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "mcp_routing",
    decision: "modify",
    reason: "Delivery workflow prioritizes codebase understanding MCPs.",
    payloadIn: { lane: "delivery", role: input.envelope.role },
    payloadOut: {
      mcps: mcpDecision.selected,
      blocked: mcpDecision.blocked,
      warnings: mcpDecision.warnings,
      decisions: mcpDecision.decisions,
      reasons: mcpDecision.reasons,
      rejected: mcpDecision.rejected,
    },
  });
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "session_state",
    decision: "modify",
    reason: "Delivery workflow persists planned work items for staged execution.",
    payloadIn: { sessionId: input.sessionId },
    payloadOut: {
      readyWorkItems: planned.ready.map((item) => item.id),
      blockedWorkItems: planned.blocked.map((item) => item.id),
      parallelizableGroups: planned.parallelizableGroups.map((group) => group.map((item) => item.id)),
      executionOrder: planned.executionOrder.map((group) => group.map((item) => item.id)),
    },
  });
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "model_override",
    decision: "modify",
    reason: "Resolved model selection is persisted into the execution envelope for downstream roles.",
    payloadIn: { agentId: input.envelope.agentId, role: input.envelope.role, lane: input.envelope.lane },
    payloadOut: input.envelope.resolvedModel,
  });
  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "pre_answer",
    decision: aggregateReviewPass && aggregateVerificationPass ? "allow" : "block",
    reason: aggregateReviewPass && aggregateVerificationPass
      ? "All delivery work-item review and verification gates passed."
      : "One or more delivery work-item review/verification gates did not pass.",
    payloadIn: {
      workItemCount: executionReports.length,
      reviewPassCount: executionReports.filter((report) => report.reviewGate.pass).length,
      verificationPassCount: executionReports.filter((report) => report.verificationGate.pass).length,
    },
    payloadOut: {
      reviewPass: aggregateReviewPass,
      verificationPass: aggregateVerificationPass,
      browserEvidenceAvailable,
    },
  });

  return {
    summary: [
      coordinator.summary,
      analyst.problemStatement,
      architect.solutionSummary,
      `Executed work items: ${executionReports.length}`,
      `Execution groups run: ${planned.executionOrder.length}`,
      `Ready work items: ${planned.ready.map((item) => item.title).join(", ") || "none"}`,
      `Blocked work items: ${planned.blocked.map((item) => item.title).join(", ") || "none"}`,
      `Execution order: ${planned.executionOrder.map((group) => `[${group.map((item) => item.title).join(", ")}]`).join(" -> ") || "none"}`,
      `Handoff: ${handoff.notes.join(" ")}`,
      `Implementer: ${aggregateWorkItemStatus(executionReports.map((report) => report.implementer.status))}`,
      `Reviewer: ${aggregateReviewPass ? "PASS" : "FAIL"} (${executionReports.filter((report) => report.reviewGate.pass).length}/${executionReports.length} passed)`,
      `Tester: ${aggregateVerificationPass ? "PASS" : "FAIL"} (${executionReports.filter((report) => report.verificationGate.pass).length}/${executionReports.length} passed${browserEvidenceAvailable ? "; Browser verification evidence available." : ""})`,
    ],
  };
}

type WorkItemExecutionReport = {
  workItem: WorkItemState;
  implementer: Awaited<ReturnType<typeof runImplementer>>;
  reviewer: Awaited<ReturnType<typeof runReviewer>>;
  tester: Awaited<ReturnType<typeof runTester>>;
  reviewGate: ReturnType<typeof evaluateGate>;
  verificationGate: ReturnType<typeof evaluateGate>;
};

function requiresBrowserVerification(objective: string): boolean {
  const normalized = objective.toLowerCase();
  return normalized.includes("browser")
    || normalized.includes("frontend")
    || normalized.includes("ui")
    || normalized.includes("playwright")
    || normalized.includes("devtools");
}

function aggregateWorkItemStatus(statuses: string[]): string {
  if (statuses.length === 0) {
    return "NONE";
  }
  if (statuses.every((status) => status === "DONE")) {
    return "DONE";
  }
  if (statuses.some((status) => status === "BLOCKED")) {
    return "BLOCKED";
  }
  if (statuses.some((status) => status === "NEEDS_CONTEXT")) {
    return "NEEDS_CONTEXT";
  }
  return "DONE_WITH_CONCERNS";
}
