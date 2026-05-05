import { describe, it, expect, afterEach } from "vitest";
import { runIndexWorkflow } from "./index-job-runner.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { GRAPH_AST_ENGINE_ENV_VAR } from "../../../shared/src/utils/graph-engine-selector.js";

let tmpDirs: string[] = [];
const originalGraphAstEngine = process.env[GRAPH_AST_ENGINE_ENV_VAR];

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
  if (originalGraphAstEngine === undefined) {
    delete process.env[GRAPH_AST_ENGINE_ENV_VAR];
  } else {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = originalGraphAstEngine;
  }
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
    expect(result.edgesExtracted).toBe(0);
    expect(result.callSitesExtracted).toBe(0);
    expect(result.chunksProduced).toBeGreaterThan(0);
    expect(result.embedding).toBeDefined();
    expect(result.embedding!.embeddingsStored).toBeGreaterThan(0);
    expect(result.summary).toContain("Indexed");
    expect(result.summary).toContain("graph=degraded(rust_indexer_report_not_available_at_runtime_job_boundary)");
    expect(result.summary).toContain("graph_engine=rust:default_rust");
    expect(result.summary).toContain("operator-safety=");
    expect(result.diagnostics.filesDiscovered).toBeGreaterThan(0);
    expect(result.diagnostics.filesRefreshed).toBeGreaterThan(0);
    expect(result.diagnostics.graphExtraction).toMatchObject({
      available: false,
      source: "degraded_unavailable_adapter",
      reason: "rust_indexer_report_not_available_at_runtime_job_boundary",
      counts: {
        edgesExtracted: 0,
        importEdgesExtracted: 0,
        callEdgesExtracted: 0,
        callSitesExtracted: 0,
        referencesExtracted: 0,
      },
      runtimeBehavior: "rust_first_unavailable",
      engineSelector: {
        engine: "rust",
        label: "default_rust",
        runsTypeScriptExtraction: false,
      },
    });
    expect(result.diagnostics.operatorSafety.allowed).toBe(true);
    expect(result.diagnostics.operatorSafety.blockingCount).toBe(0);

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
    expect(result.diagnostics.graphExtraction.available).toBe(false);
    expect(result.embedding).toBeUndefined();
    expect(result.summary).toContain("embeddings=skipped");
    expect(result.diagnostics.filesRefreshed).toBeGreaterThan(0);
    expect(result.diagnostics.operatorSafety.allowed).toBe(true);
  });

  it("returns zero counts for empty repo", async () => {
    const repo = makeTmpRepo();
    // No source files, only .dh dir

    const result = await runIndexWorkflow(repo);

    expect(result.filesScanned).toBe(0);
    expect(result.symbolsExtracted).toBe(0);
    expect(result.callSitesExtracted).toBe(0);
    expect(result.diagnostics.graphExtraction.available).toBe(false);
    expect(result.chunksProduced).toBe(0);
    expect(result.embedding).toBeUndefined();
    expect(result.diagnostics.filesDiscovered).toBe(0);
    expect(result.diagnostics.operatorSafety.allowed).toBe(true);
  });

  it("surfaces partial scan diagnostics and summary", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export const b = 1;\n", "utf8");

    const result = await runIndexWorkflow(repo, {
      scanOptions: { maxFiles: 1, includeExtensions: [".ts"] },
      skipEmbedding: true,
    });

    expect(result.diagnostics.partialScan).toBe(true);
    expect(result.diagnostics.partialWorkspaceCount).toBe(1);
    expect(result.diagnostics.scanStopReasons).toContain("max_files_reached");
    expect(result.summary).toContain("scan=partial(1/1 workspaces:max_files_reached)");
    expect(result.summary).toContain("operator-safety=allow");
    expect(result.summary).toContain("workspaces=1");
    expect(result.diagnostics.workspaceCount).toBe(1);
    expect(result.diagnostics.workspaceCoverage[0]?.partial).toBe(true);
    expect(result.diagnostics.workspaceCoverage[0]?.stopReason).toBe("max_files_reached");
  });

  it("allows segmented workspace diagnostics when one workspace is partial and another is complete", async () => {
    const repo = makeTmpRepo();
    const partialWorkspace = path.join(repo, "packages", "partial");
    const completeWorkspace = path.join(repo, "packages", "complete");
    fs.mkdirSync(path.join(partialWorkspace, "src"), { recursive: true });
    fs.mkdirSync(path.join(completeWorkspace, "src"), { recursive: true });
    fs.writeFileSync(path.join(partialWorkspace, "package.json"), "{\"name\":\"partial\"}\n", "utf8");
    fs.writeFileSync(path.join(completeWorkspace, "package.json"), "{\"name\":\"complete\"}\n", "utf8");
    fs.writeFileSync(path.join(partialWorkspace, "src", "a.ts"), "export const a = 1;\n", "utf8");
    fs.writeFileSync(path.join(partialWorkspace, "src", "b.ts"), "export const b = 1;\n", "utf8");
    fs.writeFileSync(path.join(completeWorkspace, "src", "notes.txt"), "not indexable in this run\n", "utf8");

    const result = await runIndexWorkflow(repo, {
      scanOptions: { maxFiles: 1, includeExtensions: [".ts"] },
      skipEmbedding: true,
    });

    expect(result.diagnostics.workspaceCount).toBe(2);
    expect(result.diagnostics.partialScan).toBe(true);
    expect(result.diagnostics.partialWorkspaceCount).toBe(1);
    expect(result.diagnostics.workspaceCoverage).toEqual(expect.arrayContaining([
      expect.objectContaining({ root: partialWorkspace, partial: true, stopReason: "max_files_reached" }),
      expect.objectContaining({ root: completeWorkspace, partial: false, stopReason: "none" }),
    ]));
    expect(result.diagnostics.operatorSafety.allowed).toBe(true);
    expect(result.diagnostics.operatorSafety.blockingCount).toBe(0);
    expect(result.summary).toContain("scan=partial(1/2 workspaces:max_files_reached)");
    expect(result.summary).toContain("operator-safety=allow");
    expect(result.summary).toContain("workspaces=2");
  });

  it("keeps check-mode safety advisory and does not abort indexing", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const a = 1;\n", "utf8");

    const result = await runIndexWorkflow(repo, { skipEmbedding: true });

    expect(result.filesScanned).toBeGreaterThan(0);
    expect(result.diagnostics.operatorSafety.mode).toBe("check");
    expect(result.summary).toContain("operator-safety=");
  });

  it("reports unavailable Rust graph data instead of fabricating edge counts", async () => {
    const repo = makeTmpRepo();
    fs.writeFileSync(
      path.join(repo, "src", "graph.ts"),
      [
        "import { value } from './value';",
        "export function callValue() { return value(); }",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(
      path.join(repo, "src", "value.ts"),
      "export function value() { return 1; }\n",
      "utf8",
    );

    const result = await runIndexWorkflow(repo, { skipEmbedding: true });

    expect(result.edgesExtracted).toBe(0);
    expect(result.callSitesExtracted).toBe(0);
    expect(result.diagnostics.graphExtraction).toMatchObject({
      available: false,
      source: "degraded_unavailable_adapter",
      reason: "rust_indexer_report_not_available_at_runtime_job_boundary",
      runtimeBehavior: "rust_first_unavailable",
      engineSelector: {
        engine: "rust",
        label: "default_rust",
        runsTypeScriptExtraction: false,
      },
    });
  });

  it("labels ts selector as rollback-only and does not run legacy TypeScript graph extraction", async () => {
    process.env[GRAPH_AST_ENGINE_ENV_VAR] = "ts";
    const repo = makeTmpRepo();
    fs.writeFileSync(
      path.join(repo, "src", "graph.ts"),
      [
        "import { value } from './value';",
        "export function callValue() { return value(); }",
      ].join("\n"),
      "utf8",
    );
    fs.writeFileSync(path.join(repo, "src", "value.ts"), "export function value() { return 1; }\n", "utf8");

    const result = await runIndexWorkflow(repo, { skipEmbedding: true });

    expect(result.edgesExtracted).toBe(0);
    expect(result.callSitesExtracted).toBe(0);
    expect(result.summary).toContain("graph=degraded(ts_graph_engine_requires_explicit_rollback_rehearsal_context)");
    expect(result.summary).toContain("graph_engine=ts:explicit_ts_rollback_only");
    expect(result.diagnostics.graphExtraction).toMatchObject({
      available: false,
      degraded: true,
      reason: "ts_graph_engine_requires_explicit_rollback_rehearsal_context",
      runtimeBehavior: "ts_rollback_context_required",
      engineSelector: {
        engine: "ts",
        label: "explicit_ts_rollback_only",
        runsTypeScriptExtraction: false,
      },
    });
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
