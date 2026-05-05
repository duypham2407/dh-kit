import { afterEach, describe, expect, it } from "vitest";
import { GRAPH_AST_ENGINE_ENV_VAR } from "../../../shared/src/utils/graph-engine-selector.js";
import { loadDependencyEdgesFromRustBridge } from "./dependency-edge-adapter.js";

const originalGraphAstEngine = process.env[GRAPH_AST_ENGINE_ENV_VAR];

afterEach(() => {
  if (originalGraphAstEngine === undefined) {
    delete process.env[GRAPH_AST_ENGINE_ENV_VAR];
  } else {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = originalGraphAstEngine;
  }
});

describe("loadDependencyEdgesFromRustBridge graph engine selector", () => {
  it("defaults to a Rust-first unavailable adapter without enabling TS extraction", async () => {
    delete process.env[GRAPH_AST_ENGINE_ENV_VAR];

    const result = await loadDependencyEdgesFromRustBridge("/repo", []);

    expect(result).toMatchObject({
      available: false,
      degraded: true,
      source: "degraded_unavailable_adapter",
      reason: "rust_bridge_api_not_available_at_retrieval_boundary",
      runtimeBehavior: "rust_first_unavailable",
      engineSelector: {
        engine: "rust",
        source: "default",
        label: "default_rust",
        rustFirst: true,
        rollbackOnly: false,
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toEqual([]);
  });

  it("keeps compat mode Rust-first and does not run legacy TS dependency extraction", async () => {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = "compat";

    const result = await loadDependencyEdgesFromRustBridge("/repo", []);

    expect(result).toMatchObject({
      available: false,
      degraded: true,
      reason: "rust_bridge_api_not_available_at_retrieval_boundary",
      runtimeBehavior: "compat_rust_first_unavailable",
      engineSelector: {
        engine: "compat",
        source: "environment",
        label: "explicit_compat_rust_first",
        rustFirst: true,
        rollbackOnly: true,
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toEqual([]);
  });

  it("blocks ts mode outside explicit rollback rehearsal context", async () => {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = "ts";

    const result = await loadDependencyEdgesFromRustBridge("/repo", []);

    expect(result).toMatchObject({
      available: false,
      degraded: true,
      reason: "ts_graph_engine_requires_explicit_rollback_rehearsal_context",
      runtimeBehavior: "ts_rollback_context_required",
      engineSelector: {
        engine: "ts",
        source: "environment",
        label: "explicit_ts_rollback_only",
        rustFirst: false,
        rollbackOnly: true,
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toEqual([]);
  });

  it("labels ts rollback rehearsal as unsupported instead of faking a TS pass", async () => {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = "ts";

    const result = await loadDependencyEdgesFromRustBridge("/repo", [], {
      allowTsRollbackRehearsal: true,
    });

    expect(result).toMatchObject({
      available: false,
      degraded: true,
      reason: "ts_graph_engine_rollback_rehearsal_unsupported_at_retrieval_boundary",
      runtimeBehavior: "ts_rollback_rehearsal_unsupported",
      engineSelector: {
        engine: "ts",
        label: "explicit_ts_rollback_only",
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toEqual([]);
  });

  it("fails closed to Rust-first unavailable behavior for invalid selector values", async () => {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = "legacy-ts";

    const result = await loadDependencyEdgesFromRustBridge("/repo", []);

    expect(result).toMatchObject({
      available: false,
      degraded: true,
      reason: "invalid_graph_ast_engine_value",
      runtimeBehavior: "invalid_selector_fallback_rust_unavailable",
      engineSelector: {
        requestedValue: "legacy-ts",
        engine: "rust",
        source: "invalid_environment",
        valid: false,
        label: "invalid_fallback_rust",
        rustFirst: true,
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.edges).toEqual([]);
  });
});
