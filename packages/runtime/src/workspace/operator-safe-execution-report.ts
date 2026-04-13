import fs from "node:fs/promises";
import path from "node:path";
import type {
  OperatorWorktreeExecutionReport,
  OperatorWorktreeExecutionOutcome,
  OperatorWorktreeFailureClass,
  OperatorWorktreeRecommendation,
  OperatorWorktreeStageResult,
} from "../../../shared/src/types/operator-worktree.js";

const OPERATOR_SAFE_RUNTIME_ROOT = [".dh", "runtime", "operator-safe-worktree"];

function makeArtifactId(): string {
  return `opw-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function resolveOperatorSafeArtifactsRoot(repoRoot: string): string {
  return path.join(repoRoot, ...OPERATOR_SAFE_RUNTIME_ROOT);
}

export function resolveOperatorSafeReportsDir(repoRoot: string): string {
  return path.join(resolveOperatorSafeArtifactsRoot(repoRoot), "reports");
}

export function resolveOperatorSafeSnapshotsDir(repoRoot: string): string {
  return path.join(resolveOperatorSafeArtifactsRoot(repoRoot), "snapshots");
}

export function resolveOperatorSafeTempDir(repoRoot: string): string {
  return path.join(resolveOperatorSafeArtifactsRoot(repoRoot), "temp");
}

export async function ensureOperatorSafeArtifactDirs(repoRoot: string): Promise<void> {
  await Promise.all([
    fs.mkdir(resolveOperatorSafeReportsDir(repoRoot), { recursive: true }),
    fs.mkdir(resolveOperatorSafeSnapshotsDir(repoRoot), { recursive: true }),
    fs.mkdir(resolveOperatorSafeTempDir(repoRoot), { recursive: true }),
  ]);
}

export function buildOperatorSafeExecutionReport(input: {
  operation: OperatorWorktreeExecutionReport["operation"];
  mode: OperatorWorktreeExecutionReport["mode"];
  riskClass: OperatorWorktreeExecutionReport["riskClass"];
  outcome: OperatorWorktreeExecutionOutcome;
  failureClass: OperatorWorktreeFailureClass;
  recommendedAction: OperatorWorktreeRecommendation;
  allowed: boolean;
  warningCodes: OperatorWorktreeExecutionReport["warningCodes"];
  blockingCodes: OperatorWorktreeExecutionReport["blockingCodes"];
  stages: OperatorWorktreeStageResult[];
  context: OperatorWorktreeExecutionReport["context"];
  snapshot?: OperatorWorktreeExecutionReport["snapshot"];
  tempWorkspace?: OperatorWorktreeExecutionReport["tempWorkspace"];
  apply?: OperatorWorktreeExecutionReport["apply"];
  rollback?: OperatorWorktreeExecutionReport["rollback"];
  notes?: string[];
  id?: string;
  createdAt?: string;
}): OperatorWorktreeExecutionReport {
  return {
    id: input.id ?? makeArtifactId(),
    createdAt: input.createdAt ?? new Date().toISOString(),
    operation: input.operation,
    mode: input.mode,
    riskClass: input.riskClass,
    outcome: input.outcome,
    failureClass: input.failureClass,
    recommendedAction: input.recommendedAction,
    allowed: input.allowed,
    warningCodes: input.warningCodes,
    blockingCodes: input.blockingCodes,
    stages: input.stages,
    context: input.context,
    snapshot: input.snapshot,
    tempWorkspace: input.tempWorkspace,
    apply: input.apply,
    rollback: input.rollback,
    notes: input.notes ?? [],
  };
}

export async function writeOperatorSafeExecutionReport(repoRoot: string, report: OperatorWorktreeExecutionReport): Promise<string> {
  await ensureOperatorSafeArtifactDirs(repoRoot);
  const reportPath = path.join(resolveOperatorSafeReportsDir(repoRoot), `${report.id}.json`);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return reportPath;
}
