import type { AgentRole } from "./agent.js";
import type { HookDecisionRecord } from "../../../opencode-sdk/src/index.js";

export type ToolUsageAudit = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  intent: string;
  toolName: string;
  status: "called" | "succeeded" | "failed" | "required_but_missing";
  timestamp: string;
};

export type SkillActivationAudit = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  skillName: string;
  activationReason: string;
  timestamp: string;
};

export type McpRouteAudit = {
  id: string;
  sessionId: string;
  envelopeId: string;
  role: AgentRole;
  mcpName: string;
  routeReason: string;
  timestamp: string;
};

export type HookInvocationLog = HookDecisionRecord;

export type AuditQueryFilter = {
  sessionId?: string;
  role?: AgentRole;
  envelopeId?: string;
  fromTimestamp?: string;
  toTimestamp?: string;
  limit?: number;
};

export const DEFAULT_AUDIT_QUERY_LIMIT = 25;
export const MAX_AUDIT_QUERY_LIMIT = 100;
