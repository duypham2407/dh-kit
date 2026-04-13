import type { QualityGateResult } from "../workflow/quality-gates-runtime.js";

export type EvidenceGateDecision = {
  allowed: boolean;
  reason: string;
  suggestion?: string;
  qualityGate?: QualityGateResult;
};

type StructuralIntentRule = {
  pattern: RegExp;
  requiredTools: string[];
  suggestion: string;
};

const STRUCTURAL_INTENT_RULES: StructuralIntentRule[] = [
  {
    pattern: /\b(who calls|what calls|call hierarchy|callers?|callees?)\b/i,
    requiredTools: ["dh.call-hierarchy"],
    suggestion: "Run dh.call-hierarchy before answering call relationship questions.",
  },
  {
    pattern: /\b(depends on|depend on|imports|dependencies)\b/i,
    requiredTools: ["dh.find-dependencies", "dh.find-dependents"],
    suggestion: "Run dh.find-dependencies or dh.find-dependents before dependency claims.",
  },
  {
    pattern: /\b(references|used by|usages?)\b/i,
    requiredTools: ["dh.find-references"],
    suggestion: "Run dh.find-references before reporting usages.",
  },
  {
    pattern: /\b(refactor|rename|impact analysis|breaking change)\b/i,
    requiredTools: ["dh.find-references", "dh.find-dependents"],
    suggestion: "Run dh.find-references + dh.find-dependents before impact analysis.",
  },
];

export function evaluateEvidence(input: {
  userIntentText: string;
  toolsUsed: string[];
  evidenceScore: number;
  threshold?: number;
}): EvidenceGateDecision {
  const threshold = input.threshold ?? 0.5;
  const lowerTools = new Set(input.toolsUsed.map((tool) => tool.toLowerCase()));

  const matchedRule = STRUCTURAL_INTENT_RULES.find((rule) => rule.pattern.test(input.userIntentText));
  if (!matchedRule) {
    return { allowed: true, reason: "Non-structural intent; evidence gate passed." };
  }

  const hasRequiredTool = matchedRule.requiredTools.some((tool) => lowerTools.has(tool.toLowerCase()));
  if (!hasRequiredTool) {
    return {
      allowed: false,
      reason: "Missing structural graph-tool evidence for intent.",
      suggestion: matchedRule.suggestion,
    };
  }

  if (input.evidenceScore < threshold) {
    return {
      allowed: false,
      reason: `Evidence score ${input.evidenceScore.toFixed(2)} is below threshold ${threshold.toFixed(2)}.`,
      suggestion: "Gather more structural evidence before final response.",
    };
  }

  return { allowed: true, reason: "Structural evidence requirements satisfied." };
}
