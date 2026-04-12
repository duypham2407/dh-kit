import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { recordTelemetry, readTelemetryEvents, summarizeTelemetry } from "./telemetry-collector.js";
import { persistChunks, createEmbeddingProvider, embedAndPersist, runEmbeddingPipeline } from "./embedding-pipeline.js";
import { semanticSearch } from "./semantic-search.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-telemetry-test-"));
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

describe("telemetry-collector", () => {
  it("records and reads telemetry events", () => {
    const repo = makeTmpRepo();

    recordTelemetry(repo, {
      kind: "embedding_pipeline",
      metrics: {
        durationMs: 42,
        chunksInput: 5,
        chunksEmbedded: 3,
        chunksSkipped: 2,
        totalTokens: 100,
        avgTokensPerChunk: 33.33,
        modelName: "test-model",
        usedMockProvider: true,
      },
    });

    recordTelemetry(repo, {
      kind: "semantic_search",
      metrics: {
        durationMs: 7,
        strategy: "db_scan",
        resultCount: 2,
        topK: 10,
        minSimilarity: 0.25,
        modelName: "test-model",
      },
    });

    const events = readTelemetryEvents(repo);
    expect(events).toHaveLength(2);
    expect(events[0]!.kind).toBe("embedding_pipeline");
    expect(events[0]!.timestamp).toBeDefined();
    expect(events[1]!.kind).toBe("semantic_search");
  });

  it("returns empty array for missing file", () => {
    const repo = makeTmpRepo();
    const events = readTelemetryEvents(repo);
    expect(events).toEqual([]);
  });

  it("summarizes telemetry correctly", () => {
    const repo = makeTmpRepo();

    // Record some events
    recordTelemetry(repo, {
      kind: "embedding_pipeline",
      metrics: {
        durationMs: 100,
        chunksInput: 10,
        chunksEmbedded: 8,
        chunksSkipped: 2,
        totalTokens: 200,
        avgTokensPerChunk: 25,
        modelName: "m",
        usedMockProvider: true,
      },
    });

    recordTelemetry(repo, {
      kind: "embedding_pipeline",
      metrics: {
        durationMs: 50,
        chunksInput: 5,
        chunksEmbedded: 5,
        chunksSkipped: 0,
        totalTokens: 100,
        avgTokensPerChunk: 20,
        modelName: "m",
        usedMockProvider: true,
      },
    });

    recordTelemetry(repo, {
      kind: "ann_build",
      metrics: { durationMs: 30, vectorCount: 13, modelName: "m" },
    });

    recordTelemetry(repo, {
      kind: "semantic_search",
      metrics: { durationMs: 5, strategy: "hnsw", resultCount: 3, topK: 10, minSimilarity: 0.25, modelName: "m" },
    });

    recordTelemetry(repo, {
      kind: "semantic_search",
      metrics: { durationMs: 15, strategy: "db_scan", resultCount: 1, topK: 5, minSimilarity: 0, modelName: "m" },
    });

    recordTelemetry(repo, {
      kind: "semantic_path_unresolved",
      details: {
        chunkId: "chunk-1",
        filePath: "../legacy/a.ts",
        originalFilePath: "../legacy/a.ts",
      },
    });

    recordTelemetry(repo, {
      kind: "evidence_path_unresolved",
      details: {
        filePath: "../legacy/a.ts",
        normalizedFilePath: null,
        sourceTool: "semantic_search",
        failureKind: "normalization_failed",
      },
    });

    const summary = summarizeTelemetry(repo);

    expect(summary.totalEvents).toBe(7);
    expect(summary.embeddingPipeline.runs).toBe(2);
    expect(summary.embeddingPipeline.totalTokens).toBe(300);
    expect(summary.embeddingPipeline.totalChunksEmbedded).toBe(13);
    expect(summary.embeddingPipeline.totalDurationMs).toBe(150);
    expect(summary.embeddingPipeline.avgDurationMs).toBe(75);

    expect(summary.annBuild.runs).toBe(1);
    expect(summary.annBuild.totalDurationMs).toBe(30);

    expect(summary.semanticSearch.queries).toBe(2);
    expect(summary.semanticSearch.totalDurationMs).toBe(20);
    expect(summary.semanticSearch.strategyBreakdown["hnsw"]).toBe(1);
    expect(summary.semanticSearch.strategyBreakdown["db_scan"]).toBe(1);
    expect(summary.unresolvedPaths.semantic).toBe(1);
    expect(summary.unresolvedPaths.evidence).toBe(1);
  });
});

describe("telemetry integration with pipeline", () => {
  it("embedAndPersist records telemetry event", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();
    const chunks = persistChunks(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "hello world", language: "typescript" },
    ]);

    await embedAndPersist(repo, chunks, provider);

    const events = readTelemetryEvents(repo);
    const pipelineEvents = events.filter((e) => e.kind === "embedding_pipeline");
    expect(pipelineEvents).toHaveLength(1);
    expect(pipelineEvents[0]!.metrics).toMatchObject({
      chunksInput: 1,
      chunksEmbedded: 1,
      chunksSkipped: 0,
      modelName: "text-embedding-3-small",
      usedMockProvider: true,
    });
    expect(pipelineEvents[0]!.metrics.durationMs).toBeGreaterThanOrEqual(0);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("semanticSearch records telemetry event", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();
    const chunks = persistChunks(repo, [
      { fileId: "f1", filePath: "a.ts", lineStart: 1, lineEnd: 5, content: "function doAuth() {}", language: "typescript" },
    ]);
    await embedAndPersist(repo, chunks, provider);

    await semanticSearch(repo, "auth", { minSimilarity: -1 }, provider);

    const events = readTelemetryEvents(repo);
    const searchEvents = events.filter((e) => e.kind === "semantic_search");
    expect(searchEvents).toHaveLength(1);
    expect(searchEvents[0]!.metrics.strategy).toBe("db_scan");
    expect(searchEvents[0]!.metrics.resultCount).toBeGreaterThanOrEqual(0);
    expect(searchEvents[0]!.metrics.durationMs).toBeGreaterThanOrEqual(0);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });

  it("runEmbeddingPipeline records both pipeline and ann_build events", async () => {
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const repo = makeTmpRepo();
    const provider = createEmbeddingProvider();

    await runEmbeddingPipeline(repo, [
      { fileId: "f1", filePath: "x.ts", lineStart: 1, lineEnd: 5, content: "const x = 1;", language: "typescript" },
    ], provider);

    const events = readTelemetryEvents(repo);
    expect(events.some((e) => e.kind === "embedding_pipeline")).toBe(true);
    expect(events.some((e) => e.kind === "ann_build")).toBe(true);

    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  });
});
