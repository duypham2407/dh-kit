import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import type { QueryIntent } from "../planner/required-tools-policy.js";
import { REQUIRED_TOOLS_BY_INTENT } from "../planner/required-tools-policy.js";

export type AnswerGateDecision = {
  allow: boolean;
  action: "finalize" | "retry" | "degrade";
  reason: string;
};

export function gateAnswer(
  envelope: ExecutionEnvelopeState,
  toolsUsed: string[],
  evidenceScore: number,
  intent: QueryIntent = "broad_codebase_question",
): AnswerGateDecision {
  const requiredTools = envelope.requiredTools.length > 0 ? envelope.requiredTools : REQUIRED_TOOLS_BY_INTENT[intent];
  const missingRequiredTools = requiredTools.filter((toolName) => !toolsUsed.includes(toolName));
  if (missingRequiredTools.length > 0) {
    return {
      allow: false,
      action: "retry",
      reason: `Missing required tools for intent '${intent}': ${missingRequiredTools.join(", ")}`,
    };
  }

  const threshold = getEvidenceThreshold(envelope.lane, intent);
  if (evidenceScore < threshold.retryThreshold) {
    return {
      allow: false,
      action: "retry",
      reason: `Evidence score ${evidenceScore.toFixed(2)} is below retry threshold ${threshold.retryThreshold.toFixed(2)} for intent '${intent}'.`,
    };
  }

  if (evidenceScore < threshold.finalizeThreshold) {
    return {
      allow: false,
      action: "degrade",
      reason: `Evidence score ${evidenceScore.toFixed(2)} is below finalize threshold ${threshold.finalizeThreshold.toFixed(2)} for intent '${intent}'.`,
    };
  }

  return {
    allow: true,
    action: "finalize",
    reason: `Answer is valid for lane '${envelope.lane}' and intent '${intent}'.`,
  };
}

function getEvidenceThreshold(lane: ExecutionEnvelopeState["lane"], intent: QueryIntent): {
  retryThreshold: number;
  finalizeThreshold: number;
} {
  if (intent === "trace_flow" || intent === "impact_analysis") {
    return { retryThreshold: 0.45, finalizeThreshold: 0.72 };
  }
  if (intent === "bug_investigation" || lane !== "quick") {
    return { retryThreshold: 0.4, finalizeThreshold: 0.65 };
  }
  return { retryThreshold: 0.35, finalizeThreshold: 0.55 };
}
