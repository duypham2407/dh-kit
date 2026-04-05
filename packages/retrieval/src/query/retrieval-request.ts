import type { SemanticMode } from "../../../shared/src/types/lane.js";
import type { QueryIntent } from "../../../opencode-app/src/planner/required-tools-policy.js";

export type RetrievalRequest = {
  query: string;
  mode: "ask" | "explain" | "trace";
  intent: QueryIntent;
  seedTerms: string[];
  semanticMode: SemanticMode;
};
