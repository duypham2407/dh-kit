export type ExtensionContractVersion = "v1";

export type ExtensionLane = "quick" | "delivery" | "migration";

export type ExtensionRole =
  | "quick"
  | "coordinator"
  | "analyst"
  | "architect"
  | "implementer"
  | "reviewer"
  | "tester";

export type ExtensionDecisionKind = "allow" | "block" | "modify";

export type ExtensionReasonCode =
  | "lane_match"
  | "lane_mismatch"
  | "role_match"
  | "role_mismatch"
  | "intent_match"
  | "intent_no_match"
  | "capability_match"
  | "capability_denied"
  | "priority_boost"
  | "deprioritized"
  | "requires_auth"
  | "needs_auth"
  | "status_unavailable"
  | "status_degraded"
  | "fallback_applied"
  | "blocked_by_precondition"
  | "no_runtime_status"
  | "no_auth_context"
  | "entry_missing"
  | "contract_version_mismatch"
  | "compat_check_failed";

export type ExtensionRuntimeState = "first" | "updated" | "same";

// Intentionally strict for deterministic policy enforcement: `priority`, `lanes`,
// and `roles` remain required so planner/executor never infer implicit defaults.
export type ExtensionSpec = {
  id: string;
  contractVersion: ExtensionContractVersion;
  entry: string;
  capabilities: string[];
  priority: number;
  lanes: ExtensionLane[];
  roles: ExtensionRole[];
};

export type ExtensionDecision = {
  extensionId: string;
  decision: ExtensionDecisionKind;
  reasonCodes: ExtensionReasonCode[];
  warnings?: string[];
};
