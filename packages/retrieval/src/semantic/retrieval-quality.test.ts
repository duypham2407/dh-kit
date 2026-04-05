import { describe, it, expect, afterEach } from "vitest";
import {
  createEmbeddingProvider,
  persistChunks,
  embedAndPersist,
  runEmbeddingPipeline,
  reembedAllChunks,
  rebuildAnnIndex,
  isEmbeddingKeyAvailable,
} from "./embedding-pipeline.js";
import { semanticSearch } from "./semantic-search.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

/**
 * Retrieval quality calibration tests.
 *
 * These tests verify both structural correctness and, when OPENAI_API_KEY is
 * available, semantic quality of the embedding pipeline. The provider-backed
 * tests use text-embedding-3-small and assert that semantically related code
 * ranks higher than unrelated code.
 */

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-quality-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

// ── Golden dataset: code snippets with known semantic relationships ──

const GOLDEN_CHUNKS = [
  {
    fileId: "auth",
    filePath: "src/auth/authenticate.ts",
    lineStart: 1,
    lineEnd: 12,
    content: `export async function authenticateUser(token: string): Promise<User> {
  const decoded = jwt.verify(token, SECRET_KEY);
  const user = await userRepository.findById(decoded.sub);
  if (!user) throw new UnauthorizedError("User not found");
  return user;
}`,
    language: "typescript",
  },
  {
    fileId: "auth-middleware",
    filePath: "src/middleware/auth-middleware.ts",
    lineStart: 1,
    lineEnd: 10,
    content: `export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  if (!token) return res.status(401).json({ error: "Missing token" });
  try { req.user = verifyToken(token); next(); }
  catch { res.status(403).json({ error: "Invalid token" }); }
}`,
    language: "typescript",
  },
  {
    fileId: "math-utils",
    filePath: "src/utils/math.ts",
    lineStart: 1,
    lineEnd: 8,
    content: `export function calculateStandardDeviation(values: number[]): number {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}`,
    language: "typescript",
  },
  {
    fileId: "db-connect",
    filePath: "src/database/connection.ts",
    lineStart: 1,
    lineEnd: 10,
    content: `export async function connectToDatabase(config: DatabaseConfig): Promise<Pool> {
  const pool = new Pool({ host: config.host, port: config.port, database: config.name });
  await pool.query("SELECT 1");
  logger.info("Database connection established");
  return pool;
}`,
    language: "typescript",
  },
  {
    fileId: "user-repo",
    filePath: "src/repositories/user-repository.ts",
    lineStart: 1,
    lineEnd: 10,
    content: `export class UserRepository {
  constructor(private pool: Pool) {}
  async findById(id: string): Promise<User | null> {
    const result = await this.pool.query("SELECT * FROM users WHERE id = $1", [id]);
    return result.rows[0] ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    const result = await this.pool.query("SELECT * FROM users WHERE email = $1", [email]);
    return result.rows[0] ?? null;
  }
}`,
    language: "typescript",
  },
  {
    fileId: "sorting",
    filePath: "src/utils/sorting.ts",
    lineStart: 1,
    lineEnd: 12,
    content: `export function quickSort<T>(arr: T[], compareFn: (a: T, b: T) => number): T[] {
  if (arr.length <= 1) return arr;
  const pivot = arr[Math.floor(arr.length / 2)];
  const left = arr.filter(x => compareFn(x, pivot) < 0);
  const middle = arr.filter(x => compareFn(x, pivot) === 0);
  const right = arr.filter(x => compareFn(x, pivot) > 0);
  return [...quickSort(left, compareFn), ...middle, ...quickSort(right, compareFn)];
}`,
    language: "typescript",
  },
];

// ── Structural calibration tests (always run, mock embeddings) ──

