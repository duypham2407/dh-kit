import { WorkflowAuditService } from "../workflow/workflow-audit-service.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import type { ExtensionDecisionKind } from "../../../opencode-sdk/src/index.js";

export function recordSessionBootstrap(input: {
  repoRoot: string;
  session: SessionState;
  envelope: ExecutionEnvelopeState;
}): void {
  const audit = new WorkflowAuditService(input.repoRoot);

  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "session_state",
    decision: "modify",
    reason: "Session bootstrap persisted lane, stage, semantic mode, and work-item state.",
    payloadIn: { sessionId: input.session.sessionId },
    payloadOut: {
      lane: input.session.lane,
      laneLocked: input.session.laneLocked,
      currentStage: input.session.currentStage,
      semanticMode: input.session.semanticMode,
      toolEnforcementLevel: input.session.toolEnforcementLevel,
      activeWorkItemIds: input.session.activeWorkItemIds,
    },
  });

  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "model_override",
    decision: "modify",
    reason: "Resolved model selection was attached to the execution envelope during bootstrap.",
    payloadIn: {
      agentId: input.envelope.agentId,
      role: input.envelope.role,
      lane: input.envelope.lane,
    },
    payloadOut: input.envelope.resolvedModel,
  });

  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "skill_activation",
    decision: "modify",
    reason: "Bootstrap attached active skills to the execution envelope.",
    payloadIn: {
      lane: input.envelope.lane,
      role: input.envelope.role,
    },
    payloadOut: { skills: input.envelope.activeSkills },
  });

  audit.recordHookDecision({
    envelope: input.envelope,
    hookName: "mcp_routing",
    decision: "modify",
    reason: "Bootstrap attached active MCP routing to the execution envelope.",
    payloadIn: {
      lane: input.envelope.lane,
      role: input.envelope.role,
    },
    payloadOut: {
      mcps: input.envelope.activeMcps,
      blocked: [],
      warnings: [],
      decisions: input.envelope.activeMcps.reduce<Record<string, ExtensionDecisionKind>>((acc, mcp) => {
        acc[mcp] = "allow";
        return acc;
      }, {}),
      reasons: {},
      rejected: {},
    },
  });
}
