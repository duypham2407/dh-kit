import type { IndexedWorkspace, WorkspaceMarkers } from "./indexing.js";

export type OperatorWorktreeMode = "check" | "dry_run" | "execute";

export const SUPPORTED_OPERATOR_WORKTREE_OPERATIONS = ["index_workspace"] as const;

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

export type OperatorWorktreeOperation = (typeof SUPPORTED_OPERATOR_WORKTREE_OPERATIONS)[number];

export type OperatorWorktreeRiskClass = "low" | "moderate" | "high";

export type OperatorWorktreeFailureClass =
  | "none"
  | "preflight_failure"
  | "prepare_failure"
  | "apply_failure"
  | "cleanup_failure"
  | "rollback_degraded";

export type OperatorWorktreeExecutionOutcome =
  | "blocked"
  | "advisory"
  | "dry_run"
  | "succeeded"
  | "failed"
  | "cleanup_failed"
  | "rollback_degraded";

export type OperatorWorktreeExecutionStage =
  | "preflight"
  | "prepare"
  | "apply"
  | "cleanup"
  | "rollback";

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

export type OperatorWorktreeSnapshotManifest = {
  id: string;
  createdAt: string;
  operation: OperatorWorktreeOperation;
  mode: OperatorWorktreeMode;
  repoRoot: string;
  targetPath: string;
  workspaceRoot?: string;
  targetRelativePath?: string | null;
  files: string[];
  metadata: {
    warningCodes: OperatorWorktreeWarningCode[];
    idempotentSkip: boolean;
  };
};

export type OperatorWorktreeSnapshotResult = {
  required: boolean;
  captured: boolean;
  artifactPath?: string;
  manifest?: OperatorWorktreeSnapshotManifest;
  warnings: OperatorWorktreePreflightWarning[];
};

export type OperatorSafeTempWorkspaceResult = {
  created: boolean;
  path?: string;
  staleAfterMs: number;
  note: string;
};

export type OperatorWorktreeBoundedApplyResult = {
  applied: boolean;
  simulated: boolean;
  delegated: boolean;
  changedSurfaces: string[];
  metadata: Record<string, string | number | boolean>;
  message: string;
};

export type OperatorWorktreeRollbackLightResult = {
  attempted: boolean;
  recovered: boolean;
  degraded: boolean;
  unavailable: boolean;
  message: string;
};

export type OperatorWorktreeStageResult = {
  stage: OperatorWorktreeExecutionStage;
  success: boolean;
  details: string;
};

export type OperatorWorktreeExecutionReport = {
  id: string;
  createdAt: string;
  operation: OperatorWorktreeOperation;
  mode: OperatorWorktreeMode;
  riskClass: OperatorWorktreeRiskClass;
  outcome: OperatorWorktreeExecutionOutcome;
  failureClass: OperatorWorktreeFailureClass;
  recommendedAction: OperatorWorktreeRecommendation;
  allowed: boolean;
  warningCodes: OperatorWorktreeWarningCode[];
  blockingCodes: OperatorWorktreeReasonCode[];
  stages: OperatorWorktreeStageResult[];
  context: {
    repoRoot: string;
    targetPath: string;
    workspaceRoot?: string;
  };
  snapshot?: OperatorWorktreeSnapshotResult;
  tempWorkspace?: OperatorSafeTempWorkspaceResult;
  apply?: OperatorWorktreeBoundedApplyResult;
  rollback?: OperatorWorktreeRollbackLightResult;
  notes: string[];
};

export type OperatorWorktreeMaintenanceSummary = {
  reports: string[];
  snapshots: string[];
  tempWorkspaces: string[];
};
