import type {
  ExtensionDecisionKind,
  ExtensionReasonCode,
} from "./extension-contract.js";

export type HookName =
  | "model_override"
  | "pre_tool_exec"
  | "pre_answer"
  | "session_state"
  | "skill_activation"
  | "mcp_routing";

export type HookDecision = "allow" | "block" | "modify";

export type HookDecisionRecord = {
  id: string;
  sessionId: string;
  envelopeId: string;
  hookName: HookName;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  decision: HookDecision;
  reason: string;
  durationMs: number;
  timestamp: string;
};

export type HookDecisionRow = {
  id: string;
  session_id: string;
  envelope_id: string;
  hook_name: HookName;
  input_json: string;
  output_json: string;
  decision: HookDecision;
  reason: string;
  duration_ms: number;
  timestamp: string;
};

export type ModelOverridePayload = {
  providerId: string;
  modelId: string;
  variantId: string;
};

export type PreToolExecPayload = {
  allow: boolean;
  reason: string;
};

export type PreAnswerPayload = {
  allow: boolean;
  action?: string;
  reason: string;
};

export type SkillActivationPayload = {
  skills: string[];
};

export type McpRoutingPayload = {
  mcps: string[];
  blocked?: string[];
  warnings?: string[];
  decisions?: Record<string, ExtensionDecisionKind>;
  reasons?: Record<string, ExtensionReasonCode[]>;
  rejected?: Record<string, ExtensionReasonCode[]>;
};
