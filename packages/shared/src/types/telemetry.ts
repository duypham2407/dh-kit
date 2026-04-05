/**
 * Telemetry types for the embedding and retrieval pipeline.
 *
 * These types capture operational metrics (token usage, latencies, error
 * counts) that can be logged, persisted to disk, or surfaced through the
 * doctor snapshot. No data is sent externally — all telemetry stays local
 * to the project's `.dh/` directory.
 */

// ---------------------------------------------------------------------------
// Timing / span
// ---------------------------------------------------------------------------

export type TelemetrySpan = {
  name: string;
  startedAt: string; // ISO-8601
  durationMs: number;
};

// ---------------------------------------------------------------------------
// Embedding pipeline metrics
// ---------------------------------------------------------------------------

export type EmbeddingPipelineMetrics = {
  /** Wall-clock duration of the full pipeline run. */
  durationMs: number;
  /** Number of chunks passed in. */
  chunksInput: number;
  /** Number of chunks actually sent to the provider (after dedup). */
  chunksEmbedded: number;
  /** Number of chunks skipped because they already had embeddings. */
  chunksSkipped: number;
  /** Cumulative token usage reported by the embedding provider. */
  totalTokens: number;
  /** Average tokens per chunk (0 if none embedded). */
  avgTokensPerChunk: number;
  /** Embedding model used. */
  modelName: string;
  /** Whether the mock provider was used (no API key). */
  usedMockProvider: boolean;
};

// ---------------------------------------------------------------------------
// ANN index build metrics
// ---------------------------------------------------------------------------

export type AnnBuildMetrics = {
  /** Wall-clock duration of HNSW index construction + write. */
  durationMs: number;
  /** Number of embedding vectors inserted into the index. */
  vectorCount: number;
  /** Model name the index was built for. */
  modelName: string;
};

// ---------------------------------------------------------------------------
// Semantic search query metrics
// ---------------------------------------------------------------------------

export type SemanticSearchMetrics = {
  /** Wall-clock duration of the full search call. */
  durationMs: number;
  /** Which search strategy was used. */
  strategy: "hnsw" | "flat_cache" | "db_scan";
  /** Number of results returned (after filtering). */
  resultCount: number;
  /** topK requested. */
  topK: number;
  /** minSimilarity threshold used. */
  minSimilarity: number;
  /** Model name of the embedding used. */
  modelName: string;
};

// ---------------------------------------------------------------------------
// Aggregate session metrics (optional roll-up)
// ---------------------------------------------------------------------------

export type IndexingSessionMetrics = {
  timestamp: string;
  pipeline: EmbeddingPipelineMetrics;
  annBuild?: AnnBuildMetrics;
};

// ---------------------------------------------------------------------------
// Telemetry event envelope
// ---------------------------------------------------------------------------

export type TelemetryEvent =
  | { kind: "embedding_pipeline"; metrics: EmbeddingPipelineMetrics }
  | { kind: "ann_build"; metrics: AnnBuildMetrics }
  | { kind: "semantic_search"; metrics: SemanticSearchMetrics };
