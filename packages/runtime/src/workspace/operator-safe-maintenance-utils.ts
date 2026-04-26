import fs from "node:fs/promises";
import path from "node:path";
import type {
  OperatorSafeArtifactFamily,
  OperatorSafeArtifactFamilySelector,
  OperatorSafeArtifactInspectDetails,
  OperatorSafeArtifactInspectResult,
  OperatorSafeArtifactInventoryRecord,
  OperatorSafeCleanupRequest,
  OperatorSafeMaintenanceActionItem,
  OperatorSafeMaintenanceActionResult,
  OperatorSafeMaintenanceMode,
  OperatorSafeMaintenanceReasonCode,
  OperatorSafePruneRequest,
  OperatorSafeTempWorkspaceManifest,
  OperatorWorktreeExecutionReport,
  OperatorWorktreeMaintenanceInventory,
  OperatorWorktreeSnapshotManifest,
} from "../../../shared/src/types/operator-worktree.js";
import {
  ensureOperatorSafeArtifactDirs,
  resolveOperatorSafeArtifactsRoot,
  resolveOperatorSafeReportsDir,
  resolveOperatorSafeSnapshotsDir,
  resolveOperatorSafeTempDir,
} from "./operator-safe-execution-report.js";

const DEFAULT_RETENTION_MS: Record<OperatorSafeArtifactFamily, number> = {
  report: 7 * 24 * 60 * 60 * 1000,
  snapshot: 3 * 24 * 60 * 60 * 1000,
  temp_workspace: 24 * 60 * 60 * 1000,
};

type ListedArtifact = {
  family: OperatorSafeArtifactFamily;
  artifactId: string;
  path: string;
  existsOnDisk: boolean;
  createdAt?: string;
  lastTouchedAt?: string;
  operation?: OperatorWorktreeExecutionReport["operation"];
  mode?: OperatorWorktreeExecutionReport["mode"];
  executionId?: string;
  reportId?: string;
  outcome?: OperatorWorktreeExecutionReport["outcome"];
  failureClass?: OperatorWorktreeExecutionReport["failureClass"];
  cleanupEligibility: OperatorSafeArtifactInventoryRecord["cleanupEligibility"];
  cleanupReason?: OperatorSafeMaintenanceReasonCode;
  report?: OperatorWorktreeExecutionReport;
  snapshot?: OperatorWorktreeSnapshotManifest;
  tempManifest?: OperatorSafeTempWorkspaceManifest;
  metadataUntrusted?: boolean;
};

function defaultFamilySelector(value?: OperatorSafeArtifactFamilySelector): OperatorSafeArtifactFamilySelector {
  return value ?? "all";
}

function parseJsonSafe<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function isJsonFile(entry: string): boolean {
  return entry.endsWith(".json");
}

function stripJsonSuffix(entry: string): string {
  return entry.endsWith(".json") ? entry.slice(0, -5) : entry;
}

