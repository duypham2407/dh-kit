import { describe, it, expect, afterEach } from "vitest";
import {
  createEmbeddingProvider,
  isEmbeddingKeyAvailable,
  persistChunks,
  embedAndPersist,
  runEmbeddingPipeline,
  refreshFileChunks,
  reembedAllChunks,
} from "./embedding-pipeline.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-emb-test-"));
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

describe("isEmbeddingKeyAvailable", () => {
  it("returns false when env var is not set", () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    expect(isEmbeddingKeyAvailable()).toBe(false);
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

describe("createEmbeddingProvider (mock)", () => {
  it("returns mock provider when no API key is set", () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const provider = createEmbeddingProvider();
    expect(provider.config.modelName).toBe("text-embedding-3-small");
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("produces deterministic vectors from mock", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const provider = createEmbeddingProvider();
    const r1 = await provider.embed({ texts: ["hello"], model: "text-embedding-3-small" });
    const r2 = await provider.embed({ texts: ["hello"], model: "text-embedding-3-small" });
    expect(r1.vectors[0]).toEqual(r2.vectors[0]);
    expect(r1.vectors[0]!.length).toBe(1536);

    // Different text produces different vector
    const r3 = await provider.embed({ texts: ["world"], model: "text-embedding-3-small" });
    expect(r3.vectors[0]).not.toEqual(r1.vectors[0]);
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

describe("persistChunks", () => {
  it("stores chunks and deduplicates by content hash", () => {
    const repo = makeTmpRepo();
    const inputs = [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 10, content: "const a = 1;", language: "typescript" },
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 10, content: "const a = 1;", language: "typescript" }, // duplicate
      { fileId: "f2", filePath: "b.ts", lineStart: 1, lineEnd: 5, content: "const b = 2;", language: "typescript" },
    ];

    const rows = persistChunks(repo, inputs);
    expect(rows).toHaveLength(3);
    // First and second should have the same ID (deduped)
    expect(rows[0]!.id).toBe(rows[1]!.id);
    // Third should differ
    expect(rows[2]!.id).not.toBe(rows[0]!.id);
  });
});

describe("embedAndPersist", () => {
  it("embeds chunks and stores them", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    // First persist some chunks
    const chunks = persistChunks(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 10, content: "function hello() {}", language: "typescript" },
      { fileId: "f2", filePath: "b.ts", lineStart: 1, lineEnd: 5, content: "const x = 42;", language: "typescript" },
    ]);

    const stats = await embedAndPersist(repo, chunks, provider);
    expect(stats.embeddingsStored).toBe(2);
    expect(stats.skippedDuplicates).toBe(0);

    // Verify in DB
    const embRepo = new EmbeddingsRepo(repo);
    const emb1 = embRepo.findByChunkId(chunks[0]!.id);
    expect(emb1).toBeDefined();
    expect(emb1!.vectorDim).toBe(1536);

    // Running again should skip duplicates
    const stats2 = await embedAndPersist(repo, chunks, provider);
    expect(stats2.skippedDuplicates).toBe(2);
    expect(stats2.embeddingsStored).toBe(0);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

describe("runEmbeddingPipeline", () => {
  it("runs full pipeline from chunk inputs to stored embeddings", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();

    const result = await runEmbeddingPipeline(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "export const greeting = 'hi';", language: "typescript" },
    ]);

    expect(result.chunksStored).toBe(1);
    expect(result.embeddingsStored).toBe(1);

    // Verify persistence
    const chunksRepo = new ChunksRepo(repo);
    const allChunks = chunksRepo.listAll();
    expect(allChunks).toHaveLength(1);

    const embRepo = new EmbeddingsRepo(repo);
    const count = embRepo.countByModel("text-embedding-3-small");
    expect(count).toBe(1);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

describe("refreshFileChunks", () => {
  it("removes stale chunks and embeddings when a file is re-indexed", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    // Initial index
    await runEmbeddingPipeline(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "const old = 1;", language: "typescript" },
      { fileId: "f1", filePath: "a.ts", lineStart: 6, lineEnd: 10, content: "const alsoOld = 2;", language: "typescript" },
    ], provider);

    const chunksRepo = new ChunksRepo(repo);
    const embRepo = new EmbeddingsRepo(repo);
    expect(chunksRepo.listAll()).toHaveLength(2);
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(2);

    // Re-index with updated content
    const result = await refreshFileChunks(repo, "f1", [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 8, content: "const newContent = 42;", language: "typescript" },
    ], provider);

    expect(result.chunksDeleted).toBe(2);
    expect(result.embeddingsStored).toBe(1);
    expect(chunksRepo.listAll()).toHaveLength(1);
    expect(chunksRepo.listAll()[0]!.content).toBe("const newContent = 42;");
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(1);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});

describe("reembedAllChunks", () => {
  it("clears old model embeddings and re-embeds with new model config", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    // Seed with initial embeddings
    await runEmbeddingPipeline(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "function alpha() {}", language: "typescript" },
      { fileId: "f2", filePath: "b.ts", lineStart: 1, lineEnd: 5, content: "function beta() {}", language: "typescript" },
    ], provider);

    const embRepo = new EmbeddingsRepo(repo);
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(2);

    // Re-embed (simulate model change — same mock but pretend old=new for test)
    const result = await reembedAllChunks(repo, provider, "text-embedding-3-small");

    // Old embeddings deleted, new ones created
    expect(result.embeddingsStored).toBe(2);
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(2);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("removes orphaned embeddings during re-embed", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    // Seed chunks + embeddings
    await runEmbeddingPipeline(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "const x = 1;", language: "typescript" },
    ], provider);

    // Manually delete the chunk to create an orphaned embedding
    const chunksRepo = new ChunksRepo(repo);
    const embRepo = new EmbeddingsRepo(repo);
    const chunks = chunksRepo.findByFileId("f1");
    // Delete chunks without their embeddings to simulate an orphaned embedding state.
    // We must first move the embedding's chunk_id reference out of FK scope by
    // directly using the DB — instead, we test orphan cleanup by using refreshFileChunks
    // to delete properly, then manually inserting a dangling embedding row.
    const chunkId = chunks[0]!.id;

    // Use refreshFileChunks to clear everything cleanly, then seed a dangling embedding
    await refreshFileChunks(repo, "f1", [], provider); // clears all f1 chunks + embeddings

    // Now manually insert a dangling embedding pointing to a non-existent chunk
    // (disable FK enforcement temporarily for test setup)
    const { openDhDatabase } = await import("../../../storage/src/sqlite/db.js");
    const db = openDhDatabase(repo);
    db.exec("PRAGMA foreign_keys = OFF");
    db.prepare("INSERT INTO embeddings (id, chunk_id, model_name, vector_json, vector_dim, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run("emb-orphan", "chunk-does-not-exist", "text-embedding-3-small", "[]", 0, new Date().toISOString());
    db.exec("PRAGMA foreign_keys = ON");

    expect(embRepo.countByModel("text-embedding-3-small")).toBe(1); // orphan exists

    // reembedAllChunks should clean up orphans
    await reembedAllChunks(repo, provider);
    expect(embRepo.countByModel("text-embedding-3-small")).toBe(0); // orphan cleaned, no new chunks

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});
