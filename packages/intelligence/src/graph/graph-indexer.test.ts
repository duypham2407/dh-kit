import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { GraphRepo } from "../../../storage/src/sqlite/repositories/graph-repo.js";
import { GraphIndexer } from "./graph-indexer.js";
import * as workspaceScan from "../workspace/detect-projects.js";

let tmpDirs: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-graph-indexer-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("GraphIndexer", () => {
  it("indexes project and populates graph tables", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "src", "a.ts"), "import { b } from './b';\nfunction localOnly(){ return 0; }\nexport function a(){ return b() + localOnly(); }\n", "utf8");
    fs.writeFileSync(path.join(repo, "src", "b.ts"), "export function b(){ return 1; }\n", "utf8");

    const indexer = new GraphIndexer(repo);
    const stats = await indexer.indexProject();
    expect(stats.filesScanned).toBeGreaterThanOrEqual(2);
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(2);

    const graph = new GraphRepo(repo);
    const nodes = graph.listNodes();
    expect(nodes.length).toBeGreaterThanOrEqual(2);
    const aNode = nodes.find((node) => node.path === "src/a.ts");
    expect(aNode).toBeDefined();
    const aSymbols = graph.findSymbolsByNode(aNode!.id);
    expect(aSymbols.length).toBeGreaterThan(0);
    const exportedA = aSymbols.find((symbol) => symbol.name === "a");
    const localOnly = aSymbols.find((symbol) => symbol.name === "localOnly");
    expect(exportedA?.isExport).toBe(true);
    expect(localOnly?.isExport).toBe(false);
    expect(graph.findEdgesFromNode(aNode!.id).length).toBeGreaterThan(0);
  });

  it("supports incremental indexing and delete handling", async () => {
    const repo = makeRepo();
    const aPath = path.join(repo, "src", "a.ts");
    const bPath = path.join(repo, "src", "b.ts");
    fs.writeFileSync(aPath, "export function a(){ return 1; }\n", "utf8");
    fs.writeFileSync(bPath, "export function b(){ return 2; }\n", "utf8");

    const indexer = new GraphIndexer(repo);
    await indexer.indexProject();
    const second = await indexer.indexProject();
    expect(second.filesSkipped).toBeGreaterThanOrEqual(2);

    fs.writeFileSync(aPath, "export function a(){ return 3; }\n", "utf8");
    const third = await indexer.indexProject();
    expect(third.filesIndexed).toBeGreaterThanOrEqual(1);

    fs.unlinkSync(bPath);
    const fourth = await indexer.indexProject();
    expect(fourth.filesDeleted).toBeGreaterThanOrEqual(1);
  });

  it("does not delete existing nodes when scan is partial", async () => {
    const repo = makeRepo();
    const aPath = path.join(repo, "src", "a.ts");
    const bPath = path.join(repo, "src", "b.ts");
    fs.writeFileSync(aPath, "export function a(){ return 1; }\n", "utf8");
    fs.writeFileSync(bPath, "export function b(){ return 2; }\n", "utf8");

    const indexer = new GraphIndexer(repo);
    await indexer.indexProject();

    const scanSpy = vi.spyOn(workspaceScan, "detectProjects").mockResolvedValue([
      {
        root: repo,
        type: "node",
        files: [
          {
            id: "file-a",
            path: "src/a.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 10,
            status: "indexed",
          },
        ],
        scanMeta: { partial: true },
        diagnostics: {
          filesVisited: 1,
          filesIndexed: 1,
          filesIgnored: 0,
          dirsSkipped: 0,
          errors: 0,
          stopReason: "max_files_reached",
        },
      },
    ]);

    const partial = await indexer.indexProject();
    expect(partial.filesDeleted).toBe(0);

    const graph = new GraphRepo(repo);
    const nodePaths = graph.listNodes().map((node) => node.path);
    expect(nodePaths).toContain("src/a.ts");
    expect(nodePaths).toContain("src/b.ts");

    scanSpy.mockRestore();
  });

  it("indexes segmented workspace files using workspaceRoot-aware paths", async () => {
    const repo = makeRepo();
    const workspaceRoot = path.join(repo, "packages", "app");
    fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, "src", "a.ts"), "export function a(){ return 1; }\n", "utf8");

    const scanSpy = vi.spyOn(workspaceScan, "detectProjects").mockResolvedValue([
      {
        root: workspaceRoot,
        type: "node",
        files: [
          {
            id: "seg-a",
            path: "src/a.ts",
            extension: ".ts",
            language: "typescript",
            sizeBytes: 10,
            status: "indexed",
            workspaceRoot,
          },
        ],
        scanMeta: { partial: false },
        diagnostics: {
          filesVisited: 1,
          filesIndexed: 1,
          filesIgnored: 0,
          dirsSkipped: 0,
          errors: 0,
          stopReason: "none",
        },
      },
    ]);

    const indexer = new GraphIndexer(repo);
    const stats = await indexer.indexProject();
    expect(stats.filesIndexed).toBeGreaterThanOrEqual(1);

    const graph = new GraphRepo(repo);
    const nodePaths = graph.listNodes().map((node) => node.path);
    expect(nodePaths).toContain("packages/app/src/a.ts");

    scanSpy.mockRestore();
  });
});
