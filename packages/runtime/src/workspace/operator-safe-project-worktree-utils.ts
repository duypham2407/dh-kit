import fs from "node:fs";
import {
  canonicalizeAbsolutePath,
  normalizePathSlashes,
  isPathWithinWorkspace,
  toWorkspaceRelativePath,
} from "../../../intelligence/src/workspace/scan-paths.js";
import { detectProjects } from "../../../intelligence/src/workspace/detect-projects.js";
import { SUPPORTED_OPERATOR_WORKTREE_OPERATIONS } from "../../../shared/src/types/operator-worktree.js";
import type {
  OperatorWorktreeExecutionReport,
  OperatorWorktreeFailureClass,
  OperatorWorktreeExecutionOutcome,
  OperatorWorktreePreflightInput,
  OperatorWorktreePreflightResult,
  OperatorWorktreeRecommendation,
  OperatorWorktreeRiskClass,
  OperatorWorktreeStageResult,
} from "../../../shared/src/types/operator-worktree.js";
import { captureOperatorSafeSnapshot } from "./operator-safe-project-worktree-snapshot.js";
import { prepareOperatorSafeTempWorkspace } from "./operator-safe-temp-workspace.js";
import { runOperatorSafeBoundedApply } from "./operator-safe-bounded-apply.js";
import { attemptOperatorSafeRollbackLight } from "./operator-safe-project-worktree-rollback-light.js";
import {
  buildOperatorSafeExecutionReport,
  writeOperatorSafeExecutionReport,
} from "./operator-safe-execution-report.js";

function findWorkspaceForTarget(input: {
  workspaceRoots: string[];
  targetPath: string;
}): string | null {
  const matches = input.workspaceRoots
    .filter((root) => isPathWithinWorkspace(root, input.targetPath))
    .sort((left, right) => right.length - left.length);
  return matches[0] ?? null;
}

function resolveRecommendation(input: {
  mode: OperatorWorktreePreflightInput["mode"];
  hasBlockingReasons: boolean;
  idempotentSkip: boolean;
  hasPartialWarning: boolean;
  hasMissingMarkerWarning: boolean;
}): OperatorWorktreeRecommendation {
  if (input.hasMissingMarkerWarning) {
    return "add_workspace_marker";
  }
  if (input.idempotentSkip) {
    return "run_full_index";
  }
  if (input.hasBlockingReasons) {
    return "adjust_target";
  }
  if (input.mode === "execute" && input.hasPartialWarning) {
    return "run_dry_run";
  }
  if (input.mode === "check") {
    return "run_dry_run";
  }
  return "proceed";
}

function resolveRiskClass(input: {
  mode: OperatorWorktreePreflightInput["mode"];
  warningsCount: number;
}): OperatorWorktreeRiskClass {
  if (input.mode === "execute") {
    return "high";
  }
  if (input.warningsCount > 0) {
    return "moderate";
  }
  return "low";
}

function resolveOutcome(input: {
  mode: OperatorWorktreePreflightInput["mode"];
  preflightAllowed: boolean;
  applyDelegated: boolean;
  applyFailed: boolean;
  rollbackDegraded: boolean;
}): OperatorWorktreeExecutionOutcome {
  if (!input.preflightAllowed) {
    return "blocked";
  }
  if (input.applyFailed) {
    return "failed";
  }
  if (input.rollbackDegraded) {
    return "rollback_degraded";
  }
  if (input.mode === "check") {
    return "advisory";
  }
  if (input.mode === "dry_run") {
    return "dry_run";
  }
  return input.applyDelegated ? "succeeded" : "failed";
}

function resolveFailureClass(input: {
  preflightAllowed: boolean;
  applyFailed: boolean;
  rollbackDegraded: boolean;
  applyDelegated: boolean;
}): OperatorWorktreeFailureClass {
  if (!input.preflightAllowed) {
    return "preflight_failure";
  }
  if (input.applyFailed) {
    return "apply_failure";
  }
  if (input.rollbackDegraded) {
    return "rollback_degraded";
  }
  if (!input.applyDelegated) {
    return "apply_failure";
  }
  return "none";
}

function normalizeWorkspaceRoots(workspaces: NonNullable<OperatorWorktreePreflightInput["knownWorkspaces"]>) {
  return workspaces.map((workspace) => ({
    ...workspace,
    root: canonicalizeAbsolutePath(workspace.root),
  }));
}

function isSupportedOperation(operation: string): operation is OperatorWorktreePreflightInput["operation"] {
  return (SUPPORTED_OPERATOR_WORKTREE_OPERATIONS as readonly string[]).includes(operation);
}

