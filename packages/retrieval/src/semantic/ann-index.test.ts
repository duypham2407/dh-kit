import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  writeAnnIndex,
  readAnnIndex,
  HnswIndex,
  buildAndWriteHnswIndex,
  readHnswIndex,
  readHnswIndexSync,
  DEFAULT_HNSW_CONFIG,
} from "./ann-index.js";

// Helper: create N unit vectors in D dimensions
function makeVectors(n: number, dim: number, seed = 1): number[][] {
  const vecs: number[][] = [];
  let s = seed;
  for (let i = 0; i < n; i++) {
    const v: number[] = [];
    let mag = 0;
    for (let d = 0; d < dim; d++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const x = ((s & 0xffff) / 0xffff) * 2 - 1;
      v.push(x);
      mag += x * x;
    }
    const norm = Math.sqrt(mag) || 1;
    vecs.push(v.map((x) => x / norm));
  }
  return vecs;
}

describe("ann-index (legacy flat cache)", () => {
  it("writes and reads flat ANN cache entries", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dh-ann-test-"));
    const filePath = await writeAnnIndex(repoRoot, "test-model", [
      {
        id: "emb-1",
        chunkId: "chunk-1",
        modelName: "test-model",
        vector: [0.1, 0.2],
        vectorDim: 2,
        createdAt: new Date().toISOString(),
      },
    ]);

    expect(fs.existsSync(filePath)).toBe(true);
    const loaded = await readAnnIndex(repoRoot, "test-model");
    expect(loaded?.entries).toHaveLength(1);
    expect(loaded?.entries[0]?.chunkId).toBe("chunk-1");
  });
});

describe("HnswIndex (in-memory)", () => {
  it("finds the exact nearest neighbor in a small dataset", () => {
    const idx = new HnswIndex("m");
    // 3 unit vectors
    idx.insertOne("a", [1, 0, 0]);
    idx.insertOne("b", [0, 1, 0]);
    idx.insertOne("c", [0, 0, 1]);

    const results = idx.search([1, 0, 0], 1);
    expect(results[0]?.chunkId).toBe("a");
    expect(results[0]?.similarity).toBeCloseTo(1, 5);
  });

  it("returns topK results in similarity descending order", () => {
    const idx = new HnswIndex("m");
    const vecs = makeVectors(20, 8);
    vecs.forEach((v, i) => idx.insertOne(`c-${i}`, v));

    const query = vecs[0]!;
    const results = idx.search(query, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(5);
    // First result should be the query itself (similarity ≈ 1)
    expect(results[0]!.similarity).toBeCloseTo(1, 3);
    // Descending order
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.similarity).toBeLessThanOrEqual(results[i - 1]!.similarity);
    }
  });

  it("round-trips serialize/deserialize correctly", () => {
    const idx = new HnswIndex("test-model");
    const vecs = makeVectors(10, 4);
    vecs.forEach((v, i) => idx.insertOne(`chunk-${i}`, v));

    const serial = idx.serialize();
    const idx2 = HnswIndex.deserialize(serial);

    expect(idx2.modelName).toBe("test-model");
    expect(idx2.size).toBe(10);

    // Search results should match
    const q = vecs[3]!;
    const r1 = idx.search(q, 3);
    const r2 = idx2.search(q, 3);
    expect(r1[0]?.chunkId).toBe(r2[0]?.chunkId);
  });

  it("handles empty index gracefully", () => {
    const idx = new HnswIndex("m");
    expect(idx.search([1, 0], 5)).toEqual([]);
  });

  it("handles single-entry index", () => {
    const idx = new HnswIndex("m");
    idx.insertOne("only", [0.5, 0.5]);
    const r = idx.search([0.5, 0.5], 3);
    expect(r).toHaveLength(1);
    expect(r[0]?.chunkId).toBe("only");
  });

  it("returns accurate results for larger dataset (50 vectors, dim 32)", () => {
    const n = 50;
    const dim = 32;
    const vecs = makeVectors(n, dim);
    const idx = new HnswIndex("m");
    vecs.forEach((v, i) => idx.insertOne(`v${i}`, v));

    // For each of the first 5 vectors, the nearest neighbor should be itself
    for (let i = 0; i < 5; i++) {
      const r = idx.search(vecs[i]!, 1);
      expect(r[0]?.chunkId).toBe(`v${i}`);
      expect(r[0]?.similarity).toBeCloseTo(1, 3);
    }
  });

  it("uses default config when no config provided", () => {
    const idx = new HnswIndex("m");
    expect(idx.config).toEqual(DEFAULT_HNSW_CONFIG);
  });

  it("accepts custom config and uses it for build and search", () => {
    const idx = new HnswIndex("m", { m: 4, efConstruction: 32, efSearch: 16 });
    expect(idx.config.m).toBe(4);
    expect(idx.config.efConstruction).toBe(32);
    expect(idx.config.efSearch).toBe(16);

    const vecs = makeVectors(20, 8);
    vecs.forEach((v, i) => idx.insertOne(`c-${i}`, v));

    // Should still find the query itself as nearest
    const results = idx.search(vecs[0]!, 3);
    expect(results[0]?.chunkId).toBe("c-0");
    expect(results[0]?.similarity).toBeCloseTo(1, 3);
  });

  it("preserves config through serialize/deserialize round-trip", () => {
    const idx = new HnswIndex("m", { m: 8, efConstruction: 100 });
    idx.insertOne("a", [1, 0, 0]);

    const serial = idx.serialize();
    expect(serial.M).toBe(8);
    expect(serial.efConstruction).toBe(100);

    const idx2 = HnswIndex.deserialize(serial);
    expect(idx2.config.m).toBe(8);
    expect(idx2.config.efConstruction).toBe(100);
  });
});

describe("HnswIndex (file persistence)", () => {
  it("writes and reads HNSW index from disk", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dh-hnsw-test-"));
    const embeddings = makeVectors(5, 4).map((v, i) => ({
      id: `e${i}`,
      chunkId: `chunk-${i}`,
      modelName: "text-embedding-3-small",
      vector: v,
      vectorDim: 4,
      createdAt: new Date().toISOString(),
    }));

    const built = await buildAndWriteHnswIndex(repoRoot, "text-embedding-3-small", embeddings);
    expect(built.size).toBe(5);

    const loaded = await readHnswIndex(repoRoot, "text-embedding-3-small");
    expect(loaded).toBeDefined();
    expect(loaded!.size).toBe(5);

    // Sync variant
    const sync = readHnswIndexSync(repoRoot, "text-embedding-3-small");
    expect(sync).toBeDefined();
    expect(sync!.size).toBe(5);
  });

  it("writeAnnIndex also builds HNSW index (migration path)", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dh-hnsw-compat-"));
    await writeAnnIndex(repoRoot, "compat-model", [
      { id: "e1", chunkId: "c1", modelName: "compat-model", vector: [1, 0], vectorDim: 2, createdAt: "" },
    ]);

    const hnsw = await readHnswIndex(repoRoot, "compat-model");
    expect(hnsw).toBeDefined();
    expect(hnsw!.size).toBe(1);
  });

  it("returns undefined for missing HNSW file", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dh-hnsw-miss-"));
    const r = await readHnswIndex(repoRoot, "nonexistent-model");
    expect(r).toBeUndefined();
  });
});
