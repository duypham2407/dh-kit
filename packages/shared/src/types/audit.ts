import type { AgentRole } from "./agent.js";

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

export type HookInvocationLog = {
  id: string;
  sessionId: string;
  envelopeId: string;
  hookName: "model_override" | "pre_tool_exec" | "pre_answer" | "skill_activation" | "mcp_routing" | "session_state";
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decision: "allow" | "block" | "modify";
  reason: string;
  durationMs: number;
  timestamp: string;
};