export async function evaluateOperatorSafeProjectWorktree(input: OperatorWorktreePreflightInput): Promise<OperatorWorktreePreflightResult> {
  const canonicalRepoRoot = canonicalizeAbsolutePath(input.repoRoot);
  const canonicalTargetPath = canonicalizeAbsolutePath(input.targetPath);
  const warnings: OperatorWorktreePreflightResult["warnings"] = [];
  const blockingReasons: OperatorWorktreePreflightResult["blockingReasons"] = [];

  if (!isSupportedOperation(input.operation)) {
    blockingReasons.push({
      code: "operation_not_supported",
      message: `Operation '${String(input.operation)}' is not supported by the bounded operator-safe layer.`,
    });
  }

  if (!input.targetPath.trim()) {
    blockingReasons.push({
      code: "empty_target_path",
      message: "Target path is empty.",
    });
  }

  if (!fs.existsSync(canonicalRepoRoot)) {
    blockingReasons.push({
      code: "invalid_repo_root",
      message: "Repository root does not exist.",
    });
  }

  if (!isPathWithinWorkspace(canonicalRepoRoot, canonicalTargetPath)) {
    blockingReasons.push({
      code: "target_outside_repo",
      message: "Target path is outside the repository boundary.",
    });
  }

  const knownWorkspaces = input.knownWorkspaces ? normalizeWorkspaceRoots(input.knownWorkspaces) : undefined;
  const projects = blockingReasons.length > 0
    ? []
    : (knownWorkspaces ?? await detectProjects(canonicalRepoRoot));
  const workspaceRoot = findWorkspaceForTarget({
    workspaceRoots: projects.map((workspace) => workspace.root),
    targetPath: canonicalTargetPath,
  });
  const workspace = workspaceRoot ? projects.find((item) => item.root === workspaceRoot) : undefined;

  if (!workspace) {
    blockingReasons.push({
      code: "workspace_not_detected",
      message: "No detected workspace contains the target path.",
    });
  }

  if (workspace && workspace.markers && !workspace.markers.hasGoMod && !workspace.markers.hasPackageJson) {
    warnings.push({
      code: "workspace_missing_markers",
      message: "Workspace has no recognized marker file (package.json or go.mod); safety checks run in bounded mode.",
    });
  }

  if (workspace?.scanMeta?.partial === true) {
    warnings.push({
      code: "partial_workspace_scan",
      message: `Workspace scan is partial (stop reason: ${workspace.diagnostics?.stopReason ?? "unknown"}).`,
    });
  }

  const gitDir = `${canonicalRepoRoot}/.git`;
  if (input.requireVcs && !fs.existsSync(gitDir)) {
    blockingReasons.push({
      code: "vcs_required_but_missing",
      message: "VCS (git) is required for this operation but .git was not found.",
    });
  }
  if (!input.requireVcs && !fs.existsSync(gitDir)) {
    warnings.push({
      code: "vcs_unverified",
      message: "Git metadata is not present; continuing with bounded workspace checks only.",
    });
  }

  if (input.mode === "execute") {
    warnings.push({
      code: "execute_is_bounded",
      message: "Execute mode is bounded to utility-safe checks and does not perform full worktree lifecycle actions.",
    });
  }

  const targetRelativePath = workspaceRoot ? toWorkspaceRelativePath(workspaceRoot, canonicalTargetPath) : null;
  const targetWorkspaceFile = targetRelativePath ? (workspace?.files ?? []).find((file) => file.path === targetRelativePath) : undefined;
  const alreadyIndexed = targetWorkspaceFile
    ? new Set(input.alreadyIndexedFileIds ?? []).has(targetWorkspaceFile.id)
    : false;

  if (alreadyIndexed) {
    blockingReasons.push({
      code: "already_indexed",
      message: "Target workspace file is already indexed in this run.",
    });
  }

  const recommendation = resolveRecommendation({
    mode: input.mode,
    hasBlockingReasons: blockingReasons.length > 0,
    idempotentSkip: alreadyIndexed,
    hasPartialWarning: warnings.some((warning) => warning.code === "partial_workspace_scan"),
    hasMissingMarkerWarning: warnings.some((warning) => warning.code === "workspace_missing_markers"),
  });

  const canonicalTargetNormalized = normalizePathSlashes(input.targetPath);

  return {
    mode: input.mode,
    operation: input.operation,
    allowed: blockingReasons.length === 0,
    warnings,
    blockingReasons,
    recommendedAction: recommendation,
    context: {
      repoRoot: input.repoRoot,
      targetPath: canonicalTargetNormalized,
      canonicalRepoRoot,
      canonicalTargetPath,
      workspace: workspace
        ? {
          root: workspace.root,
          type: workspace.type,
          markers: workspace.markers,
          partialScan: workspace.scanMeta?.partial === true,
          scanStopReason: workspace.diagnostics?.stopReason ?? "none",
          targetRelativePath,
        }
        : undefined,
      idempotentSkip: alreadyIndexed,
    },
  };
}

