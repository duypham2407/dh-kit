import {
  type AuditQueryFilter,
  type HookInvocationLog,
  type McpRouteAudit,
  type QualityGateAudit,
  type SkillActivationAudit,
  type ToolUsageAudit,
} from "../../../shared/src/types/audit.js";
import { normalizeAuditQueryLimit } from "../../../storage/src/sqlite/repositories/audit-query-utils.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { McpRouteAuditRepo } from "../../../storage/src/sqlite/repositories/mcp-route-audit-repo.js";
import { QualityGateAuditRepo } from "../../../storage/src/sqlite/repositories/quality-gate-audit-repo.js";
import { SkillActivationAuditRepo } from "../../../storage/src/sqlite/repositories/skill-activation-audit-repo.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";

const DEFAULT_RECENT_WINDOW_HOURS = 24;

export type AuditSourceError = {
  source: "tool" | "skill" | "mcp" | "quality_gate" | "hook";
  message: string;
};

export type AuditInspectionSnapshot = {
  query: Required<Pick<AuditQueryFilter, "limit">> & Omit<AuditQueryFilter, "limit">;
    summary: {
      timelineCount: number;
      toolCount: number;
      skillCount: number;
      mcpCount: number;
      qualityGateCount: number;
      hookCount: number;
      toolStatusCounts: Record<ToolUsageAudit["status"], number>;
      hookDecisionCounts: Record<HookInvocationLog["decision"], number>;
      qualityGateResultCounts: Record<QualityGateAudit["result"], number>;
      qualityGateAvailabilityCounts: Record<QualityGateAudit["availability"], number>;
    };
  timeline: Array<
    | { kind: "tool"; timestamp: string; record: ToolUsageAudit }
    | { kind: "skill"; timestamp: string; record: SkillActivationAudit }
    | { kind: "mcp"; timestamp: string; record: McpRouteAudit }
    | { kind: "quality_gate"; timestamp: string; record: QualityGateAudit }
    | { kind: "hook"; timestamp: string; record: HookInvocationLog }
  >;
  breakdown: {
    tools: ToolUsageAudit[];
    skills: SkillActivationAudit[];
    mcps: McpRouteAudit[];
    qualityGates: QualityGateAudit[];
    hooks: HookInvocationLog[];
  };
  errors: AuditSourceError[];
};

export type AuditInspectionProfiles = {
  latestSession: AuditInspectionSnapshot;
  recentWindow: AuditInspectionSnapshot;
};

function toIsoHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

export class AuditQueryService {
  private readonly toolUsageAuditRepo: ToolUsageAuditRepo;
  private readonly skillActivationAuditRepo: SkillActivationAuditRepo;
  private readonly mcpRouteAuditRepo: McpRouteAuditRepo;
  private readonly qualityGateAuditRepo: QualityGateAuditRepo;
  private readonly hookInvocationLogsRepo: HookInvocationLogsRepo;

  constructor(private readonly repoRoot: string) {
    this.toolUsageAuditRepo = new ToolUsageAuditRepo(repoRoot);
    this.skillActivationAuditRepo = new SkillActivationAuditRepo(repoRoot);
    this.mcpRouteAuditRepo = new McpRouteAuditRepo(repoRoot);
    this.qualityGateAuditRepo = new QualityGateAuditRepo(repoRoot);
    this.hookInvocationLogsRepo = new HookInvocationLogsRepo(repoRoot);
  }

