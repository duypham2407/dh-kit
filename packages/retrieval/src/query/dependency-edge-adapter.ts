import type { IndexedEdge, IndexedFile } from "../../../shared/src/types/indexing.js";
import { resolveGraphAstEngineSelector, type GraphAstEngineSelector } from "../../../shared/src/utils/graph-engine-selector.js";

export type DependencyEdgeUnavailableReason =
  | "rust_bridge_api_not_available_at_retrieval_boundary"
  | "ts_graph_engine_requires_explicit_rollback_rehearsal_context"
  | "ts_graph_engine_rollback_rehearsal_unsupported_at_retrieval_boundary"
  | "invalid_graph_ast_engine_value";

export type DependencyEdgeAdapterRuntimeBehavior =
  | "rust_first_unavailable"
  | "compat_rust_first_unavailable"
  | "ts_rollback_context_required"
  | "ts_rollback_rehearsal_unsupported"
  | "invalid_selector_fallback_rust_unavailable";

export type DependencyEdgeAdapterResult = {
  edges: IndexedEdge[];
  available: false;
  reason: DependencyEdgeUnavailableReason;
  source: "degraded_unavailable_adapter";
  degraded: true;
  runtimeBehavior: DependencyEdgeAdapterRuntimeBehavior;
  engineSelector: GraphAstEngineSelector;
};

export type DependencyEdgeAdapterOptions = {
  allowTsRollbackRehearsal?: boolean;
  env?: Record<string, string | undefined>;
};

/**
 * Explicit dependency-edge boundary for retrieval.
 *
 * Retrieval does not currently have a Rust bridge/RPC dependency-edge API in
 * this package. The graph engine selector is intentionally explicit so rollback
 * rehearsal can see real `DH_GRAPH_AST_ENGINE` behavior without silently
 * re-running the legacy TypeScript graph extractor in production.
 */
export async function loadDependencyEdgesFromRustBridge(
  _repoRoot: string,
  _files: IndexedFile[],
  options?: DependencyEdgeAdapterOptions,
): Promise<DependencyEdgeAdapterResult> {
  const engineSelector = resolveGraphAstEngineSelector(options?.env);
  const adapterState = resolveDependencyEdgeAdapterState(
    engineSelector,
    options?.allowTsRollbackRehearsal === true,
  );

  return {
    edges: [],
    available: false,
    reason: adapterState.reason,
    source: "degraded_unavailable_adapter",
    degraded: true,
    runtimeBehavior: adapterState.runtimeBehavior,
    engineSelector,
  };
}

function resolveDependencyEdgeAdapterState(
  engineSelector: GraphAstEngineSelector,
  allowTsRollbackRehearsal: boolean,
): {
  reason: DependencyEdgeUnavailableReason;
  runtimeBehavior: DependencyEdgeAdapterRuntimeBehavior;
} {
  if (!engineSelector.valid) {
    return {
      reason: "invalid_graph_ast_engine_value",
      runtimeBehavior: "invalid_selector_fallback_rust_unavailable",
    };
  }

  if (engineSelector.engine === "ts") {
    return allowTsRollbackRehearsal
      ? {
        reason: "ts_graph_engine_rollback_rehearsal_unsupported_at_retrieval_boundary",
        runtimeBehavior: "ts_rollback_rehearsal_unsupported",
      }
      : {
        reason: "ts_graph_engine_requires_explicit_rollback_rehearsal_context",
        runtimeBehavior: "ts_rollback_context_required",
      };
  }

  if (engineSelector.engine === "compat") {
    return {
      reason: "rust_bridge_api_not_available_at_retrieval_boundary",
      runtimeBehavior: "compat_rust_first_unavailable",
    };
  }

  return {
    reason: "rust_bridge_api_not_available_at_retrieval_boundary",
    runtimeBehavior: "rust_first_unavailable",
  };
}
