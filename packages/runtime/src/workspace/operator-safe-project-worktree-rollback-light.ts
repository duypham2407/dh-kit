import type {
  OperatorWorktreeBoundedApplyResult,
  OperatorWorktreeMode,
  OperatorWorktreeRollbackLightResult,
  OperatorWorktreeSnapshotResult,
} from "../../../shared/src/types/operator-worktree.js";

export async function attemptOperatorSafeRollbackLight(input: {
  mode: OperatorWorktreeMode;
  snapshot?: OperatorWorktreeSnapshotResult;
  apply?: OperatorWorktreeBoundedApplyResult;
}): Promise<OperatorWorktreeRollbackLightResult> {
  if (input.mode === "check") {
    return {
      attempted: false,
      recovered: false,
      degraded: false,
      unavailable: true,
      message: "Rollback-light is not applicable in check mode.",
    };
  }

  if (!input.snapshot?.required || !input.snapshot.captured) {
    return {
      attempted: false,
      recovered: false,
      degraded: false,
      unavailable: true,
      message: "Rollback-light unavailable because no compatible snapshot artifact was captured.",
    };
  }

  if (!input.apply || (!input.apply.applied && !input.apply.delegated)) {
    return {
      attempted: false,
      recovered: true,
      degraded: false,
      unavailable: false,
      message: "No apply side effects detected; rollback-light not required.",
    };
  }

  if (input.apply.delegated && !input.apply.applied) {
    return {
      attempted: false,
      recovered: false,
      degraded: false,
      unavailable: true,
      message: "Rollback-light unavailable for delegated execute apply in this bounded layer.",
    };
  }

  return {
    attempted: true,
    recovered: false,
    degraded: true,
    unavailable: false,
    message: "Rollback-light currently records degraded state only; explicit reverse apply is not implemented yet.",
  };
}
