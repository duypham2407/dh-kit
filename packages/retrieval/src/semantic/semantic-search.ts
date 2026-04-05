import type { SemanticSearchResult } from "../../../shared/src/types/embedding.js";
import type { NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo, type EmbeddingRow } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { createEmbeddingProvider, type EmbeddingProvider } from "./embedding-pipeline.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { readAnnIndex } from "./ann-index.js";

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
 * Semantic search: embed the query, then find the most similar chunks
 * via brute-force cosine similarity over stored embeddings.
 *
 * This is an in-process linear scan suitable for small-to-medium codebases
 * (< ~50k embeddings). For larger scale, swap in a vector index (HNSW / IVF).
 */
export async function semanticSearch(
  repoRoot: string,
  query: string,
  options?: SemanticSearchOptions,
  provider?: EmbeddingProvider,
): Promise<SemanticSearchResult[]> {
  const p = provider ?? createEmbeddingProvider();
  const topK = options?.topK ?? 10;
  const minSim = options?.minSimilarity ?? 0.25;
  const modelName = options?.modelName ?? p.config.modelName;

  // Embed the query
  const queryResponse = await p.embed({ texts: [query], model: modelName });
  const queryVector = queryResponse.vectors[0];
  if (!queryVector || queryVector.length === 0) {
    return [];
  }

  // Load ANN cache first; fall back to DB scan
  const useAnn = options?.topK !== undefined;
  const cachedIndex = useAnn ? await readAnnIndex(repoRoot, modelName) : undefined;
  const cachedEmbeddings: EmbeddingRow[] = cachedIndex
    ? cachedIndex.entries.map((entry) => ({
        id: `ann-${entry.chunkId}`,
        chunkId: entry.chunkId,
        modelName: entry.modelName,
        vector: entry.vector,
        vectorDim: entry.vector.length,
        createdAt: "ann-cache",
      }))
    : [];
  const allEmbeddings: EmbeddingRow[] = cachedEmbeddings.length > 0
    ? cachedEmbeddings
    : new EmbeddingsRepo(repoRoot).listByModel(modelName);

  if (allEmbeddings.length === 0) {
    return [];
  }

  // Score each embedding against the query
  const scored: Array<{ embedding: EmbeddingRow; similarity: number }> = [];
  for (const emb of allEmbeddings) {
    const sim = cosineSimilarity(queryVector, emb.vector);
    if (sim >= minSim) {
      scored.push({ embedding: emb, similarity: sim });
    }
  }

  // Sort by similarity descending, take topK
  scored.sort((a, b) => b.similarity - a.similarity);
  const topResults = scored.slice(0, topK);

  // Resolve chunks for the top results
  const chunksRepo = new ChunksRepo(repoRoot);
  const results: SemanticSearchResult[] = [];

  for (const { embedding, similarity } of topResults) {
    const chunk = chunksRepo.findById(embedding.chunkId);
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
