import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { ToolUsageAuditRepo } from "../../../storage/src/sqlite/repositories/tool-usage-audit-repo.js";
import { SkillActivationAuditRepo } from "../../../storage/src/sqlite/repositories/skill-activation-audit-repo.js";
import { McpRouteAuditRepo } from "../../../storage/src/sqlite/repositories/mcp-route-audit-repo.js";
import { HookInvocationLogsRepo } from "../../../storage/src/sqlite/repositories/hook-invocation-logs-repo.js";
import { QualityGateAuditRepo } from "../../../storage/src/sqlite/repositories/quality-gate-audit-repo.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { AuditQueryService } from "./audit-query-service.js";
import { createDebugDump } from "./debug-dump.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-audit-query-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("AuditQueryService", () => {
  it("aggregates bounded session inspection across tool/skill/mcp/hook sources", () => {
    const repoRoot = makeTmpRepo();
    const toolRepo = new ToolUsageAuditRepo(repoRoot);
    const skillRepo = new SkillActivationAuditRepo(repoRoot);
    const mcpRepo = new McpRouteAuditRepo(repoRoot);
    const hookRepo = new HookInvocationLogsRepo(repoRoot);
    const qualityGateRepo = new QualityGateAuditRepo(repoRoot);

    toolRepo.save({
      id: "tool-1",
      sessionId: "sess-1",
      envelopeId: "env-1",
      role: "implementer",
      intent: "run test",
      toolName: "Bash",
      status: "succeeded",
      timestamp: "2026-04-12T11:00:00.000Z",
    });
    toolRepo.save({
      id: "tool-2",
      sessionId: "sess-1",
      envelopeId: "env-2",
      role: "implementer",
      intent: "inspect",
      toolName: "Read",
      status: "failed",
      timestamp: "2026-04-12T11:01:00.000Z",
    });
    skillRepo.save({
      id: "skill-1",
      sessionId: "sess-1",
      envelopeId: "env-3",
      role: "implementer",
      skillName: "verification-before-completion",
      activationReason: "final verification",
      timestamp: "2026-04-12T11:02:00.000Z",
    });
    mcpRepo.save({
      id: "mcp-1",
      sessionId: "sess-1",
      envelopeId: "env-4",
      role: "implementer",
      mcpName: "openkit",
      routeReason: "runtime query",
      timestamp: "2026-04-12T11:03:00.000Z",
    });
    hookRepo.save({
      id: "hook-1",
      sessionId: "sess-1",
      envelopeId: "env-5",
      hookName: "pre_tool_exec",
      input: { toolName: "Bash" },
      output: { allow: false },
      decision: "modify",
      reason: "modified for safety",
      durationMs: 3,
      timestamp: "2026-04-12T11:04:00.000Z",
    });
    qualityGateRepo.save({
      id: "qg-1",
      sessionId: "sess-1",
      envelopeId: "env-6",
      role: "implementer",
      gateId: "rule_scan",
      availability: "not_configured",
      result: "not_run",
      reason: "Semgrep configuration missing.",
      evidence: [],
      limitations: ["No Semgrep configuration"],
      timestamp: "2026-04-12T11:03:30.000Z",
    });

    const service = new AuditQueryService(repoRoot);
    const snapshot = service.getInspectionSnapshot({
      sessionId: "sess-1",
      fromTimestamp: "2026-04-12T11:00:00.000Z",
      toTimestamp: "2026-04-12T11:04:00.000Z",
      limit: 3,
    });

    expect(snapshot.query.limit).toBe(3);
    expect(snapshot.breakdown.tools).toHaveLength(2);
    expect(snapshot.breakdown.skills).toHaveLength(1);
    expect(snapshot.breakdown.mcps).toHaveLength(1);
    expect(snapshot.breakdown.qualityGates).toHaveLength(1);
    expect(snapshot.breakdown.hooks).toHaveLength(1);
    expect(snapshot.summary.toolStatusCounts.succeeded).toBe(1);
    expect(snapshot.summary.toolStatusCounts.failed).toBe(1);
    expect(snapshot.summary.hookDecisionCounts.modify).toBe(1);
    expect(snapshot.summary.qualityGateResultCounts.not_run).toBe(1);
    expect(snapshot.summary.qualityGateAvailabilityCounts.not_configured).toBe(1);
    expect(snapshot.summary.timelineCount).toBe(3);
    expect(snapshot.timeline).toHaveLength(3);
    expect(snapshot.timeline[0]!.timestamp >= snapshot.timeline[1]!.timestamp).toBe(true);
    expect(snapshot.errors).toEqual([]);
  });

  it("returns bounded profile snapshots for latest session and recent window", () => {
    const repoRoot = makeTmpRepo();
    const toolRepo = new ToolUsageAuditRepo(repoRoot);
    const now = new Date().toISOString();

    toolRepo.save({
      id: "tool-now",
      sessionId: "sess-now",
      envelopeId: "env-now",
      role: "analyst",
      intent: "inspect",
      toolName: "Read",
      status: "called",
      timestamp: now,
    });

    const service = new AuditQueryService(repoRoot);
    const profiles = service.getInspectionProfiles({
      latestSessionId: "sess-now",
      limit: 1,
      recentWindowHours: 1,
    });

    expect(profiles.latestSession.query.sessionId).toBe("sess-now");
    expect(profiles.latestSession.query.limit).toBe(1);
    expect(profiles.latestSession.breakdown.tools).toHaveLength(1);
    expect(profiles.recentWindow.query.fromTimestamp).toBeDefined();
    expect(profiles.recentWindow.breakdown.tools).toHaveLength(1);
    expect(profiles.recentWindow.breakdown.qualityGates).toHaveLength(0);
    expect(profiles.recentWindow.breakdown.hooks).toHaveLength(0);
    expect(profiles.recentWindow.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "hook",
          message: expect.stringContaining("requires sessionId"),
        }),
      ]),
    );
  });

  it("includes quality-gate records in recentWindow without session filter", () => {
    const repoRoot = makeTmpRepo();
    const qualityGateRepo = new QualityGateAuditRepo(repoRoot);

    qualityGateRepo.save({
      id: "qg-window-1",
      sessionId: "sess-a",
      envelopeId: "env-a",
      role: "implementer",
      gateId: "workflow_gate",
      availability: "available",
      result: "pass",
      reason: "workflow pass",
      evidence: ["gate evidence"],
      limitations: [],
      timestamp: new Date().toISOString(),
    });

    const service = new AuditQueryService(repoRoot);
    const profiles = service.getInspectionProfiles({
      latestSessionId: "sess-a",
      limit: 10,
      recentWindowHours: 1,
    });

    expect(profiles.recentWindow.breakdown.qualityGates.length).toBeGreaterThan(0);
    expect(profiles.recentWindow.summary.qualityGateCount).toBeGreaterThan(0);
  });
});

