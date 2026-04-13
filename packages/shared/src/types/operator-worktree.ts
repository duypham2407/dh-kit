import type { IndexedWorkspace, WorkspaceMarkers } from "./indexing.js";

export type OperatorWorktreeMode = "check" | "dry_run" | "execute";

export type OperatorWorktreeReasonCode =
  | "empty_target_path"
  | "target_outside_repo"
  | "invalid_repo_root"
  | "workspace_not_detected"
  | "vcs_required_but_missing"
  | "already_indexed"
  | "operation_not_supported";

export type OperatorWorktreeWarningCode =
  | "workspace_missing_markers"
  | "partial_workspace_scan"
  | "vcs_unverified"
  | "execute_is_bounded";

export type OperatorWorktreeOperation = "index_workspace";

export type OperatorWorktreePreflightInput = {
  mode: OperatorWorktreeMode;
  operation: OperatorWorktreeOperation;
  repoRoot: string;
  targetPath: string;
  requireVcs?: boolean;
  alreadyIndexedFileIds?: string[];
  knownWorkspaces?: IndexedWorkspace[];
};

export type OperatorWorktreePreflightWarning = {
  code: OperatorWorktreeWarningCode;
  message: string;
};

export type OperatorWorktreePreflightBlock = {
  code: OperatorWorktreeReasonCode;
  message: string;
};

export type OperatorWorktreeRecommendation =
  | "proceed"
  | "run_check"
  | "run_dry_run"
  | "adjust_target"
  | "add_workspace_marker"
  | "run_full_index"
  | "disable_vcs_requirement";

export type OperatorWorktreeWorkspaceContext = {
  root: string;
  type: string;
  markers?: WorkspaceMarkers;
  partialScan: boolean;
  scanStopReason: string;
  targetRelativePath: string | null;
};

export type OperatorWorktreePreflightResult = {
  mode: OperatorWorktreeMode;
  operation: OperatorWorktreeOperation;
  allowed: boolean;
  warnings: OperatorWorktreePreflightWarning[];
  blockingReasons: OperatorWorktreePreflightBlock[];
  recommendedAction: OperatorWorktreeRecommendation;
  context: {
    repoRoot: string;
    targetPath: string;
    canonicalRepoRoot: string;
    canonicalTargetPath: string;
    workspace?: OperatorWorktreeWorkspaceContext;
    idempotentSkip: boolean;
  };
};
