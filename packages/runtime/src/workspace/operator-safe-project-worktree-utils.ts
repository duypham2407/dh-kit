import fs from "node:fs";
import {
  canonicalizeAbsolutePath,
  normalizePathSlashes,
  isPathWithinWorkspace,
  toWorkspaceRelativePath,
} from "../../../intelligence/src/workspace/scan-paths.js";
import { detectProjects } from "../../../intelligence/src/workspace/detect-projects.js";
import type {
  OperatorWorktreePreflightInput,
  OperatorWorktreePreflightResult,
  OperatorWorktreeRecommendation,
} from "../../../shared/src/types/operator-worktree.js";

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
  if (input.idempotentSkip) {
    return "run_full_index";
  }
  if (input.hasMissingMarkerWarning) {
    return "add_workspace_marker";
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

function normalizeWorkspaceRoots(workspaces: NonNullable<OperatorWorktreePreflightInput["knownWorkspaces"]>) {
  return workspaces.map((workspace) => ({
    ...workspace,
    root: canonicalizeAbsolutePath(workspace.root),
  }));
}

export async function evaluateOperatorSafeProjectWorktree(input: OperatorWorktreePreflightInput): Promise<OperatorWorktreePreflightResult> {
  const canonicalRepoRoot = canonicalizeAbsolutePath(input.repoRoot);
  const canonicalTargetPath = canonicalizeAbsolutePath(input.targetPath);
  const warnings: OperatorWorktreePreflightResult["warnings"] = [];
  const blockingReasons: OperatorWorktreePreflightResult["blockingReasons"] = [];

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
