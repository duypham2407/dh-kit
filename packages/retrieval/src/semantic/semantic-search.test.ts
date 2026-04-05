import { describe, it, expect, afterEach } from "vitest";
import { cosineSimilarity, semanticSearch, semanticResultsToNormalized } from "./semantic-search.js";
import { persistChunks, createEmbeddingProvider, embedAndPersist } from "./embedding-pipeline.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { writeAnnIndex } from "./ann-index.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-search-test-"));
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

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });

  it("handles zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("semanticSearch", () => {
  it("returns results sorted by similarity", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    // Store some chunks with different content
    const chunks = persistChunks(repo, [
      { fileId: "f1", filePath: "auth.ts", lineStart: 1, lineEnd: 10, content: "function authenticateUser(token) { verify(token); }", language: "typescript" },
      { fileId: "f2", filePath: "math.ts", lineStart: 1, lineEnd: 10, content: "function calculateSum(a, b) { return a + b; }", language: "typescript" },
      { fileId: "f3", filePath: "auth-middleware.ts", lineStart: 1, lineEnd: 10, content: "function authMiddleware(req) { checkAuth(req.headers.token); }", language: "typescript" },
    ]);

    await embedAndPersist(repo, chunks, provider);

    // Use a very low minSimilarity to ensure we get results with mock vectors
    const results = await semanticSearch(repo, "authentication", { minSimilarity: -1 }, provider);

    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(3);

    // Results should be sorted by similarity descending
    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1]!.similarity).toBeGreaterThanOrEqual(results[i]!.similarity);
    }

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("returns empty when no embeddings stored", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    const results = await semanticSearch(repo, "anything", {}, provider);
    expect(results).toEqual([]);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("uses ANN cache when available", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    const chunks = persistChunks(repo, [
      { fileId: "f1", filePath: "auth.ts", lineStart: 1, lineEnd: 10, content: "function authenticateUser(token) { verify(token); }", language: "typescript" },
    ]);
    await embedAndPersist(repo, chunks, provider);

    const embRepo = new EmbeddingsRepo(repo);
    await writeAnnIndex(repo, "text-embedding-3-small", embRepo.listByModel("text-embedding-3-small"));

    const results = await semanticSearch(repo, "authentication", { topK: 1, minSimilarity: -1 }, provider);
    expect(results).toHaveLength(1);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

describe("semanticResultsToNormalized", () => {
  it("converts semantic results to NormalizedRetrievalResult", () => {
    const results = semanticResultsToNormalized([
      {
        chunkId: "chunk-1",
        filePath: "auth.ts",
        symbolId: undefined,
        lineStart: 1,
        lineEnd: 10,
        content: "function auth() {}",
        similarity: 0.85,
        language: "typescript",
      },
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]!.entityType).toBe("chunk");
    expect(results[0]!.sourceTool).toBe("semantic_search");
    expect(results[0]!.normalizedScore).toBe(0.85);
    expect(results[0]!.matchReason).toContain("0.850");
  });
});