describe("createDebugDump", () => {
  it("includes bounded audit inspection profiles", async () => {
    const repoRoot = makeTmpRepo();
    const configRepo = new ConfigRepo(repoRoot);
    configRepo.write("debug.latest_session_id", "sess-debug");

    const toolRepo = new ToolUsageAuditRepo(repoRoot);
    toolRepo.save({
      id: "tool-debug-1",
      sessionId: "sess-debug",
      envelopeId: "env-debug-1",
      role: "implementer",
      intent: "debug",
      toolName: "Read",
      status: "succeeded",
      timestamp: new Date().toISOString(),
    });

    const dump = await createDebugDump(repoRoot);
    expect(dump.auditInspection).toBeDefined();
    expect(dump.operatorSafeWorktree).toBeDefined();
    expect(dump.operatorSafeWorktree.mode).toBe("dry_run");
    expect(dump.operatorSafeWorktree.allowed).toBe(true);
    expect(dump.auditInspection.latestSession.query.sessionId).toBe("sess-debug");
    expect(dump.auditInspection.latestSession.query.limit).toBe(25);
    expect(dump.auditInspection.latestSession.summary.toolCount).toBe(1);
    expect(dump.auditInspection.recentWindow.query.fromTimestamp).toBeDefined();
    expect(dump.extensionStateDrift).toBeDefined();
    expect(dump.extensionStateDrift.summary.persistedExtensionCount).toBeGreaterThanOrEqual(0);
    expect(dump.extensionStateDrift.summary.updatedCount).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(dump.extensionStateDrift.extensions)).toBe(true);
    expect(Array.isArray(dump.extensionStateDrift.warnings)).toBe(true);
  });
});