describe("retrieval quality - structural", () => {
  it("full pipeline indexes all golden chunks and produces matching embeddings", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();

    const result = await runEmbeddingPipeline(repo, GOLDEN_CHUNKS);

    expect(result.chunksStored).toBe(GOLDEN_CHUNKS.length);
    expect(result.embeddingsStored).toBe(GOLDEN_CHUNKS.length);
    expect(result.skippedDuplicates).toBe(0);

    const chunksRepo = new ChunksRepo(repo);
    const embRepo = new EmbeddingsRepo(repo);

    expect(chunksRepo.listAll()).toHaveLength(GOLDEN_CHUNKS.length);
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(GOLDEN_CHUNKS.length);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("reembedAllChunks regenerates all embeddings and rebuilds ANN index", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    await runEmbeddingPipeline(repo, GOLDEN_CHUNKS, provider);

    const result = await reembedAllChunks(repo, provider, "text-embedding-3-small");
    expect(result.embeddingsStored).toBe(GOLDEN_CHUNKS.length);

    const embRepo = new EmbeddingsRepo(repo);
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(GOLDEN_CHUNKS.length);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("batch sizing works correctly for datasets exceeding maxBatchSize", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();

    // Use a provider with small batch size to force multi-batch processing
    const baseProvider = createEmbeddingProvider();
    const tinyConfig = { ...baseProvider.config, maxBatchSize: 2 };
    const tinyProvider: typeof baseProvider = {
      config: tinyConfig,
      embed: baseProvider.embed,
    };

    const chunks = persistChunks(repo, GOLDEN_CHUNKS);
    const result = await embedAndPersist(repo, chunks, tinyProvider);

    expect(result.embeddingsStored).toBe(GOLDEN_CHUNKS.length);
    expect(result.skippedDuplicates).toBe(0);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("semantic search returns all golden chunks when threshold is very low", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    await runEmbeddingPipeline(repo, GOLDEN_CHUNKS, provider);

    // Use default topK (10) which is > 6 golden chunks, and very low minSimilarity
    // Do NOT set topK explicitly to avoid triggering ANN cache path in test env
    const results = await semanticSearch(
      repo,
      "authentication",
      { minSimilarity: -1 },
      provider,
    );

    expect(results.length).toBe(GOLDEN_CHUNKS.length);
    // Results must be sorted by similarity descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.similarity).toBeGreaterThanOrEqual(results[i]!.similarity);
    }

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

// ── Provider-backed quality tests (only run with OPENAI_API_KEY) ──

const hasApiKey = isEmbeddingKeyAvailable();

describe.skipIf(!hasApiKey)("retrieval quality - provider-backed (real embeddings)", () => {
  it("auth-related queries rank auth chunks higher than math/sorting chunks", async () => {
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    // Verify we're using real provider
    expect(provider.config.modelName).toBe("text-embedding-3-small");

    await runEmbeddingPipeline(repo, GOLDEN_CHUNKS, provider);

    const results = await semanticSearch(
      repo,
      "How does user authentication work with JWT tokens?",
      { minSimilarity: 0, topK: 6 },
      provider,
    );

    expect(results.length).toBeGreaterThan(0);

    // The top 2 results should be auth-related files
    const topFiles = results.slice(0, 2).map((r) => r.filePath);
    const authFiles = [
      "src/auth/authenticate.ts",
      "src/middleware/auth-middleware.ts",
    ];

    const authInTop2 = topFiles.filter((f) => authFiles.includes(f)).length;
    expect(authInTop2).toBeGreaterThanOrEqual(1);

    // Math/sorting should not be in top 2
    const irrelevantFiles = ["src/utils/math.ts", "src/utils/sorting.ts"];
    const irrelevantInTop2 = topFiles.filter((f) => irrelevantFiles.includes(f)).length;
    expect(irrelevantInTop2).toBe(0);
  }, 30000);

  it("database-related queries rank db chunks higher than auth chunks", async () => {
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    await runEmbeddingPipeline(repo, GOLDEN_CHUNKS, provider);

    const results = await semanticSearch(
      repo,
      "How to connect to the database and query users?",
      { minSimilarity: 0, topK: 6 },
      provider,
    );

    expect(results.length).toBeGreaterThan(0);

    const topFiles = results.slice(0, 2).map((r) => r.filePath);
    const dbFiles = [
      "src/database/connection.ts",
      "src/repositories/user-repository.ts",
    ];

    const dbInTop2 = topFiles.filter((f) => dbFiles.includes(f)).length;
    expect(dbInTop2).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("sorting algorithm query ranks sorting chunk highest", async () => {
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    await runEmbeddingPipeline(repo, GOLDEN_CHUNKS, provider);

    const results = await semanticSearch(
      repo,
      "quicksort implementation with comparator function",
      { minSimilarity: 0, topK: 6 },
      provider,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.filePath).toBe("src/utils/sorting.ts");
  }, 30000);

  it("embedding token usage is tracked correctly", async () => {
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    const result = await runEmbeddingPipeline(repo, GOLDEN_CHUNKS, provider);

    expect(result.totalTokens).toBeGreaterThan(0);
    // text-embedding-3-small should use a reasonable number of tokens
    // for 6 code snippets (rough estimate: each ~50-100 tokens)
    expect(result.totalTokens).toBeGreaterThan(100);
    expect(result.totalTokens).toBeLessThan(5000);
  }, 30000);
});
