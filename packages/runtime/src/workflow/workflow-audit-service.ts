import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { McpRouteAudit, SkillActivationAudit, ToolUsageAudit } from "../../../shared/src/types/audit.js";
import type { RoleOutputPayload, RoleOutputRecord } from "../../../shared/src/types/role-output.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import {
  buildBridgeEnvelopeContext,
  writeHookDecision,
  type HookDecision,
  type HookName,
} from "../../../opencode-sdk/src/index.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { McpRouteAuditRepo } from "../../../storage/src/sqlite/repositories/mcp-route-audit-repo.js";
import { RoleOutputsRepo } from "../../../storage/src/sqlite/repositories/role-outputs-repo.js";
import { SkillActivationAuditRepo } from "../../../storage/src/sqlite/repositories/skill-activation-audit-repo.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";

export class WorkflowAuditService {
  private readonly toolUsageAuditRepo: ToolUsageAuditRepo;
  private readonly skillActivationAuditRepo: SkillActivationAuditRepo;
  private readonly mcpRouteAuditRepo: McpRouteAuditRepo;
  private readonly hookInvocationLogsRepo: HookInvocationLogsRepo;
  private readonly roleOutputsRepo: RoleOutputsRepo;
  private readonly sessionRuntimeEventsRepo: SessionRuntimeEventsRepo;

  constructor(private readonly repoRoot: string) {
    this.toolUsageAuditRepo = new ToolUsageAuditRepo(repoRoot);
    this.skillActivationAuditRepo = new SkillActivationAuditRepo(repoRoot);
    this.mcpRouteAuditRepo = new McpRouteAuditRepo(repoRoot);
    this.hookInvocationLogsRepo = new HookInvocationLogsRepo(repoRoot);
    this.roleOutputsRepo = new RoleOutputsRepo(repoRoot);
    this.sessionRuntimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  }

  recordRoleOutput(envelope: ExecutionEnvelopeState, payload: RoleOutputPayload): void {
    const record: RoleOutputRecord = {
      id: createId("role-output"),
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      role: envelope.role,
      stage: envelope.stage,
      payload,
      createdAt: nowIso(),
    };
    this.roleOutputsRepo.save(record);
  }

  recordRequiredTool(envelope: ExecutionEnvelopeState, toolName: string, intent: string, status: ToolUsageAudit["status"]): void {
    this.toolUsageAuditRepo.save({
      id: createId("tool-audit"),
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      role: envelope.role,
      intent,
      toolName,
      status,
      timestamp: nowIso(),
    });
  }

  recordSkillActivation(envelope: ExecutionEnvelopeState, skillName: string, activationReason: string): void {
    const record: SkillActivationAudit = {
      id: createId("skill-audit"),
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      role: envelope.role,
      skillName,
      activationReason,
      timestamp: nowIso(),
    };
    this.skillActivationAuditRepo.save(record);
  }

  recordMcpRoute(envelope: ExecutionEnvelopeState, mcpName: string, routeReason: string): void {
    const record: McpRouteAudit = {
      id: createId("mcp-audit"),
      sessionId: envelope.sessionId,
      envelopeId: envelope.id,
      role: envelope.role,
      mcpName,
      routeReason,
      timestamp: nowIso(),
    };
    this.mcpRouteAuditRepo.save(record);
  }

  recordHookDecision(input: {
    envelope: ExecutionEnvelopeState;
    hookName: HookName;
    decision: HookDecision;
    reason: string;
    payloadIn: Record<string, unknown>;
    payloadOut: Record<string, unknown>;
    durationMs?: number;
  }): void {
    writeHookDecision(this.hookInvocationLogsRepo, {
      envelope: buildBridgeEnvelopeContext({
        sessionId: input.envelope.sessionId,
        envelopeId: input.envelope.id,
        transportMode: "sqlite",
      }),
      hookName: input.hookName,
      decision: input.decision,
      reason: input.reason,
      payloadIn: input.payloadIn,
      payloadOut: input.payloadOut,
      durationMs: input.durationMs,
      id: createId("hook-log"),
      timestamp: nowIso(),
    });
  }

  recordRuntimeEvent(input: {
    sessionId: string;
    eventType: "busy" | "idle" | "cancel" | "retry" | "retry_give_up" | "summary_updated" | "compaction" | "checkpoint_created" | "revert";
    eventJson?: Record<string, unknown>;
  }): void {
    this.sessionRuntimeEventsRepo.save({
      sessionId: input.sessionId,
      eventType: input.eventType,
      eventJson: input.eventJson,
    });
  }
}