async function readDirEntriesSafe(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

function toIsoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

function isPathWithin(base: string, candidate: string): boolean {
  const relative = path.relative(base, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function resolveArtifactPath(repoRoot: string, family: OperatorSafeArtifactFamily, artifactId: string): string {
  if (family === "report") {
    return path.join(resolveOperatorSafeReportsDir(repoRoot), `${artifactId}.json`);
  }
  if (family === "snapshot") {
    return path.join(resolveOperatorSafeSnapshotsDir(repoRoot), `${artifactId}.json`);
  }
  return path.join(resolveOperatorSafeTempDir(repoRoot), artifactId);
}

function pruneEligibleReason(item: ListedArtifact): OperatorSafeMaintenanceReasonCode {
  if (item.family === "temp_workspace") {
    return "eligible_by_temp_staleness";
  }
  return "eligible_by_policy_prune";
}

function buildInventoryRecord(item: ListedArtifact): OperatorSafeArtifactInventoryRecord {
  return {
    family: item.family,
    artifactId: item.artifactId,
    executionId: item.executionId,
    reportId: item.reportId,
    path: item.path,
    existsOnDisk: item.existsOnDisk,
    createdAt: item.createdAt,
    lastTouchedAt: item.lastTouchedAt,
    operation: item.operation,
    mode: item.mode,
    outcome: item.outcome,
    failureClass: item.failureClass,
    cleanupEligibility: item.cleanupEligibility,
    cleanupReason: item.cleanupReason,
  };
}

function toActionItem(item: ListedArtifact, reason: OperatorSafeMaintenanceReasonCode, detail?: string): OperatorSafeMaintenanceActionItem {
  return {
    family: item.family,
    artifactId: item.artifactId,
    executionId: item.executionId,
    reportId: item.reportId,
    path: item.path,
    reason,
    detail,
  };
}

function getReportCleanupEligible(report: OperatorWorktreeExecutionReport): boolean {
  return ["blocked", "failed", "cleanup_failed", "rollback_degraded"].includes(report.outcome);
}

function classifyReportEligibility(report: OperatorWorktreeExecutionReport): {
  cleanupEligibility: ListedArtifact["cleanupEligibility"];
  cleanupReason?: OperatorSafeMaintenanceReasonCode;
} {
  if (getReportCleanupEligible(report)) {
    return {
      cleanupEligibility: "eligible",
      cleanupReason: "eligible_by_degraded_report",
    };
  }
  return {
    cleanupEligibility: "retained",
    cleanupReason: "cleanup_eligibility_unproven",
  };
}

function classifyTempEligibility(input: {
  nowMs: number;
  createdAt?: string;
  staleAfterMs?: number;
  linkedReportExists: boolean;
  metadataUntrusted: boolean;
}): {
  cleanupEligibility: ListedArtifact["cleanupEligibility"];
  cleanupReason?: OperatorSafeMaintenanceReasonCode;
} {
  if (input.metadataUntrusted) {
    return {
      cleanupEligibility: "unknown",
      cleanupReason: "metadata_unreadable_or_untrusted",
    };
  }

  if (!input.linkedReportExists) {
    return {
      cleanupEligibility: "eligible",
      cleanupReason: "eligible_by_orphan_target",
    };
  }

  if (!input.createdAt || !input.staleAfterMs) {
    return {
      cleanupEligibility: "unknown",
      cleanupReason: "metadata_unreadable_or_untrusted",
    };
  }

  const createdMs = Date.parse(input.createdAt);
  if (!Number.isFinite(createdMs)) {
    return {
      cleanupEligibility: "unknown",
      cleanupReason: "metadata_unreadable_or_untrusted",
    };
  }

  if (input.nowMs >= createdMs + input.staleAfterMs) {
    return {
      cleanupEligibility: "eligible",
      cleanupReason: "eligible_by_temp_staleness",
    };
  }

  return {
    cleanupEligibility: "retained",
    cleanupReason: "cleanup_eligibility_unproven",
  };
}

async function readReportArtifacts(repoRoot: string, nowMs: number): Promise<ListedArtifact[]> {
  const reportsDir = resolveOperatorSafeReportsDir(repoRoot);
  const entries = (await readDirEntriesSafe(reportsDir)).filter(isJsonFile).sort((left, right) => left.localeCompare(right));

  const artifacts: ListedArtifact[] = [];
  for (const entry of entries) {
    const reportPath = path.join(reportsDir, entry);
    const artifactId = stripJsonSuffix(entry);
    const stat = await fs.stat(reportPath).catch(() => null);
    if (!stat) {
      artifacts.push({
        family: "report",
        artifactId,
        path: reportPath,
        existsOnDisk: false,
        cleanupEligibility: "unknown",
        cleanupReason: "already_removed",
      });
      continue;
    }

    const raw = await fs.readFile(reportPath, "utf8").catch(() => null);
    const parsed = raw ? parseJsonSafe<OperatorWorktreeExecutionReport>(raw) : null;
    if (!parsed) {
      artifacts.push({
        family: "report",
        artifactId,
        path: reportPath,
        existsOnDisk: true,
        createdAt: toIsoFromMs(stat.birthtimeMs || stat.mtimeMs || nowMs),
        lastTouchedAt: toIsoFromMs(stat.mtimeMs || nowMs),
        cleanupEligibility: "unknown",
        cleanupReason: "metadata_unreadable_or_untrusted",
        metadataUntrusted: true,
      });
      continue;
    }

    const eligibility = classifyReportEligibility(parsed);
    artifacts.push({
      family: "report",
      artifactId: parsed.id ?? artifactId,
      executionId: parsed.executionId,
      reportId: parsed.id ?? artifactId,
      path: reportPath,
      existsOnDisk: true,
      createdAt: parsed.createdAt ?? toIsoFromMs(stat.birthtimeMs || stat.mtimeMs || nowMs),
      lastTouchedAt: toIsoFromMs(stat.mtimeMs || nowMs),
      operation: parsed.operation,
      mode: parsed.mode,
      outcome: parsed.outcome,
      failureClass: parsed.failureClass,
      cleanupEligibility: eligibility.cleanupEligibility,
      cleanupReason: eligibility.cleanupReason,
      report: parsed,
    });
  }

  return artifacts;
}

async function readSnapshotArtifacts(
  repoRoot: string,
  nowMs: number,
  knownReportIds: Set<string>,
): Promise<ListedArtifact[]> {
  const snapshotsDir = resolveOperatorSafeSnapshotsDir(repoRoot);
  const entries = (await readDirEntriesSafe(snapshotsDir)).filter(isJsonFile).sort((left, right) => left.localeCompare(right));

  const artifacts: ListedArtifact[] = [];
  for (const entry of entries) {
    const snapshotPath = path.join(snapshotsDir, entry);
    const artifactId = stripJsonSuffix(entry);
    const stat = await fs.stat(snapshotPath).catch(() => null);
    if (!stat) {
      artifacts.push({
        family: "snapshot",
        artifactId,
        path: snapshotPath,
        existsOnDisk: false,
        cleanupEligibility: "unknown",
        cleanupReason: "already_removed",
      });
      continue;
    }

    const raw = await fs.readFile(snapshotPath, "utf8").catch(() => null);
    const parsed = raw ? parseJsonSafe<OperatorWorktreeSnapshotManifest>(raw) : null;
    if (!parsed) {
      artifacts.push({
        family: "snapshot",
        artifactId,
        path: snapshotPath,
        existsOnDisk: true,
        createdAt: toIsoFromMs(stat.birthtimeMs || stat.mtimeMs || nowMs),
        lastTouchedAt: toIsoFromMs(stat.mtimeMs || nowMs),
        cleanupEligibility: "unknown",
        cleanupReason: "metadata_unreadable_or_untrusted",
        metadataUntrusted: true,
      });
      continue;
    }

    const linkedReportExists = typeof parsed.reportId === "string" && knownReportIds.has(parsed.reportId);
    artifacts.push({
      family: "snapshot",
      artifactId: parsed.id ?? artifactId,
      executionId: parsed.executionId,
      reportId: parsed.reportId,
      path: snapshotPath,
      existsOnDisk: true,
      createdAt: parsed.createdAt ?? toIsoFromMs(stat.birthtimeMs || stat.mtimeMs || nowMs),
      lastTouchedAt: toIsoFromMs(stat.mtimeMs || nowMs),
      operation: parsed.operation,
      mode: parsed.mode,
      cleanupEligibility: linkedReportExists ? "retained" : "eligible",
      cleanupReason: linkedReportExists ? "cleanup_eligibility_unproven" : "eligible_by_orphan_target",
      snapshot: parsed,
    });
  }

  return artifacts;
}

async function readTempArtifacts(
  repoRoot: string,
  nowMs: number,
  knownReportIds: Set<string>,
): Promise<ListedArtifact[]> {
  const tempDir = resolveOperatorSafeTempDir(repoRoot);
  const entries = (await readDirEntriesSafe(tempDir)).sort((left, right) => left.localeCompare(right));

  const artifacts: ListedArtifact[] = [];
  for (const entry of entries) {
    const tempPath = path.join(tempDir, entry);
    const stat = await fs.stat(tempPath).catch(() => null);
    if (!stat) {
      artifacts.push({
        family: "temp_workspace",
        artifactId: entry,
        path: tempPath,
        existsOnDisk: false,
        cleanupEligibility: "unknown",
        cleanupReason: "already_removed",
      });
      continue;
    }

    const manifestPath = path.join(tempPath, "manifest.json");
    const manifestRaw = await fs.readFile(manifestPath, "utf8").catch(() => null);
    const manifest = manifestRaw ? parseJsonSafe<OperatorSafeTempWorkspaceManifest>(manifestRaw) : null;

    if (!manifest) {
      const metadataUntrusted = true;
      const linkedReportExists = false;
      const eligibility = classifyTempEligibility({
        nowMs,
        createdAt: undefined,
        staleAfterMs: undefined,
        linkedReportExists,
        metadataUntrusted,
      });

      artifacts.push({
        family: "temp_workspace",
        artifactId: entry,
        path: tempPath,
        existsOnDisk: true,
        createdAt: toIsoFromMs(stat.birthtimeMs || stat.mtimeMs || nowMs),
        lastTouchedAt: toIsoFromMs(stat.mtimeMs || nowMs),
        cleanupEligibility: eligibility.cleanupEligibility,
        cleanupReason: eligibility.cleanupReason,
        metadataUntrusted,
      });
      continue;
    }

    const linkedReportExists = typeof manifest.reportId === "string" && knownReportIds.has(manifest.reportId);
    const eligibility = classifyTempEligibility({
      nowMs,
      createdAt: manifest.createdAt,
      staleAfterMs: manifest.staleAfterMs,
      linkedReportExists,
      metadataUntrusted: false,
    });

    artifacts.push({
      family: "temp_workspace",
      artifactId: manifest.id || entry,
      executionId: manifest.executionId,
      reportId: manifest.reportId,
      path: tempPath,
      existsOnDisk: true,
      createdAt: manifest.createdAt,
      lastTouchedAt: manifest.lastTouchedAt ?? toIsoFromMs(stat.mtimeMs || nowMs),
      operation: manifest.operation,
      mode: manifest.mode,
      cleanupEligibility: eligibility.cleanupEligibility,
      cleanupReason: eligibility.cleanupReason,
      tempManifest: manifest,
    });
  }

  return artifacts;
}

async function collectArtifacts(input: {
  repoRoot: string;
  nowMs: number;
}): Promise<ListedArtifact[]> {
  const reports = await readReportArtifacts(input.repoRoot, input.nowMs);
  const reportIds = new Set(reports.map((item) => item.artifactId));
  const snapshots = await readSnapshotArtifacts(input.repoRoot, input.nowMs, reportIds);
  const temp = await readTempArtifacts(input.repoRoot, input.nowMs, reportIds);
  return [...reports, ...snapshots, ...temp];
}

function filterArtifactsByFamily(items: ListedArtifact[], family: OperatorSafeArtifactFamilySelector): ListedArtifact[] {
  if (family === "all") {
    return items;
  }
  return items.filter((item) => item.family === family);
}

function sortArtifactsForInventory(items: ListedArtifact[]): ListedArtifact[] {
  return [...items].sort((left, right) => {
    const leftTs = Date.parse(left.lastTouchedAt ?? left.createdAt ?? "1970-01-01T00:00:00.000Z");
    const rightTs = Date.parse(right.lastTouchedAt ?? right.createdAt ?? "1970-01-01T00:00:00.000Z");
    if (leftTs !== rightTs) {
      return rightTs - leftTs;
    }
    if (left.family !== right.family) {
      return left.family.localeCompare(right.family);
    }
    return left.artifactId.localeCompare(right.artifactId);
  });
}

async function removeArtifactPath(input: {
  repoRoot: string;
  item: ListedArtifact;
}): Promise<{ removed: boolean; reason?: OperatorSafeMaintenanceReasonCode; detail?: string }> {
  const rootsByFamily: Record<OperatorSafeArtifactFamily, string> = {
    report: resolveOperatorSafeReportsDir(input.repoRoot),
    snapshot: resolveOperatorSafeSnapshotsDir(input.repoRoot),
    temp_workspace: resolveOperatorSafeTempDir(input.repoRoot),
  };

  const familyRoot = rootsByFamily[input.item.family];
  if (!isPathWithin(familyRoot, input.item.path)) {
    return {
      removed: false,
      reason: "path_outside_operator_safe_root",
      detail: `Refused delete outside family root: ${input.item.path}`,
    };
  }

  const stat = await fs.stat(input.item.path).catch(() => null);
  if (!stat) {
    return {
      removed: false,
      reason: "already_removed",
      detail: "Artifact path was already removed.",
    };
  }

  await fs.rm(input.item.path, { recursive: true, force: true });
  return { removed: true };
}

function getInspectDetails(item: ListedArtifact, allArtifacts: ListedArtifact[]): OperatorSafeArtifactInspectDetails {
  if (item.family === "report") {
    return {
      family: "report",
      operation: item.report?.operation,
      mode: item.report?.mode,
      outcome: item.report?.outcome,
      failureClass: item.report?.failureClass,
      recommendedAction: item.report?.recommendedAction,
      warningCodes: item.report?.warningCodes ?? [],
      blockingCodes: item.report?.blockingCodes ?? [],
      linkedSnapshotId: item.report?.relatedArtifacts.snapshot?.artifactId ?? item.report?.snapshot?.manifest?.id,
      linkedTempWorkspaceId: item.report?.relatedArtifacts.tempWorkspace?.artifactId ?? item.report?.tempWorkspace?.id,
    };
  }

  if (item.family === "snapshot") {
    const linkedReportId = item.snapshot?.reportId ?? item.reportId;
    const orphaned = !linkedReportId || !allArtifacts.some((candidate) => candidate.family === "report" && candidate.artifactId === linkedReportId);
    return {
      family: "snapshot",
      operation: item.snapshot?.operation,
      mode: item.snapshot?.mode,
      repoRoot: item.snapshot?.repoRoot,
      targetPath: item.snapshot?.targetPath,
      workspaceRoot: item.snapshot?.workspaceRoot,
      workspaceRelativePath: item.snapshot?.workspaceRelativePath ?? item.snapshot?.targetRelativePath,
      repoRelativePath: item.snapshot?.repoRelativePath,
      warningCodes: item.snapshot?.metadata.warningCodes ?? [],
      idempotentSkip: item.snapshot?.metadata.idempotentSkip ?? false,
      linkedReportId,
      orphaned,
    };
  }

  const linkedReportId = item.tempManifest?.reportId ?? item.reportId;
  const orphaned = !linkedReportId || !allArtifacts.some((candidate) => candidate.family === "report" && candidate.artifactId === linkedReportId);
  const createdMs = Date.parse(item.tempManifest?.createdAt ?? item.createdAt ?? "");
  const staleAfterMs = item.tempManifest?.staleAfterMs;
  const nextEligibleCleanupAt = Number.isFinite(createdMs) && typeof staleAfterMs === "number"
    ? new Date(createdMs + staleAfterMs).toISOString()
    : undefined;

  return {
    family: "temp_workspace",
    operation: item.tempManifest?.operation,
    mode: item.tempManifest?.mode,
    tempPath: item.tempManifest?.tempPath ?? item.path,
    staleAfterMs,
    nextEligibleCleanupAt,
    linkedReportId,
    orphaned,
  };
}

export async function listOperatorSafeArtifacts(input: {
  repoRoot: string;
  family?: OperatorSafeArtifactFamilySelector;
  limit?: number;
  nowMs?: number;
}): Promise<OperatorWorktreeMaintenanceInventory> {
  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const selectedFamily = defaultFamilySelector(input.family);
  const nowMs = input.nowMs ?? Date.now();
  const allArtifacts = await collectArtifacts({ repoRoot: input.repoRoot, nowMs });
  const filtered = sortArtifactsForInventory(filterArtifactsByFamily(allArtifacts, selectedFamily));
  const limited = typeof input.limit === "number" && input.limit > 0 ? filtered.slice(0, input.limit) : filtered;

  const families = {
    report: limited.filter((item) => item.family === "report").map(buildInventoryRecord),
    snapshot: limited.filter((item) => item.family === "snapshot").map(buildInventoryRecord),
    temp_workspace: limited.filter((item) => item.family === "temp_workspace").map(buildInventoryRecord),
  };

  return {
    generatedAt: new Date(nowMs).toISOString(),
    selectedFamily,
    limit: input.limit,
    totalCount: limited.length,
    families,
  };
}

export async function inspectOperatorSafeArtifact(input: {
  repoRoot: string;
  family: OperatorSafeArtifactFamily;
  artifactId: string;
  nowMs?: number;
}): Promise<OperatorSafeArtifactInspectResult> {
  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const nowMs = input.nowMs ?? Date.now();
  const allArtifacts = await collectArtifacts({ repoRoot: input.repoRoot, nowMs });
  const target = allArtifacts.find((item) => item.family === input.family && item.artifactId === input.artifactId);

  if (!target) {
    return {
      family: input.family,
      artifactId: input.artifactId,
      found: false,
      reason: "artifact_not_found",
      warnings: [
        {
          reason: "artifact_not_found",
          message: `No ${input.family} artifact with id '${input.artifactId}' was found under operator-safe roots.`,
        },
      ],
    };
  }

  const warnings: OperatorSafeArtifactInspectResult["warnings"] = [];
  if (target.metadataUntrusted) {
    warnings.push({
      reason: "metadata_unreadable_or_untrusted",
      message: "Artifact metadata is unreadable or untrusted; inspect output is partial.",
    });
  }

  if (target.cleanupReason === "cleanup_eligibility_unproven") {
    warnings.push({
      reason: "cleanup_eligibility_unproven",
      message: "Cleanup eligibility is unproven from artifact truth; retained by default.",
    });
  }

  if (target.cleanupReason === "already_removed") {
    warnings.push({
      reason: "already_removed",
      message: "Artifact metadata exists in inventory but path is already removed.",
    });
  }

  return {
    family: input.family,
    artifactId: input.artifactId,
    found: true,
    record: buildInventoryRecord(target),
    details: getInspectDetails(target, allArtifacts),
    warnings,
  };
}

export async function pruneOperatorSafeArtifacts(input: {
  repoRoot: string;
  request: OperatorSafePruneRequest;
}): Promise<OperatorSafeMaintenanceActionResult> {
  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const nowMs = input.request.nowMs ?? Date.now();
  const requestedFamily = defaultFamilySelector(input.request.family);
  const retention = {
    ...DEFAULT_RETENTION_MS,
    ...(input.request.retentionOverridesMs ?? {}),
  };

  const artifacts = filterArtifactsByFamily(await collectArtifacts({ repoRoot: input.repoRoot, nowMs }), requestedFamily);
  const evaluated: OperatorSafeMaintenanceActionItem[] = [];
  const planned: OperatorSafeMaintenanceActionItem[] = [];
  const removed: OperatorSafeMaintenanceActionItem[] = [];
  const retained: OperatorSafeMaintenanceActionItem[] = [];
  const skipped: OperatorSafeMaintenanceActionItem[] = [];
  const warnings: OperatorSafeMaintenanceActionResult["warnings"] = [];

  for (const item of artifacts) {
    if (!item.existsOnDisk) {
      const actionItem = toActionItem(item, "already_removed", "Artifact path not present on disk.");
      evaluated.push(actionItem);
      skipped.push(actionItem);
      continue;
    }

    const touchedAt = Date.parse(item.lastTouchedAt ?? item.createdAt ?? "");
    if (!Number.isFinite(touchedAt)) {
      const actionItem = toActionItem(item, "metadata_unreadable_or_untrusted", "Unable to parse recency for policy prune.");
      evaluated.push(actionItem);
      retained.push(actionItem);
      warnings.push({
        family: item.family,
        artifactId: item.artifactId,
        reason: "metadata_unreadable_or_untrusted",
        message: "Artifact retained because recency metadata is unreadable or untrusted.",
      });
      continue;
    }

    const ageMs = nowMs - touchedAt;
    if (ageMs <= retention[item.family]) {
      const actionItem = toActionItem(item, "artifact_too_recent_for_policy_prune", `Artifact age ${ageMs}ms is within retention ${retention[item.family]}ms.`);
      evaluated.push(actionItem);
      retained.push(actionItem);
      continue;
    }

    const eligibleReason = pruneEligibleReason(item);
    const actionItem = toActionItem(item, eligibleReason, `Artifact age ${ageMs}ms exceeded retention ${retention[item.family]}ms.`);
    evaluated.push(actionItem);
    planned.push(actionItem);

    if (input.request.mode === "dry_run") {
      continue;
    }

    const deleteResult = await removeArtifactPath({
      repoRoot: input.repoRoot,
      item,
    });
    if (deleteResult.removed) {
      removed.push(actionItem);
    } else {
      const reason = deleteResult.reason ?? "cleanup_eligibility_unproven";
      const failedAction = toActionItem(item, reason, deleteResult.detail);
      skipped.push(failedAction);
      warnings.push({
        family: item.family,
        artifactId: item.artifactId,
        reason,
        message: deleteResult.detail ?? "Delete skipped by bounded policy.",
      });
    }
  }

  return {
    action: "prune",
    mode: input.request.mode,
    requestedFamily,
    evaluated,
    planned,
    removed,
    retained,
    skipped,
    warnings,
  };
}

export async function cleanupOperatorSafeArtifacts(input: {
  repoRoot: string;
  request: OperatorSafeCleanupRequest;
}): Promise<OperatorSafeMaintenanceActionResult> {
  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const nowMs = input.request.nowMs ?? Date.now();
  const requestedFamily: OperatorSafeArtifactFamilySelector = input.request.reportId
    ? "all"
    : defaultFamilySelector(input.request.family);

  const artifacts = await collectArtifacts({ repoRoot: input.repoRoot, nowMs });
  const evaluated: OperatorSafeMaintenanceActionItem[] = [];
  const planned: OperatorSafeMaintenanceActionItem[] = [];
  const removed: OperatorSafeMaintenanceActionItem[] = [];
  const retained: OperatorSafeMaintenanceActionItem[] = [];
  const skipped: OperatorSafeMaintenanceActionItem[] = [];
  const warnings: OperatorSafeMaintenanceActionResult["warnings"] = [];

  if (!input.request.reportId && (!input.request.family || !input.request.artifactId)) {
    return {
      action: "cleanup",
      mode: input.request.mode,
      requestedFamily,
      evaluated,
      planned,
      removed,
      retained,
      skipped: [
        {
          family: "report",
          artifactId: "(none)",
          path: resolveOperatorSafeArtifactsRoot(input.repoRoot),
          reason: "cleanup_requires_report_or_family_target",
          detail: "Cleanup requires --report <id> or --family <snapshot|temp_workspace> --id <artifact-id>.",
        },
      ],
      warnings: [
        {
          family: "report",
          artifactId: "(none)",
          reason: "cleanup_requires_report_or_family_target",
          message: "Cleanup requires explicit report or artifact target.",
        },
      ],
    };
  }

  let targets: ListedArtifact[] = [];

  if (input.request.reportId) {
    const report = artifacts.find((item) => item.family === "report" && item.artifactId === input.request.reportId);
    if (!report) {
      const actionItem: OperatorSafeMaintenanceActionItem = {
        family: "report",
        artifactId: input.request.reportId,
        path: resolveArtifactPath(input.repoRoot, "report", input.request.reportId),
        reason: "artifact_not_found",
        detail: "Report target not found for cleanup.",
      };
      return {
        action: "cleanup",
        mode: input.request.mode,
        requestedFamily,
        evaluated: [actionItem],
        planned: [],
        removed: [],
        retained: [],
        skipped: [actionItem],
        warnings: [
          {
            family: "report",
            artifactId: input.request.reportId,
            reason: "artifact_not_found",
            message: "Cleanup report target was not found.",
          },
        ],
      };
    }

    const reportEligible = report.report ? getReportCleanupEligible(report.report) : false;
    if (!reportEligible) {
      const retainedItem = toActionItem(report, "report_outcome_not_cleanup_eligible", "Cleanup refused because report outcome is not degraded/failed/blocked.");
      return {
        action: "cleanup",
        mode: input.request.mode,
        requestedFamily,
        evaluated: [retainedItem],
        planned: [],
        removed: [],
        retained: [retainedItem],
        skipped: [],
        warnings: [
          {
            family: "report",
            artifactId: report.artifactId,
            reason: "cleanup_eligibility_unproven",
            message: "Cleanup refused for recent successful/advisory report.",
          },
        ],
      };
    }

    targets = artifacts.filter((item) => item.artifactId === report.artifactId || item.reportId === report.artifactId);
  } else if (input.request.family && input.request.artifactId) {
    if (input.request.family !== "snapshot" && input.request.family !== "temp_workspace") {
      const unsupportedItem: OperatorSafeMaintenanceActionItem = {
        family: "report",
        artifactId: input.request.artifactId,
        path: resolveOperatorSafeArtifactsRoot(input.repoRoot),
        reason: "target_family_not_cleanup_supported",
        detail: "Targeted cleanup supports snapshot or temp_workspace only.",
      };
      return {
        action: "cleanup",
        mode: input.request.mode,
        requestedFamily,
        evaluated: [unsupportedItem],
        planned: [],
        removed: [],
        retained: [],
        skipped: [unsupportedItem],
        warnings: [
          {
            family: "report",
            artifactId: input.request.artifactId,
            reason: "target_family_not_cleanup_supported",
            message: "Targeted cleanup family is unsupported.",
          },
        ],
      };
    }

    const target = artifacts.find((item) => item.family === input.request.family && item.artifactId === input.request.artifactId);
    if (!target) {
      const missingItem: OperatorSafeMaintenanceActionItem = {
        family: input.request.family,
        artifactId: input.request.artifactId,
        path: resolveArtifactPath(input.repoRoot, input.request.family, input.request.artifactId),
        reason: "artifact_not_found",
        detail: "Cleanup target artifact not found.",
      };
      return {
        action: "cleanup",
        mode: input.request.mode,
        requestedFamily,
        evaluated: [missingItem],
        planned: [],
        removed: [],
        retained: [],
        skipped: [missingItem],
        warnings: [
          {
            family: input.request.family,
            artifactId: input.request.artifactId,
            reason: "artifact_not_found",
            message: "Targeted cleanup artifact was not found.",
          },
        ],
      };
    }

    targets = [target];
  }

  for (const item of targets) {
    const evaluatedItem = toActionItem(item, item.cleanupReason ?? "cleanup_eligibility_unproven");
    evaluated.push(evaluatedItem);

    const eligible = item.cleanupEligibility === "eligible"
      || (input.request.reportId ? item.family !== "report" || (item.report ? getReportCleanupEligible(item.report) : false) : false)
      || item.cleanupReason === "eligible_by_orphan_target"
      || item.cleanupReason === "eligible_by_temp_staleness"
      || item.cleanupReason === "eligible_by_degraded_report";

    if (!eligible) {
      const retainedItem = toActionItem(item, "cleanup_eligibility_unproven", "Cleanup target retained because eligibility could not be proven from artifact truth.");
      retained.push(retainedItem);
      continue;
    }

    const planReason = item.cleanupReason ?? "eligible_by_orphan_target";
    const plannedItem = toActionItem(item, planReason, "Targeted cleanup eligible by bounded policy.");
    planned.push(plannedItem);

    if (input.request.mode === "dry_run") {
      continue;
    }

    const deleteResult = await removeArtifactPath({
      repoRoot: input.repoRoot,
      item,
    });
    if (deleteResult.removed) {
      removed.push(plannedItem);
    } else {
      const reason = deleteResult.reason ?? "cleanup_eligibility_unproven";
      const skippedItem = toActionItem(item, reason, deleteResult.detail);
      skipped.push(skippedItem);
      warnings.push({
        family: item.family,
        artifactId: item.artifactId,
        reason,
        message: deleteResult.detail ?? "Delete skipped during cleanup.",
      });
    }
  }

  return {
    action: "cleanup",
    mode: input.request.mode,
    requestedFamily,
    evaluated,
    planned,
    removed,
    retained,
    skipped,
    warnings,
  };
}

export function resolveOperatorSafePruneRetentionPolicyMs(): Record<OperatorSafeArtifactFamily, number> {
  return {
    ...DEFAULT_RETENTION_MS,
  };
}

export function resolveOperatorSafeMaintenanceFamily(value: string | undefined): OperatorSafeArtifactFamilySelector | null {
  if (!value) {
    return "all";
  }
  if (value === "all" || value === "report" || value === "snapshot" || value === "temp_workspace") {
    return value;
  }
  if (value === "temp") {
    return "temp_workspace";
  }
  return null;
}

export function resolveOperatorSafeMaintenanceMode(value: string | undefined): OperatorSafeMaintenanceMode | null {
  if (value === "dry-run" || value === "dry_run") {
    return "dry_run";
  }
  if (value === "apply") {
    return "apply";
  }
  return null;
}
