import { describe, it, expect, afterEach } from "vitest";
import { runIndexWorkflow } from "./index-job-runner.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-index-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  // Clean up env
  const original = process.env.OPENAI_API_KEY;
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
  if (original !== undefined) process.env.OPENAI_API_KEY = original;
});

describe("runIndexWorkflow", () => {
  it("indexes a repo with TS files: scans, extracts symbols, chunks, embeds", async () => {
    delete process.env.OPENAI_API_KEY; // use mock embedder

    const repo = makeTmpRepo();
    fs.writeFileSync(
      path.join(repo, "src", "hello.ts"),
      [
        "export function greet(name: string): string {",
        "  return `Hello ${name}`;",
        "}",
        "",
        "export class Greeter {",
        "  hello() { return greet('world'); }",
        "}",
      ].join("\n"),
      "utf8",
    );

    const result = await runIndexWorkflow(repo);

    expect(result.filesScanned).toBeGreaterThanOrEqual(1);
    expect(result.symbolsExtracted).toBeGreaterThan(0);
    expect(result.callSitesExtracted).toBeGreaterThan(0);
    expect(result.chunksProduced).toBeGreaterThan(0);
    expect(result.embedding).toBeDefined();
    expect(result.embedding!.embeddingsStored).toBeGreaterThan(0);
    expect(result.summary).toContain("Indexed");
    expect(result.diagnostics.filesDiscovered).toBeGreaterThan(0);
    expect(result.diagnostics.filesRefreshed).toBeGreaterThan(0);

    // Verify DB state
    const chunksRepo = new ChunksRepo(repo);
    expect(chunksRepo.count()).toBeGreaterThan(0);

    const embRepo = new EmbeddingsRepo(repo);
    expect(embRepo.countByModel("text-embedding-3-small")).toBeGreaterThan(0);
  });

  it("skips embedding when skipEmbedding=true", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(
      path.join(repo, "src", "util.ts"),
      "export const PI = 3.14;\n",
      "utf8",
    );

    const result = await runIndexWorkflow(repo, { skipEmbedding: true });

    expect(result.filesScanned).toBeGreaterThanOrEqual(1);
    expect(result.chunksProduced).toBeGreaterThan(0);
    expect(result.callSitesExtracted).toBeGreaterThanOrEqual(0);
    expect(result.embedding).toBeUndefined();
    expect(result.summary).toContain("embeddings=skipped");
    expect(result.diagnostics.filesRefreshed).toBeGreaterThan(0);
  });

  it("returns zero counts for empty repo", async () => {
    const repo = makeTmpRepo();
    // No source files, only .dh dir

    const result = await runIndexWorkflow(repo);

    expect(result.filesScanned).toBe(0);
    expect(result.symbolsExtracted).toBe(0);
    expect(result.callSitesExtracted).toBe(0);
    expect(result.chunksProduced).toBe(0);
    expect(result.embedding).toBeUndefined();
    expect(result.diagnostics.filesDiscovered).toBe(0);
  });

  it("surfaces partial scan diagnostics and summary", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export const b = 1;\n", "utf8");

    const result = await runIndexWorkflow(repo, { scanOptions: { maxFiles: 1 }, skipEmbedding: true });

    expect(result.diagnostics.partialScan).toBe(true);
    expect(result.diagnostics.scanStopReasons).toContain("max_files_reached");
    expect(result.summary).toContain("scan=partial");
  });

  it("does not re-chunk already-indexed files unless force=true", async () => {
    delete process.env.OPENAI_API_KEY;

    const repo = makeTmpRepo();
    fs.writeFileSync(
      path.join(repo, "src", "a.ts"),
      "export function alpha() { return 1; }\n",
      "utf8",
    );

    // First run
    const first = await runIndexWorkflow(repo);
    expect(first.chunksProduced).toBeGreaterThan(0);

    // Second run without force — stable file IDs + chunk hashes mean unchanged files should skip
    const second = await runIndexWorkflow(repo);
    expect(second.chunksProduced).toBe(0);
    expect(second.diagnostics.filesUnchanged).toBeGreaterThan(0);

    // Force run should always chunk
    const third = await runIndexWorkflow(repo, { force: true });
    expect(third.chunksProduced).toBeGreaterThan(0);
    expect(third.diagnostics.filesRefreshed).toBeGreaterThan(0);
  });

  it("refreshes changed files without force when content differs", async () => {
    delete process.env.OPENAI_API_KEY;

    const repo = makeTmpRepo();
    const filePath = path.join(repo, "src", "a.ts");
    fs.writeFileSync(filePath, "export function alpha() { return 1; }\n", "utf8");

    const first = await runIndexWorkflow(repo);
    expect(first.chunksProduced).toBeGreaterThan(0);

    fs.writeFileSync(filePath, "export function alpha() { return 2; }\n", "utf8");
    const second = await runIndexWorkflow(repo);

    expect(second.chunksProduced).toBeGreaterThan(0);
    const chunksRepo = new ChunksRepo(repo);
    const chunks = chunksRepo.listAll();
    expect(chunks.some((chunk) => chunk.content.includes("return 2"))).toBe(true);
  });
});
