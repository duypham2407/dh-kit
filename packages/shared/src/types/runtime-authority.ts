export type RuntimeAuthorityOwner = "rust" | "typescript_worker" | "typescript_compatibility";

export type RuntimeAuthorityFinalStatus =
  | "clean_success"
  | "recovered_degraded_success"
  | "degraded_success"
  | "startup_failed"
  | "request_failed"
  | "cancelled"
  | "cleanup_incomplete"
  | "typescript_compatibility";

export type RuntimeAuthorityFields = {
  runtimeAuthority: RuntimeAuthorityOwner;
  finalStatus: RuntimeAuthorityFinalStatus;
  degradedReason?: string | null;
  hostLifecycle?: {
    topology: string;
    supportBoundary: string;
    finalStatus: string;
    finalExitCode: number;
    workerState?: string;
    healthState?: string;
    failurePhase?: string;
    timeoutClass?: string;
    recoveryOutcome?: string;
    cleanupOutcome?: string;
  };
};
