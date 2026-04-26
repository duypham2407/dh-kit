/**
 * Legacy retrieval-local evidence packet model.
 *
 * Non-authoritative contract note:
 * - This type exists for retrieval package internals and legacy diagnostics.
 * - Touched Rust-hosted first-wave knowledge-command flows must use canonical
 *   Rust evidence packets. For the current bounded broad `dh ask` path that
 *   means `query.buildEvidence` only when a finite static subject is supported.
 * - This type does not define runtime tracing, trace-flow execution,
 *   impact-analysis, remote/daemon, Windows, or universal repository-understanding
 *   product truth.
 */
export type LegacyRetrievalEvidencePacket = {
  /** Canonical repo-relative file path for deterministic repoRoot resolution. */
  filePath: string;
  symbol?: string;
  lines: [number, number];
  reason: string;
  score: number;
  sourceTools: string[];
  snippet: string;
};

/**
 * @deprecated Use `LegacyRetrievalEvidencePacket` for retrieval-local typing.
 * This alias remains for compatibility only.
 */
export type EvidencePacket = LegacyRetrievalEvidencePacket;

/**
 * Legacy retrieval-local normalized result model.
 *
 * Non-authoritative contract note:
 * - This shape is for retrieval pipeline internals only.
 * - It does not define canonical product evidence packet truth on touched
 *   Rust-hosted knowledge-command flows.
 */
export type LegacyNormalizedRetrievalResult = {
  entityType: "file" | "symbol" | "chunk";
  entityId: string;
  /** Canonical repo-relative file path across semantic/non-semantic retrieval. */
  filePath: string;
  symbolName?: string;
  lineRange: [number, number];
  sourceTool: string;
  matchReason: string;
  rawScore: number;
  normalizedScore: number;
  metadata: Record<string, unknown>;
};

/**
 * @deprecated Use `LegacyNormalizedRetrievalResult` for retrieval-local typing.
 * This alias remains for compatibility only.
 */
export type NormalizedRetrievalResult = LegacyNormalizedRetrievalResult;
