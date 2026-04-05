import { inferIntentFromInput, REQUIRED_TOOLS_BY_INTENT } from "../../../opencode-app/src/planner/required-tools-policy.js";
import type { RetrievalPlan } from "./retrieval-plan.js";

export function buildRetrievalPlan(input: {
  query: string;
  mode: "ask" | "explain" | "trace";
  semanticMode?: "always" | "auto" | "off";
}): RetrievalPlan {
  const intent = input.mode === "trace" ? "trace_flow" : inferIntentFromInput(input.query);
  const seedTerms = input.query
    .split(/\s+/)
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 2)
    .slice(0, 8);

  return {
    intent,
    seedTerms,
    selectedTools: REQUIRED_TOOLS_BY_INTENT[intent],
    graphExpansion: {
      maxDepth: intent === "trace_flow" || intent === "impact_analysis" ? 2 : 1,
      includeCallers: intent === "trace_flow",
      includeCallees: intent === "trace_flow",
      includeImports: intent === "explain_module" || intent === "broad_codebase_question",
    },
    contextBudget: intent === "trace_flow" ? 12000 : 8000,
    retryPolicy: intent === "bug_investigation" ? "fallback-keyword-heavy" : "widen-if-low-confidence",
    costTier: input.semanticMode === "always" ? "medium" : "low",
    semanticMode: input.semanticMode ?? "always",
  };
}
