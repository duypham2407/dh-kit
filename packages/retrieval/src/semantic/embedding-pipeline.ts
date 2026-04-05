import type { EmbeddingProviderConfig, EmbeddingRequest, EmbeddingResponse } from "../../../shared/src/types/embedding.js";
import { DEFAULT_EMBEDDING_CONFIG } from "../../../shared/src/types/embedding.js";
import type { ChunkRow } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo, type EmbeddingRow } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { contentHash, estimateTokens } from "./chunker.js";
import type { ChunkInput } from "../../../shared/src/types/embedding.js";
import { writeAnnIndex } from "./ann-index.js";

/**
 * Embedding provider abstraction. The default implementation calls the
 * OpenAI embeddings API. When no API key is configured, it falls back to
 * a deterministic mock that produces random-seeded vectors (useful for
 * development and testing without network calls).
 */
export type EmbeddingProvider = {
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  readonly config: EmbeddingProviderConfig;
};

/**
 * Check whether the embedding API key is available in the environment.
 */
export function isEmbeddingKeyAvailable(config?: EmbeddingProviderConfig): boolean {
  const c = config ?? DEFAULT_EMBEDDING_CONFIG;
  return typeof process.env[c.apiKeyEnvVar] === "string" && process.env[c.apiKeyEnvVar]!.length > 0;
}

/**
 * Create an embedding provider. Uses the real OpenAI API if the key is
 * available; otherwise returns a mock provider.
 */
export function createEmbeddingProvider(config?: EmbeddingProviderConfig): EmbeddingProvider {
  const c = config ?? DEFAULT_EMBEDDING_CONFIG;

  if (isEmbeddingKeyAvailable(c)) {
    return createOpenAIEmbeddingProvider(c);
  }

  return createMockEmbeddingProvider(c);
}

/**
 * Real OpenAI embedding provider using fetch.
 */
function createOpenAIEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  const baseUrl = config.baseUrl ?? "https://api.openai.com/v1";

  return {
    config,
    async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
      const apiKey = process.env[config.apiKeyEnvVar];
      if (!apiKey) {
        throw new Error(`Missing API key: set ${config.apiKeyEnvVar} in your environment.`);
      }

      const response = await fetch(`${baseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: request.model,
          input: request.texts,
          dimensions: config.dimensions,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Embedding API error ${response.status}: ${body}`);
      }

      const json = (await response.json()) as {
        data: Array<{ embedding: number[]; index: number }>;
        usage: { prompt_tokens: number; total_tokens: number };
      };

      // Sort by index to match input order
      const sorted = [...json.data].sort((a, b) => a.index - b.index);
      return {
        vectors: sorted.map((d) => d.embedding),
        model: request.model,
        usage: {
          promptTokens: json.usage.prompt_tokens,
          totalTokens: json.usage.total_tokens,
        },
      };
    },
  };
}

/**
 * Mock embedding provider for dev/test. Produces deterministic vectors
 * seeded from the content hash so results are stable across runs.
 */
function createMockEmbeddingProvider(config: EmbeddingProviderConfig): EmbeddingProvider {
  return {
    config,
    async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
      const vectors = request.texts.map((text) => {
        return mockVector(text, config.dimensions);
      });
      return {
        vectors,
        model: request.model,
        usage: {
          promptTokens: request.texts.reduce((acc, t) => acc + estimateTokens(t), 0),
          totalTokens: request.texts.reduce((acc, t) => acc + estimateTokens(t), 0),
        },
      };
    },
  };
}

/**
 * Generate a deterministic pseudo-random unit vector from text.
 * Uses a simple hash-seeded LCG so the same content always maps to the
 * same vector without requiring a real model.
 */
function mockVector(text: string, dim: number): number[] {
  let seed = 0;
  for (let i = 0; i < text.length; i++) {
    seed = ((seed << 5) - seed + text.charCodeAt(i)) | 0;
  }
  const vec: number[] = [];
  for (let i = 0; i < dim; i++) {
    seed = (seed * 1664525 + 1013904223) | 0;
    vec.push(((seed >>> 0) / 0xffffffff) * 2 - 1);
  }
  // Normalize to unit vector
  const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return mag > 0 ? vec.map((v) => v / mag) : vec;
}

// ── Pipeline orchestration ──────────────────────────────────────────

export type EmbedPipelineResult = {
  chunksStored: number;
  embeddingsStored: number;
  skippedDuplicates: number;
  totalTokens: number;
};

/**
 * Persist chunk inputs to the chunks table, skipping duplicates by content hash.
 * Returns the stored ChunkRows (including any that already existed).
 */
export function persistChunks(repoRoot: string, inputs: ChunkInput[]): ChunkRow[] {
  const repo = new ChunksRepo(repoRoot);
  const results: ChunkRow[] = [];

  for (const input of inputs) {
    const hash = contentHash(input.content);
    const existing = repo.findByContentHash(hash);
    if (existing) {
      results.push(existing);
    } else {
      const row = repo.save({
        fileId: input.fileId,
        filePath: input.filePath,
        symbolId: input.symbolId,
        lineStart: input.lineStart,
        lineEnd: input.lineEnd,
        content: input.content,
        contentHash: hash,
        tokenEstimate: estimateTokens(input.content),
        language: input.language,
      });
      results.push(row);
    }
  }

  return results;
}

