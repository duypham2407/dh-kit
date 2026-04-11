import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import type { AgentRole } from "../../../shared/src/types/agent.js";
import { evaluateBashCommand } from "./bash-guard.js";
import { evaluateEvidence } from "./evidence-gate.js";
import { EnforcementWriter } from "./enforcement-writer.js";

export class RuntimeEnforcer {
  private readonly sessionsRepo: SessionsRepo;
  private readonly writer: EnforcementWriter;
  private readonly toolAuditRepo: ToolUsageAuditRepo;

  constructor(private readonly repoRoot: string) {
    this.sessionsRepo = new SessionsRepo(repoRoot);
    this.writer = new EnforcementWriter(repoRoot);
    this.toolAuditRepo = new ToolUsageAuditRepo(repoRoot);
  }

  preToolExec(input: {
    sessionId: string;
    envelopeId: string;
    role: AgentRole;
    intent: string;
    toolName: string;
    toolArgs: Record<string, unknown>;
  }): { allow: boolean; reason: string } {
    if (input.toolName !== "bash") {
      this.writer.writeBashGuardDecision({
        sessionId: input.sessionId,
        envelopeId: input.envelopeId,
        command: `[tool:${input.toolName}]`,
        result: {
          allowed: true,
          blocked: false,
          reason: "Non-bash tool; guard bypassed.",
        },
      });
      this.toolAuditRepo.save({
        id: createId("tool-audit"),
        sessionId: input.sessionId,
        envelopeId: input.envelopeId,
        role: input.role,
        intent: input.intent,
        toolName: input.toolName,
        status: "called",
        timestamp: nowIso(),
      });
      return { allow: true, reason: "Non-bash tool; guard bypassed." };
    }

    const session = this.sessionsRepo.findById(input.sessionId);
    const level = session?.toolEnforcementLevel === "very-hard" ? "strict" : "advisory";
    const command = String(input.toolArgs.command ?? "");
    const decision = evaluateBashCommand(command, level);
    this.writer.writeBashGuardDecision({
      sessionId: input.sessionId,
      envelopeId: input.envelopeId,
      command,
      result: decision,
    });
    this.toolAuditRepo.save({
      id: createId("tool-audit"),
      sessionId: input.sessionId,
      envelopeId: input.envelopeId,
      role: input.role,
      intent: input.intent,
      toolName: input.toolName,
      status: decision.allowed ? "succeeded" : "failed",
      timestamp: nowIso(),
    });

    return { allow: decision.allowed, reason: decision.reason };
  }

  preAnswer(input: {
    sessionId: string;
    envelopeId: string;
    intentText: string;
    toolsUsed: string[];
    evidenceScore: number;
  }): { allow: boolean; action: string; reason: string } {
    const decision = evaluateEvidence({
      userIntentText: input.intentText,
      toolsUsed: input.toolsUsed,
      evidenceScore: input.evidenceScore,
      threshold: 0.5,
    });

    this.writer.writeEvidenceGateDecision({
      sessionId: input.sessionId,
      envelopeId: input.envelopeId,
      intent: input.intentText,
      toolsUsed: input.toolsUsed,
      evidenceScore: input.evidenceScore,
      result: decision,
    });

    return {
      allow: decision.allowed,
      action: decision.allowed ? "finalize" : "retry_with_more_evidence",
      reason: decision.reason,
    };
  }
}
