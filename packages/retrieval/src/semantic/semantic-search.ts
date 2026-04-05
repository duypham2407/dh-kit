import type { SemanticSearchResult } from "../../../shared/src/types/embedding.js";
import type { NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo, type EmbeddingRow } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embedding-pipeline.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { readAnnIndex, readHnswIndexSync, HnswIndex } from "./ann-index.js";
import { recordTelemetry } from "./telemetry-collector.js";

export type SemanticSearchOptions = {
  topK?: number;
  minSimilarity?: number;
  modelName?: string;
};

/**
 * Cosine similarity between two vectors. Both must be same length.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Semantic search: embed the query, then find the most similar chunks.
 *
 * Search strategy (in priority order):
 *   1. HNSW index (hnsw-<model>.json) — O(log N), used when available.
 *   2. Flat ANN cache (ann-<model>.json) — O(N) linear scan, legacy fallback.
 *   3. Live DB scan — O(N) linear scan when no cache exists at all.
 *
 * The HNSW index is built automatically by the embedding pipeline after each
 * indexing run. For repos with < ~5k embeddings the difference is negligible;
 * for larger repos the HNSW path is significantly faster.
 */
export async function semanticSearch(
  repoRoot: string,
  query: string,
  options?: SemanticSearchOptions,
  provider?: EmbeddingProvider,
): Promise<SemanticSearchResult[]> {
  const t0 = performance.now();
  const p = provider ?? createEmbeddingProvider();
  const topK = options?.topK ?? 10;
  const minSim = options?.minSimilarity ?? 0.25;
  const modelName = options?.modelName ?? p.config.modelName;
  let strategy: "hnsw" | "flat_cache" | "db_scan" = "db_scan";

  // Embed the query
  const queryResponse = await p.embed({ texts: [query], model: modelName });
  const queryVector = queryResponse.vectors[0];
  if (!queryVector || queryVector.length === 0) {
    return [];
  }

  let results: SemanticSearchResult[];

  // ── Strategy 1: HNSW index ──────────────────────────────────────────────
  const hnswIndex = readHnswIndexSync(repoRoot, modelName);
  if (hnswIndex && hnswIndex.size > 0) {
    strategy = "hnsw";
    const hits = hnswIndex.search(queryVector, topK);
    const filtered = hits.filter((h) => h.similarity >= minSim);
    results = resolveChunks(repoRoot, filtered.map((h) => ({ chunkId: h.chunkId, similarity: h.similarity })));
  } else {
    // ── Strategy 2: Flat ANN cache (legacy) ────────────────────────────────
    const cachedIndex = await readAnnIndex(repoRoot, modelName);
    const flatEmbeddings: EmbeddingRow[] = cachedIndex
      ? cachedIndex.entries.map((entry) => ({
          id: `ann-${entry.chunkId}`,
          chunkId: entry.chunkId,
          modelName: entry.modelName,
          vector: entry.vector,
          vectorDim: entry.vector.length,
          createdAt: "ann-cache",
        }))
      : [];

    // ── Strategy 3: DB scan ─────────────────────────────────────────────────
    const allEmbeddings: EmbeddingRow[] = flatEmbeddings.length > 0
      ? (strategy = "flat_cache", flatEmbeddings)
      : (strategy = "db_scan", new EmbeddingsRepo(repoRoot).listByModel(modelName));

    if (allEmbeddings.length === 0) {
      return [];
    }

    // Linear scan
    const scored = linearScan(queryVector, allEmbeddings, topK, minSim);
    results = resolveChunks(repoRoot, scored);
  }

  const durationMs = performance.now() - t0;
  recordTelemetry(repoRoot, {
    kind: "semantic_search",
    metrics: {
      durationMs,
      strategy,
      resultCount: results.length,
      topK,
      minSimilarity: minSim,
      modelName,
    },
  });

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function linearScan(
  queryVector: number[],
  embeddings: EmbeddingRow[],
  topK: number,
  minSim: number,
): Array<{ chunkId: string; similarity: number }> {
  const scored: Array<{ chunkId: string; similarity: number }> = [];
  for (const emb of embeddings) {
    const sim = cosineSimilarity(queryVector, emb.vector);
    if (sim >= minSim) {
      scored.push({ chunkId: emb.chunkId, similarity: sim });
    }
  }
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, topK);
}

function resolveChunks(
  repoRoot: string,
  hits: Array<{ chunkId: string; similarity: number }>,
): SemanticSearchResult[] {
  const chunksRepo = new ChunksRepo(repoRoot);
  const results: SemanticSearchResult[] = [];
  for (const { chunkId, similarity } of hits) {
    const chunk = chunksRepo.findById(chunkId);
    if (!chunk) continue;
    results.push({
      chunkId: chunk.id,
      filePath: chunk.filePath,
      symbolId: chunk.symbolId,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      content: chunk.content,
      similarity,
      language: chunk.language,
    });
  }
  return results;
}

/**
 * Convert semantic search results to NormalizedRetrievalResult[] for
 * integration with the existing retrieval pipeline.
 */
export function semanticResultsToNormalized(results: SemanticSearchResult[]): NormalizedRetrievalResult[] {
  return results.map((r) => ({
    entityType: "chunk" as const,
    entityId: createId("semantic"),
    filePath: r.filePath,
    symbolName: r.symbolId,
    lineRange: [r.lineStart, r.lineEnd] as [number, number],
    sourceTool: "semantic_search",
    matchReason: `Semantic similarity ${r.similarity.toFixed(3)} to query.`,
    rawScore: r.similarity,
    normalizedScore: r.similarity,
    metadata: { chunkId: r.chunkId, language: r.language },
  }));
}