export async function runOperatorSafeProjectWorktreeLifecycle(input: OperatorWorktreePreflightInput): Promise<{
  preflight: OperatorWorktreePreflightResult;
  report: OperatorWorktreeExecutionReport;
  reportPath: string;
}> {
  const preflight = await evaluateOperatorSafeProjectWorktree(input);
  const stages: OperatorWorktreeStageResult[] = [
    {
      stage: "preflight",
      success: preflight.allowed,
      details: preflight.allowed
        ? "Preflight checks passed for bounded operator-safe execution."
        : `Preflight blocked execution with ${preflight.blockingReasons.length} blocking reason(s).`,
    },
  ];

  const snapshot = await captureOperatorSafeSnapshot({
    repoRoot: preflight.context.canonicalRepoRoot,
    preflight,
  });
  stages.push({
    stage: "prepare",
    success: preflight.allowed ? snapshot.captured || !snapshot.required : false,
    details: snapshot.required
      ? (snapshot.captured
        ? "Snapshot metadata captured."
        : "Snapshot was required but not captured.")
      : "Snapshot not required for this mode.",
  });

  const tempWorkspace = await prepareOperatorSafeTempWorkspace({
    repoRoot: preflight.context.canonicalRepoRoot,
    operation: preflight.operation,
    mode: preflight.mode,
  });

  const apply = await runOperatorSafeBoundedApply({ preflight });
  stages.push({
    stage: "apply",
    success: preflight.allowed ? (apply.simulated || apply.delegated || apply.applied) : false,
    details: apply.message,
  });

  const rollback = await attemptOperatorSafeRollbackLight({
    mode: preflight.mode,
    snapshot,
    apply,
  });
  stages.push({
    stage: "rollback",
    success: !rollback.degraded,
    details: rollback.message,
  });

  stages.push({
    stage: "cleanup",
    success: true,
    details: tempWorkspace.created
      ? "Temp workspace lifecycle recorded; cleanup controlled by maintenance utilities."
      : "No temp workspace provisioned for advisory mode.",
  });

  const outcome = resolveOutcome({
    mode: preflight.mode,
    preflightAllowed: preflight.allowed,
    applyDelegated: apply.delegated || apply.applied || apply.simulated,
    applyFailed: preflight.allowed && !apply.delegated && !apply.applied && !apply.simulated,
    rollbackDegraded: rollback.degraded,
  });
  const failureClass = resolveFailureClass({
    preflightAllowed: preflight.allowed,
    applyFailed: preflight.allowed && !apply.delegated && !apply.applied && !apply.simulated,
    rollbackDegraded: rollback.degraded,
    applyDelegated: apply.delegated || apply.applied || apply.simulated,
  });

  const report = buildOperatorSafeExecutionReport({
    operation: preflight.operation,
    mode: preflight.mode,
    riskClass: resolveRiskClass({
      mode: preflight.mode,
      warningsCount: preflight.warnings.length,
    }),
    outcome,
    failureClass,
    recommendedAction: preflight.recommendedAction,
    allowed: preflight.allowed,
    warningCodes: preflight.warnings.map((warning) => warning.code),
    blockingCodes: preflight.blockingReasons.map((reason) => reason.code),
    stages,
    context: {
      repoRoot: preflight.context.canonicalRepoRoot,
      targetPath: preflight.context.canonicalTargetPath,
      workspaceRoot: preflight.context.workspace?.root,
    },
    snapshot,
    tempWorkspace,
    apply,
    rollback,
    notes: [
      "Bounded operator-safe lifecycle executed.",
      "Execution apply remains delegated to operation-specific runner for execute mode.",
      ...(rollback.unavailable
        ? ["Rollback-light is unavailable for this flow; this is distinct from rollback-degraded execution."]
        : []),
    ],
  });

  const reportPath = await writeOperatorSafeExecutionReport(preflight.context.canonicalRepoRoot, report);

  return {
    preflight,
    report,
    reportPath,
  };
}
