import type { QueryIntent } from "../../../opencode-app/src/planner/required-tools-policy.js";
import type { SemanticMode } from "../../../shared/src/types/lane.js";

export type RetrievalPlan = {
  intent: QueryIntent;
  seedTerms: string[];
  selectedTools: string[];
  graphExpansion: {
    maxDepth: number;
    includeCallers: boolean;
    includeCallees: boolean;
    includeImports: boolean;
  };
  contextBudget: number;
  retryPolicy: "widen-if-low-confidence" | "fallback-keyword-heavy";
  costTier: "low" | "medium" | "high";
  semanticMode: SemanticMode;
};
