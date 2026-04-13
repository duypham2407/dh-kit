import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { recordTelemetry } from "./telemetry-collector.js";
import { classifyHistoricalChunkPaths, runHistoricalChunkCleanup } from "./historical-chunk-cleanup.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-historical-cleanup-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "auth.ts"), "export function auth() {}\n", "utf8");
  fs.writeFileSync(path.join(dir, "src", "ok.ts"), "export const ok = true\n", "utf8");
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("historical chunk cleanup", () => {
  it("classifies rows into canonical, deterministic-convertible, unresolved", () => {
    const repoRoot = makeTmpRepo();
    const chunks = new ChunksRepo(repoRoot);

    chunks.save({
      fileId: "f-canonical",
      filePath: "src/ok.ts",
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "ok",
      contentHash: "h-ok",
      tokenEstimate: 1,
      language: "ts",
    });
    chunks.save({
      fileId: "f-convertible",
      filePath: path.join(repoRoot, "src", "auth.ts"),
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "auth",
      contentHash: "h-auth",
      tokenEstimate: 1,
      language: "ts",
    });
    chunks.save({
      fileId: "f-unresolved",
      filePath: "../legacy/missing.ts",
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "legacy",
      contentHash: "h-legacy",
      tokenEstimate: 1,
      language: "ts",
    });

    const summary = classifyHistoricalChunkPaths(repoRoot);
    expect(summary.rowsScanned).toBe(3);
    expect(summary.telemetryFlaggedRows).toBe(0);
    expect(summary.canonicalRows).toBe(1);
    expect(summary.deterministicConvertibleRows).toBe(1);
    expect(summary.unresolvedRows).toBe(1);
  });

  it("dry-run reports impact without mutating storage", () => {
    const repoRoot = makeTmpRepo();
    const chunks = new ChunksRepo(repoRoot);
    const convertible = chunks.save({
      fileId: "f-convertible",
      filePath: path.join(repoRoot, "src", "auth.ts"),
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "auth",
      contentHash: "h-auth-dry",
      tokenEstimate: 1,
      language: "ts",
    });
    chunks.save({
      fileId: "f-unresolved",
      filePath: "../legacy/missing.ts",
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "legacy",
      contentHash: "h-legacy-dry",
      tokenEstimate: 1,
      language: "ts",
    });

    recordTelemetry(repoRoot, {
      kind: "semantic_path_unresolved",
      details: { chunkId: "legacy", filePath: "../legacy/missing.ts", originalFilePath: "../legacy/missing.ts" },
    });
    recordTelemetry(repoRoot, {
      kind: "semantic_path_unresolved",
      details: {
        chunkId: convertible.id,
        filePath: path.join(repoRoot, "src", "auth.ts"),
        originalFilePath: path.join(repoRoot, "src", "auth.ts"),
      },
    });

    const report = runHistoricalChunkCleanup(repoRoot, {
      mode: "dry-run",
      observationWindow: {},
      batchSize: 10,
      exampleLimit: 3,
    });

    expect(report.updatedRows).toBe(0);
    expect(report.deterministicRowsEligibleForApply).toBe(1);
    expect(report.deterministicRowsUpdated).toBe(0);
    expect(report.deterministicRowsNotUpdated).toBe(1);
    expect(report.storageBefore.deterministicConvertibleRows).toBe(1);
    expect(report.storageBefore.telemetryFlaggedDeterministicConvertibleRows).toBe(1);
    expect(report.storageBefore.unresolvedRows).toBe(1);
    expect(new ChunksRepo(repoRoot).findById(convertible.id)!.filePath).toBe(path.join(repoRoot, "src", "auth.ts"));
  });

  it("apply updates deterministic rows only and keeps unresolved unchanged", () => {
    const repoRoot = makeTmpRepo();
    const chunks = new ChunksRepo(repoRoot);
    const convertible = chunks.save({
      fileId: "f-convertible",
      filePath: path.join(repoRoot, "src", "auth.ts"),
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "auth",
      contentHash: "h-auth-apply",
      tokenEstimate: 1,
      language: "ts",
    });
    const unresolved = chunks.save({
      fileId: "f-unresolved",
      filePath: "../legacy/missing.ts",
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "legacy",
      contentHash: "h-legacy-apply",
      tokenEstimate: 1,
      language: "ts",
    });

    const emb = new EmbeddingsRepo(repoRoot);
    emb.save({ chunkId: convertible.id, modelName: "m", vector: [1], vectorDim: 1 });
    emb.save({ chunkId: unresolved.id, modelName: "m", vector: [2], vectorDim: 1 });

    recordTelemetry(repoRoot, {
      kind: "semantic_path_unresolved",
      details: {
        chunkId: convertible.id,
        filePath: path.join(repoRoot, "src", "auth.ts"),
        originalFilePath: path.join(repoRoot, "src", "auth.ts"),
      },
    });
    recordTelemetry(repoRoot, {
      kind: "semantic_path_unresolved",
      details: {
        chunkId: unresolved.id,
        filePath: "../legacy/missing.ts",
        originalFilePath: "../legacy/missing.ts",
      },
    });

    const report = runHistoricalChunkCleanup(repoRoot, {
      mode: "apply",
      observationWindow: {},
      batchSize: 1,
      exampleLimit: 3,
    });

    expect(report.updatedRows).toBe(1);
    expect(report.deterministicRowsEligibleForApply).toBe(1);
    expect(report.deterministicRowsUpdated).toBe(1);
    expect(report.deterministicRowsNotUpdated).toBe(0);
    expect(new ChunksRepo(repoRoot).findById(convertible.id)!.filePath).toBe("src/auth.ts");
    expect(new ChunksRepo(repoRoot).findById(unresolved.id)!.filePath).toBe("../legacy/missing.ts");
    expect(report.storageAfter.deterministicConvertibleRows).toBe(0);
    expect(report.storageAfter.unresolvedRows).toBeGreaterThanOrEqual(1);
    expect(report.orphanedEmbeddingsAfter).toBe(0);
  });

  it("apply still updates deterministic-convertible rows that are not telemetry-flagged", () => {
    const repoRoot = makeTmpRepo();
    const chunks = new ChunksRepo(repoRoot);

    const convertibleNotFlagged = chunks.save({
      fileId: "f-convertible-not-flagged",
      filePath: path.join(repoRoot, "src", "auth.ts"),
      symbolId: undefined,
      lineStart: 1,
      lineEnd: 1,
      content: "auth2",
      contentHash: "h-auth-not-flagged",
      tokenEstimate: 1,
      language: "ts",
    });

    const report = runHistoricalChunkCleanup(repoRoot, {
      mode: "apply",
      observationWindow: {},
      batchSize: 10,
      exampleLimit: 3,
    });

    expect(report.storageBefore.telemetryFlaggedRows).toBe(0);
    expect(report.storageBefore.deterministicConvertibleRows).toBe(1);
    expect(report.storageBefore.telemetryFlaggedDeterministicConvertibleRows).toBe(0);
    expect(report.deterministicRowsEligibleForApply).toBe(1);
    expect(report.updatedRows).toBe(1);
    expect(new ChunksRepo(repoRoot).findById(convertibleNotFlagged.id)!.filePath).toBe("src/auth.ts");
  });
});