/**
 * Embed chunks and persist embeddings to the DB. Skips chunks that
 * already have an embedding for the same model.
 */
export async function embedAndPersist(
  repoRoot: string,
  chunks: ChunkRow[],
  provider: EmbeddingProvider,
): Promise<EmbedPipelineResult> {
  const embRepo = new EmbeddingsRepo(repoRoot);
  const config = provider.config;
  let embeddingsStored = 0;
  let skippedDuplicates = 0;
  let totalTokens = 0;

  // Filter chunks that already have embeddings for this model
  const toEmbed: ChunkRow[] = [];
  for (const chunk of chunks) {
    const existing = embRepo.findByChunkId(chunk.id);
    if (existing && existing.modelName === config.modelName) {
      skippedDuplicates++;
    } else {
      toEmbed.push(chunk);
    }
  }

  // Batch embed
  const batchSize = config.maxBatchSize;
  for (let i = 0; i < toEmbed.length; i += batchSize) {
    const batch = toEmbed.slice(i, i + batchSize);
    const texts = batch.map((c) => c.content);
    const response = await provider.embed({ texts, model: config.modelName });

    totalTokens += response.usage.totalTokens;

    const embedInputs: Array<Omit<EmbeddingRow, "id" | "createdAt">> = batch.map((chunk, idx) => ({
      chunkId: chunk.id,
      modelName: config.modelName,
      vector: response.vectors[idx]!,
      vectorDim: response.vectors[idx]!.length,
    }));

    embRepo.saveBatch(embedInputs);
    embeddingsStored += embedInputs.length;
  }

  return {
    chunksStored: chunks.length,
    embeddingsStored,
    skippedDuplicates,
    totalTokens,
  };
}

/**
 * Full pipeline: chunk inputs → persist chunks → embed → persist embeddings.
 */
export async function runEmbeddingPipeline(
  repoRoot: string,
  chunkInputs: ChunkInput[],
  provider?: EmbeddingProvider,
): Promise<EmbedPipelineResult> {
  const p = provider ?? createEmbeddingProvider();
  const storedChunks = persistChunks(repoRoot, chunkInputs);
  const result = await embedAndPersist(repoRoot, storedChunks, p);
  await rebuildAnnIndex(repoRoot, p.config.modelName);
  return result;
}

// ── Chunk lifecycle management ──────────────────────────────────────

export type RefreshFileResult = EmbedPipelineResult & {
  chunksDeleted: number;
  embeddingsDeleted: number;
};

/**
 * Re-index a file: delete its existing chunks + embeddings, then run the
 * full embedding pipeline with the new chunk inputs.
 *
 * This is the correct entry point when a file changes on disk — it prevents
 * stale chunks and orphaned embeddings from accumulating.
 */
export async function refreshFileChunks(
  repoRoot: string,
  fileId: string,
  newChunkInputs: ChunkInput[],
  provider?: EmbeddingProvider,
): Promise<RefreshFileResult> {
  const chunksRepo = new ChunksRepo(repoRoot);
  const embRepo = new EmbeddingsRepo(repoRoot);

  // Delete embeddings for existing chunks first (FK constraint order)
  const existingChunkIds = chunksRepo.findIdsByFileId(fileId);
  embRepo.deleteByChunkIds(existingChunkIds);
  chunksRepo.deleteByFileId(fileId);

  const chunksDeleted = existingChunkIds.length;
  const embeddingsDeleted = existingChunkIds.length; // approximate (may differ if some had no embedding)

  const pipelineResult = await runEmbeddingPipeline(repoRoot, newChunkInputs, provider);

  return {
    ...pipelineResult,
    chunksDeleted,
    embeddingsDeleted,
  };
}

/**
 * Re-embed all existing chunks for a new model. Used when the embedding model
 * changes and all vectors need to be regenerated.
 *
 * Steps:
 * 1. Delete all embeddings for the old model.
 * 2. Load all current chunks.
 * 3. Embed them with the new provider.
 */
export async function reembedAllChunks(
  repoRoot: string,
  provider: EmbeddingProvider,
  oldModelName?: string,
): Promise<EmbedPipelineResult> {
  const chunksRepo = new ChunksRepo(repoRoot);
  const embRepo = new EmbeddingsRepo(repoRoot);

  // Clear old model's embeddings if requested
  if (oldModelName) {
    embRepo.deleteByModel(oldModelName);
  }

  // Clean up any orphaned embeddings (whose chunks no longer exist)
  embRepo.deleteOrphaned();

  const allChunks = chunksRepo.listAll();
  const result = await embedAndPersist(repoRoot, allChunks, provider);
  await rebuildAnnIndex(repoRoot, provider.config.modelName);
  return result;
}

export async function rebuildAnnIndex(repoRoot: string, modelName: string): Promise<string> {
  const embRepo = new EmbeddingsRepo(repoRoot);
  const embeddings = embRepo.listByModel(modelName);
  return writeAnnIndex(repoRoot, modelName, embeddings);
}
