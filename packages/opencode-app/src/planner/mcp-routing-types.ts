import type {
  ExtensionContractVersion,
  ExtensionDecisionKind,
  ExtensionReasonCode,
  ExtensionRuntimeState,
} from "../../../opencode-sdk/src/index.js";

export type McpRoutingStatus = "available" | "degraded" | "needs_auth" | "unavailable";

export type McpHealthClass = "critical" | "standard" | "best_effort";

export type McpReasonCode = ExtensionReasonCode;

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
  decisions: Record<string, ExtensionDecisionKind>;
  reasons: Record<string, McpReasonCode[]>;
  rejected: Record<string, McpReasonCode[]>;
  runtimeStates?: Record<string, { state: ExtensionRuntimeState; fingerprint: string }>;
};

export type McpRoutingDecisionOptions = {
  runtimeSnapshot?: McpRuntimeSnapshot;
  maxSelected?: number;
  requiredCapabilities?: string[];
  supportedContractVersions?: ExtensionContractVersion[];
  runtimeStateRepoRoot?: string;
};
