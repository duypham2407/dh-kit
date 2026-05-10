export type ContextEvidenceSource =
  | "semantic"
  | "symbol"
  | "reference"
  | "graph"
  | "file_mention"
  | "keyword"
  | "lsp_diagnostics"
  | string;

export type ContextLedgerEntry = {
  id: string;
  filePath: string;
  lineRange: [number, number];
  reason: string;
  score: number;
  source: ContextEvidenceSource;
  symbolName?: string;
};

export type ContextLedger = {
  id: string;
  entries: ContextLedgerEntry[];
};

export type ContextCoverageWarning = {
  code:
    | "dependency_graph_unavailable"
    | "lsp_unconfigured"
    | "no_evidence"
    | "reduced_scan_coverage"
    | "scan_stopped"
    | "unsupported_language"
    | "truncated_context";
  message: string;
  details?: Record<string, unknown>;
};

export type ContextScanOptions = {
  maxFiles?: number;
  maxDepth?: number;
  maxFileSizeBytes?: number;
  followSymlinks?: boolean;
  includeExtensions?: string[];
  ignoreDirs?: string[];
};

export type ContextInspectInput = {
  query: string;
  repoRoot?: string;
  mode?: "ask" | "explain" | "trace";
  semanticMode?: "always" | "auto" | "off";
  budgetMode?: "fast" | "normal" | "deep";
  scanOptions?: ContextScanOptions;
};

export type ContextInspectReport = {
  query: string;
  ledger: ContextLedger;
  coverage: {
    included: number;
    skipped: number;
    warnings: ContextCoverageWarning[];
  };
  cache: {
    status: "hit" | "miss";
    workspaceFingerprint: string;
  };
  metrics: {
    latencyMs: {
      fingerprint: number;
      retrieval: number;
      planning: number;
      total: number;
    };
  };
  generatedAt: string;
};
