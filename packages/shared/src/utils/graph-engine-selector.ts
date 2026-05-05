export const GRAPH_AST_ENGINE_ENV_VAR = "DH_GRAPH_AST_ENGINE" as const;

export type GraphAstEngine = "rust" | "ts" | "compat";

export type GraphAstEngineSelectorSource = "default" | "environment" | "invalid_environment";

export type GraphAstEngineSelectorLabel =
  | "default_rust"
  | "explicit_rust"
  | "explicit_ts_rollback_only"
  | "explicit_compat_rust_first"
  | "invalid_fallback_rust";

export type GraphAstEngineProductionBehavior =
  | "rust_first"
  | "ts_rollback_only"
  | "compat_rust_first"
  | "invalid_fallback_rust";

export type GraphAstEngineSelector = {
  envVar: typeof GRAPH_AST_ENGINE_ENV_VAR;
  requestedValue: string | undefined;
  engine: GraphAstEngine;
  source: GraphAstEngineSelectorSource;
  valid: boolean;
  label: GraphAstEngineSelectorLabel;
  productionBehavior: GraphAstEngineProductionBehavior;
  rustFirst: boolean;
  rollbackOnly: boolean;
  runsTypeScriptExtraction: false;
};

type EnvLike = Record<string, string | undefined>;

export function resolveGraphAstEngineSelector(env: EnvLike = process.env): GraphAstEngineSelector {
  const requestedValue = env[GRAPH_AST_ENGINE_ENV_VAR]?.trim();
  if (!requestedValue) {
    return {
      envVar: GRAPH_AST_ENGINE_ENV_VAR,
      requestedValue: undefined,
      engine: "rust",
      source: "default",
      valid: true,
      label: "default_rust",
      productionBehavior: "rust_first",
      rustFirst: true,
      rollbackOnly: false,
      runsTypeScriptExtraction: false,
    };
  }

  const normalized = requestedValue.toLowerCase();
  if (normalized === "rust") {
    return {
      envVar: GRAPH_AST_ENGINE_ENV_VAR,
      requestedValue,
      engine: "rust",
      source: "environment",
      valid: true,
      label: "explicit_rust",
      productionBehavior: "rust_first",
      rustFirst: true,
      rollbackOnly: false,
      runsTypeScriptExtraction: false,
    };
  }

  if (normalized === "compat") {
    return {
      envVar: GRAPH_AST_ENGINE_ENV_VAR,
      requestedValue,
      engine: "compat",
      source: "environment",
      valid: true,
      label: "explicit_compat_rust_first",
      productionBehavior: "compat_rust_first",
      rustFirst: true,
      rollbackOnly: true,
      runsTypeScriptExtraction: false,
    };
  }

  if (normalized === "ts") {
    return {
      envVar: GRAPH_AST_ENGINE_ENV_VAR,
      requestedValue,
      engine: "ts",
      source: "environment",
      valid: true,
      label: "explicit_ts_rollback_only",
      productionBehavior: "ts_rollback_only",
      rustFirst: false,
      rollbackOnly: true,
      runsTypeScriptExtraction: false,
    };
  }

  return {
    envVar: GRAPH_AST_ENGINE_ENV_VAR,
    requestedValue,
    engine: "rust",
    source: "invalid_environment",
    valid: false,
    label: "invalid_fallback_rust",
    productionBehavior: "invalid_fallback_rust",
    rustFirst: true,
    rollbackOnly: false,
    runsTypeScriptExtraction: false,
  };
}
