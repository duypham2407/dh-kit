import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { QueryIntent } from "../planner/required-tools-policy.js";
import { REQUIRED_TOOLS_BY_INTENT } from "../planner/required-tools-policy.js";

export type ToolDecision = {
  allow: boolean;
  reason: string;
};

export function enforceToolUsage(envelope: ExecutionEnvelopeState, toolName: string, intent: QueryIntent = "broad_codebase_question"): ToolDecision {
  if (["grep", "find", "cat", "head", "tail", "sed", "awk"].includes(toolName)) {
    return {
      allow: false,
      reason: `Tool '${toolName}' is blocked. Use structured or built-in repository tools instead.`,
    };
  }

  const requiredTools = envelope.requiredTools.length > 0 ? envelope.requiredTools : REQUIRED_TOOLS_BY_INTENT[intent];
  if (requiredTools.length > 0 && !requiredTools.includes(toolName)) {
    return {
      allow: true,
      reason: `Tool '${toolName}' is allowed, but not listed as required for intent '${intent}'.`,
    };
  }

  return {
    allow: true,
    reason: `Tool allowed for intent '${intent}'.`,
  };
}
