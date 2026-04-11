export type McpRoutingStatus = "available" | "degraded" | "needs_auth" | "unavailable";

export type McpHealthClass = "critical" | "standard" | "best_effort";

export type McpReasonCode =
  | "lane_match"
  | "lane_mismatch"
  | "role_match"
  | "role_mismatch"
  | "intent_match"
  | "intent_no_match"
  | "capability_match"
  | "priority_boost"
  | "deprioritized"
  | "requires_auth"
  | "needs_auth"
  | "status_unavailable"
  | "status_degraded"
  | "fallback_applied"
  | "blocked_by_precondition"
  | "no_runtime_status"
  | "no_auth_context";

export type McpRuntimeRecord = {
  status: McpRoutingStatus;
  serverKey?: string;
  authReady?: boolean;
};

export type McpRuntimeSnapshot = Record<string, McpRuntimeRecord>;

export type McpRoutingDecision = {
  selected: string[];
  blocked: string[];
  warnings: string[];
  reasons: Record<string, McpReasonCode[]>;
  rejected: Record<string, McpReasonCode[]>;
};

export type McpRoutingDecisionOptions = {
  runtimeSnapshot?: McpRuntimeSnapshot;
  maxSelected?: number;
};
