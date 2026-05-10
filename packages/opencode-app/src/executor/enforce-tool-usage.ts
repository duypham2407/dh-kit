import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { QueryIntent } from "../planner/required-tools-policy.js";
import { REQUIRED_TOOLS_BY_INTENT } from "../planner/required-tools-policy.js";
import { getToolDefinition } from "../tools/tool-registry.js";

export type ToolDecision = {
  allow: boolean;
  reason: string;
};

export function enforceToolUsage(envelope: ExecutionEnvelopeState, toolName: string, intent: QueryIntent = "broad_codebase_question"): ToolDecision {
  if (["find", "cat", "head", "tail", "sed", "awk"].includes(toolName)) {
    return {
      allow: false,
      reason: `Tool '${toolName}' is blocked. Use structured or built-in repository tools instead.`,
    };
  }

  const catalogTool = getToolDefinition(toolName);
  if (catalogTool && envelope.requiredTools.length === 0) {
    return {
      allow: true,
      reason: `Tool allowed for intent '${intent}'.`,
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
