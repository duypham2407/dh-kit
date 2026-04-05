export type QueryIntent =
  | "find_definition"
  | "explain_module"
  | "trace_flow"
  | "impact_analysis"
  | "bug_investigation"
  | "broad_codebase_question"
  | "library_lookup"
  | "browser_verification";

export const REQUIRED_TOOLS_BY_INTENT: Record<QueryIntent, string[]> = {
  find_definition: ["symbol_search", "keyword_search"],
  explain_module: ["keyword_search", "symbol_search", "semantic_search"],
  trace_flow: ["symbol_search", "graph_expand", "semantic_search"],
  impact_analysis: ["symbol_search", "reference_search", "graph_expand"],
  bug_investigation: ["keyword_search", "symbol_search", "semantic_search"],
  broad_codebase_question: ["keyword_search", "semantic_search"],
  library_lookup: ["context7"],
  browser_verification: ["chrome-devtools", "playwright"],
};

export function inferIntentFromInput(input: string): QueryIntent {
  const normalized = input.toLowerCase();
  if (normalized.includes("trace") || normalized.includes("flow")) {
    return "trace_flow";
  }
  if (normalized.includes("impact")) {
    return "impact_analysis";
  }
  if (normalized.includes("bug") || normalized.includes("error") || normalized.includes("debug")) {
    return "bug_investigation";
  }
  if (normalized.includes("library") || normalized.includes("framework") || normalized.includes("api")) {
    return "library_lookup";
  }
  if (normalized.includes("browser") || normalized.includes("ui") || normalized.includes("frontend")) {
    return "browser_verification";
  }
  if (normalized.includes("definition") || normalized.includes("where defined")) {
    return "find_definition";
  }
  if (normalized.includes("explain") || normalized.includes("module")) {
    return "explain_module";
  }
  return "broad_codebase_question";
}
