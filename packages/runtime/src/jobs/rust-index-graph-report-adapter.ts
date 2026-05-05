import type { IndexedFile } from "../../../shared/src/types/indexing.js";
import { resolveGraphAstEngineSelector, type GraphAstEngineSelector } from "../../../shared/src/utils/graph-engine-selector.js";

export type RuntimeGraphUnavailableReason =
  | "rust_indexer_report_not_available_at_runtime_job_boundary"
  | "ts_graph_engine_requires_explicit_rollback_rehearsal_context"
  | "ts_graph_engine_rollback_rehearsal_unsupported_at_runtime_job_boundary"
  | "invalid_graph_ast_engine_value";

export type RuntimeIndexGraphAdapterBehavior =
  | "rust_first_unavailable"
  | "compat_rust_first_unavailable"
  | "ts_rollback_context_required"
  | "ts_rollback_rehearsal_unsupported"
  | "invalid_selector_fallback_rust_unavailable";

export type RuntimeIndexGraphCounts = {
  edgesExtracted: number;
  importEdgesExtracted: number;
  callEdgesExtracted: number;
  callSitesExtracted: number;
  referencesExtracted: number;
};

export type RuntimeIndexGraphReport =
  | {
      available: true;
      source: "rust_indexer_report";
      reportPath?: string;
      counts: RuntimeIndexGraphCounts;
      engineSelector: GraphAstEngineSelector;
      runtimeBehavior: "rust_first_available" | "compat_rust_first_available";
    }
  | {
      available: false;
      source: "degraded_unavailable_adapter";
      reason: RuntimeGraphUnavailableReason;
      counts: RuntimeIndexGraphCounts;
      degraded: true;
      runtimeBehavior: RuntimeIndexGraphAdapterBehavior;
      engineSelector: GraphAstEngineSelector;
    };

export type RuntimeIndexGraphReportOptions = {
  allowTsRollbackRehearsal?: boolean;
  env?: Record<string, string | undefined>;
};

const ZERO_GRAPH_COUNTS: RuntimeIndexGraphCounts = {
  edgesExtracted: 0,
  importEdgesExtracted: 0,
  callEdgesExtracted: 0,
  callSitesExtracted: 0,
  referencesExtracted: 0,
};

/**
 * Runtime graph-report boundary for the index job.
 *
 * The TypeScript runtime package does not currently expose a Rust indexer or
 * bridge report API at this job boundary. The graph engine selector is read
 * explicitly so rollback rehearsal can observe real `DH_GRAPH_AST_ENGINE`
 * behavior without production indexing silently falling back to legacy
 * TypeScript graph/AST extraction for imports, calls, or call-sites.
 */
export async function loadRuntimeIndexGraphReportFromRustBridge(
  _repoRoot: string,
  _files: IndexedFile[],
  options?: RuntimeIndexGraphReportOptions,
): Promise<RuntimeIndexGraphReport> {
  const engineSelector = resolveGraphAstEngineSelector(options?.env);
  const adapterState = resolveRuntimeIndexGraphAdapterState(
    engineSelector,
    options?.allowTsRollbackRehearsal === true,
  );

  return {
    available: false,
    source: "degraded_unavailable_adapter",
    reason: adapterState.reason,
    counts: { ...ZERO_GRAPH_COUNTS },
    degraded: true,
    runtimeBehavior: adapterState.runtimeBehavior,
    engineSelector,
  };
}

function resolveRuntimeIndexGraphAdapterState(
  engineSelector: GraphAstEngineSelector,
  allowTsRollbackRehearsal: boolean,
): {
  reason: RuntimeGraphUnavailableReason;
  runtimeBehavior: RuntimeIndexGraphAdapterBehavior;
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
        reason: "ts_graph_engine_rollback_rehearsal_unsupported_at_runtime_job_boundary",
        runtimeBehavior: "ts_rollback_rehearsal_unsupported",
      }
      : {
        reason: "ts_graph_engine_requires_explicit_rollback_rehearsal_context",
        runtimeBehavior: "ts_rollback_context_required",
      };
  }

  if (engineSelector.engine === "compat") {
    return {
      reason: "rust_indexer_report_not_available_at_runtime_job_boundary",
      runtimeBehavior: "compat_rust_first_unavailable",
    };
  }

  return {
    reason: "rust_indexer_report_not_available_at_runtime_job_boundary",
    runtimeBehavior: "rust_first_unavailable",
  };
}
