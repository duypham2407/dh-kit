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

export type OperatorSafeArtifactFamily = "report" | "snapshot" | "temp_workspace";

export type OperatorSafeArtifactFamilySelector = "all" | OperatorSafeArtifactFamily;

export type OperatorSafeMaintenanceMode = "dry_run" | "apply";

export type OperatorSafeMaintenanceReasonCode =
  | "artifact_not_found"
  | "family_not_supported"
  | "path_outside_operator_safe_root"
  | "cleanup_eligibility_unproven"
  | "artifact_too_recent_for_policy_prune"
  | "metadata_unreadable_or_untrusted"
  | "already_removed"
  | "linked_artifact_missing"
  | "eligible_by_policy_prune"
  | "eligible_by_degraded_report"
  | "eligible_by_orphan_target"
  | "eligible_by_temp_staleness"
  | "report_outcome_not_cleanup_eligible"
  | "cleanup_requires_report_or_family_target"
  | "target_family_not_cleanup_supported"
  | "invalid_cleanup_target";

export type OperatorSafeCleanupEligibility = "eligible" | "retained" | "unknown";

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
  workspaceRelativePath: string | null;
  repoRelativePath: string | null;
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
  executionId: string;
  reportId: string;
  createdAt: string;
  operation: OperatorWorktreeOperation;
  mode: OperatorWorktreeMode;
  repoRoot: string;
  targetPath: string;
  workspaceRoot?: string;
  targetRelativePath?: string | null;
  workspaceRelativePath?: string | null;
  repoRelativePath?: string | null;
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

export type OperatorSafeTempWorkspaceManifest = {
  id: string;
  executionId: string;
  reportId: string;
  createdAt: string;
  lastTouchedAt: string;
  operation: OperatorWorktreeOperation;
  mode: OperatorWorktreeMode;
  repoRoot: string;
  tempPath: string;
  staleAfterMs: number;
};

export type OperatorSafeTempWorkspaceResult = {
  created: boolean;
  id?: string;
  executionId?: string;
  reportId?: string;
  path?: string;
  manifestPath?: string;
  createdAt?: string;
  lastTouchedAt?: string;
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
  executionId: string;
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
    workspaceRelativePath?: string | null;
    repoRelativePath?: string | null;
  };
  relatedArtifacts: {
    snapshot?: {
      artifactId: string;
      path?: string;
    };
    tempWorkspace?: {
      artifactId: string;
      path?: string;
    };
  };
  snapshot?: OperatorWorktreeSnapshotResult;
  tempWorkspace?: OperatorSafeTempWorkspaceResult;
  apply?: OperatorWorktreeBoundedApplyResult;
  rollback?: OperatorWorktreeRollbackLightResult;
  notes: string[];
};

export type OperatorSafeArtifactInventoryRecord = {
  family: OperatorSafeArtifactFamily;
  artifactId: string;
  executionId?: string;
  reportId?: string;
  path: string;
  existsOnDisk: boolean;
  createdAt?: string;
  lastTouchedAt?: string;
  operation?: OperatorWorktreeOperation;
  mode?: OperatorWorktreeMode;
  outcome?: OperatorWorktreeExecutionOutcome;
  failureClass?: OperatorWorktreeFailureClass;
  cleanupEligibility: OperatorSafeCleanupEligibility;
  cleanupReason?: OperatorSafeMaintenanceReasonCode;
};

export type OperatorWorktreeMaintenanceInventory = {
  generatedAt: string;
  selectedFamily: OperatorSafeArtifactFamilySelector;
  limit?: number;
  totalCount: number;
  families: {
    report: OperatorSafeArtifactInventoryRecord[];
    snapshot: OperatorSafeArtifactInventoryRecord[];
    temp_workspace: OperatorSafeArtifactInventoryRecord[];
  };
};

export type OperatorSafeArtifactInspectDetails =
  | {
    family: "report";
    operation?: OperatorWorktreeOperation;
    mode?: OperatorWorktreeMode;
    outcome?: OperatorWorktreeExecutionOutcome;
    failureClass?: OperatorWorktreeFailureClass;
    recommendedAction?: OperatorWorktreeRecommendation;
    warningCodes: OperatorWorktreeWarningCode[];
    blockingCodes: OperatorWorktreeReasonCode[];
    linkedSnapshotId?: string;
    linkedTempWorkspaceId?: string;
  }
  | {
    family: "snapshot";
    operation?: OperatorWorktreeOperation;
    mode?: OperatorWorktreeMode;
    repoRoot?: string;
    targetPath?: string;
    workspaceRoot?: string;
    workspaceRelativePath?: string | null;
    repoRelativePath?: string | null;
    warningCodes: OperatorWorktreeWarningCode[];
    idempotentSkip: boolean;
    linkedReportId?: string;
    orphaned: boolean;
  }
  | {
    family: "temp_workspace";
    operation?: OperatorWorktreeOperation;
    mode?: OperatorWorktreeMode;
    tempPath?: string;
    staleAfterMs?: number;
    nextEligibleCleanupAt?: string;
    linkedReportId?: string;
    orphaned: boolean;
  };

export type OperatorSafeArtifactInspectResult = {
  family: OperatorSafeArtifactFamily;
  artifactId: string;
  found: boolean;
  reason?: OperatorSafeMaintenanceReasonCode;
  record?: OperatorSafeArtifactInventoryRecord;
  details?: OperatorSafeArtifactInspectDetails;
  warnings: Array<{
    reason: OperatorSafeMaintenanceReasonCode;
    message: string;
  }>;
};

export type OperatorSafeMaintenanceActionItem = {
  family: OperatorSafeArtifactFamily;
  artifactId: string;
  executionId?: string;
  reportId?: string;
  path: string;
  reason: OperatorSafeMaintenanceReasonCode;
  detail?: string;
};

export type OperatorSafeMaintenanceActionResult = {
  action: "prune" | "cleanup";
  mode: OperatorSafeMaintenanceMode;
  requestedFamily: OperatorSafeArtifactFamilySelector;
  evaluated: OperatorSafeMaintenanceActionItem[];
  planned: OperatorSafeMaintenanceActionItem[];
  removed: OperatorSafeMaintenanceActionItem[];
  retained: OperatorSafeMaintenanceActionItem[];
  skipped: OperatorSafeMaintenanceActionItem[];
  warnings: Array<{
    family: OperatorSafeArtifactFamily;
    artifactId: string;
    reason: OperatorSafeMaintenanceReasonCode;
    message: string;
  }>;
};

export type OperatorSafePruneRequest = {
  mode: OperatorSafeMaintenanceMode;
  family?: OperatorSafeArtifactFamilySelector;
  nowMs?: number;
  retentionOverridesMs?: Partial<Record<OperatorSafeArtifactFamily, number>>;
};

export type OperatorSafeCleanupRequest = {
  mode: OperatorSafeMaintenanceMode;
  reportId?: string;
  family?: "snapshot" | "temp_workspace";
  artifactId?: string;
  nowMs?: number;
};

export type OperatorWorktreeMaintenanceSummary = OperatorWorktreeMaintenanceInventory;