  getInspectionSnapshot(filter: AuditQueryFilter): AuditInspectionSnapshot {
    const normalizedLimit = normalizeAuditQueryLimit(filter.limit);
    const normalizedFilter: Required<Pick<AuditQueryFilter, "limit">> & Omit<AuditQueryFilter, "limit"> = {
      ...filter,
      limit: normalizedLimit,
    };
    const errors: AuditSourceError[] = [];

    let tools: ToolUsageAudit[] = [];
    try {
      tools = this.toolUsageAuditRepo.list(normalizedFilter);
    } catch (error) {
      errors.push({ source: "tool", message: error instanceof Error ? error.message : String(error) });
    }

    let skills: SkillActivationAudit[] = [];
    try {
      skills = this.skillActivationAuditRepo.list(normalizedFilter);
    } catch (error) {
      errors.push({ source: "skill", message: error instanceof Error ? error.message : String(error) });
    }

    let mcps: McpRouteAudit[] = [];
    try {
      mcps = this.mcpRouteAuditRepo.list(normalizedFilter);
    } catch (error) {
      errors.push({ source: "mcp", message: error instanceof Error ? error.message : String(error) });
    }

    let hooks: HookInvocationLog[] = [];
    this.addHookUnsupportedError(normalizedFilter, errors);
    try {
      hooks = this.listHooks(normalizedFilter);
    } catch (error) {
      errors.push({ source: "hook", message: error instanceof Error ? error.message : String(error) });
    }

    let qualityGates: QualityGateAudit[] = [];
    try {
      qualityGates = this.qualityGateAuditRepo.list(normalizedFilter);
    } catch (error) {
      errors.push({ source: "quality_gate", message: error instanceof Error ? error.message : String(error) });
    }

    const toolStatusCounts: Record<ToolUsageAudit["status"], number> = {
      called: 0,
      succeeded: 0,
      failed: 0,
      required_but_missing: 0,
    };
    for (const tool of tools) {
      toolStatusCounts[tool.status] += 1;
    }

    const hookDecisionCounts: Record<HookInvocationLog["decision"], number> = {
      allow: 0,
      block: 0,
      modify: 0,
    };
    for (const hook of hooks) {
      hookDecisionCounts[hook.decision] += 1;
    }

    const qualityGateResultCounts: Record<QualityGateAudit["result"], number> = {
      pass: 0,
      fail: 0,
      not_run: 0,
    };
    const qualityGateAvailabilityCounts: Record<QualityGateAudit["availability"], number> = {
      available: 0,
      unavailable: 0,
      not_configured: 0,
    };
    for (const qualityGate of qualityGates) {
      qualityGateResultCounts[qualityGate.result] += 1;
      qualityGateAvailabilityCounts[qualityGate.availability] += 1;
    }

    const timeline = [
      ...tools.map((record) => ({ kind: "tool" as const, timestamp: record.timestamp, record })),
      ...skills.map((record) => ({ kind: "skill" as const, timestamp: record.timestamp, record })),
      ...mcps.map((record) => ({ kind: "mcp" as const, timestamp: record.timestamp, record })),
      ...qualityGates.map((record) => ({ kind: "quality_gate" as const, timestamp: record.timestamp, record })),
      ...hooks.map((record) => ({ kind: "hook" as const, timestamp: record.timestamp, record })),
    ]
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, normalizedLimit);

    return {
      query: normalizedFilter,
      summary: {
        timelineCount: timeline.length,
        toolCount: tools.length,
        skillCount: skills.length,
        mcpCount: mcps.length,
        qualityGateCount: qualityGates.length,
        hookCount: hooks.length,
        toolStatusCounts,
        hookDecisionCounts,
        qualityGateResultCounts,
        qualityGateAvailabilityCounts,
      },
      timeline,
      breakdown: {
        tools,
        skills,
        mcps,
        qualityGates,
        hooks,
      },
      errors,
    };
  }

  getInspectionProfiles(input: {
    latestSessionId: string;
    limit?: number;
    recentWindowHours?: number;
  }): AuditInspectionProfiles {
    const normalizedLimit = normalizeAuditQueryLimit(input.limit);
    const recentWindowHours = Number.isFinite(input.recentWindowHours)
      ? Math.max(1, Math.trunc(input.recentWindowHours ?? DEFAULT_RECENT_WINDOW_HOURS))
      : DEFAULT_RECENT_WINDOW_HOURS;

    return {
      latestSession: this.getInspectionSnapshot({
        sessionId: input.latestSessionId,
        limit: normalizedLimit,
      }),
      recentWindow: this.getInspectionSnapshot({
        fromTimestamp: toIsoHoursAgo(recentWindowHours),
        limit: normalizedLimit,
      }),
    };
  }

  private listHooks(filter: AuditQueryFilter): HookInvocationLog[] {
    if (!filter.sessionId) {
      return [];
    }
    let hooks = this.hookInvocationLogsRepo.listBySession(filter.sessionId);

    if (filter.envelopeId) {
      hooks = hooks.filter((hook) => hook.envelopeId === filter.envelopeId);
    }
    if (filter.fromTimestamp) {
      hooks = hooks.filter((hook) => hook.timestamp >= filter.fromTimestamp!);
    }
    if (filter.toTimestamp) {
      hooks = hooks.filter((hook) => hook.timestamp <= filter.toTimestamp!);
    }

    return hooks.slice(0, normalizeAuditQueryLimit(filter.limit));
  }

  private addHookUnsupportedError(filter: AuditQueryFilter, errors: AuditSourceError[]): void {
    if (!filter.sessionId) {
      errors.push({
        source: "hook",
        message: "Hook inspection requires sessionId; query executed without hook data.",
      });
    }
  }

}
