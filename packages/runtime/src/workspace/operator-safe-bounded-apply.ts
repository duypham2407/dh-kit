import type {
  OperatorWorktreeBoundedApplyResult,
  OperatorWorktreePreflightResult,
} from "../../../shared/src/types/operator-worktree.js";

export async function runOperatorSafeBoundedApply(input: {
  preflight: OperatorWorktreePreflightResult;
}): Promise<OperatorWorktreeBoundedApplyResult> {
  if (!input.preflight.allowed) {
    return {
      applied: false,
      simulated: false,
      delegated: false,
      changedSurfaces: [],
      metadata: {
        blocked: true,
        blockingCount: input.preflight.blockingReasons.length,
      },
      message: "Apply stage skipped because preflight blocked execution.",
    };
  }

  if (input.preflight.mode === "check") {
    return {
      applied: false,
      simulated: false,
      delegated: false,
      changedSurfaces: [],
      metadata: {
        advisoryOnly: true,
      },
      message: "Check mode is advisory-only; no apply action executed.",
    };
  }

  if (input.preflight.mode === "dry_run") {
    return {
      applied: false,
      simulated: true,
      delegated: false,
      changedSurfaces: [],
      metadata: {
        parityMode: "dry_run",
      },
      message: "Dry-run apply completed with bounded simulation only.",
    };
  }

  return {
    applied: false,
    simulated: false,
    delegated: true,
    changedSurfaces: input.preflight.context.workspace?.targetRelativePath
      ? [input.preflight.context.workspace.targetRelativePath]
      : [],
    metadata: {
      parityMode: "execute",
      delegatedToOperation: input.preflight.operation,
    },
    message: "Execute mode passed bounded checks; side effects remain delegated to operation-specific runner.",
  };
}
