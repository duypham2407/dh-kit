import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { GraphRepo } from "./graph-repo.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-graph-repo-"));
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

describe("GraphRepo", () => {
  it("persists nodes/edges/symbols/references/calls and queries them", () => {
    const repoRoot = makeTmpRepo();
    const repo = new GraphRepo(repoRoot);

    const from = repo.upsertNode({ path: "src/a.ts", language: "typescript", parseStatus: "ok", contentHash: "h1", mtime: 100 });
    const to = repo.upsertNode({ path: "src/b.ts", language: "typescript", parseStatus: "ok", contentHash: "h2", mtime: 101 });

    const replaced = repo.replaceAllForNode({
      nodeId: from.id,
      edges: [{ toNodeId: to.id, edgeType: "import", line: 1 }],
      symbols: [{
        name: "alpha",
        kind: "function",
        isExport: true,
        line: 1,
        startLine: 1,
        endLine: 5,
        signature: "function alpha()",
        docComment: null,
        scope: "module",
      }],
      references: [],
      calls: [],
    });

    const alpha = replaced.symbols[0]!;
    repo.replaceReferencesForNode(to.id, [{ symbolId: alpha.id, line: 2, col: 4, kind: "usage" }]);
    repo.replaceCallsForNode(to.id, [{
      callerSymbolId: alpha.id,
      calleeName: "alpha",
      calleeNodeId: from.id,
      calleeSymbolId: alpha.id,
      line: 3,
    }]);

    expect(repo.findDependencies(from.id).map((node) => node.path)).toContain("src/b.ts");
    expect(repo.findDependents(to.id).map((node) => node.path)).toContain("src/a.ts");
    expect(repo.findSymbolsByNode(from.id).map((symbol) => symbol.name)).toContain("alpha");
    expect(repo.findSymbolByName("alpha")).toHaveLength(1);
    expect(repo.findReferencesBySymbol(alpha.id)).toHaveLength(1);
    expect(repo.findCallees(alpha.id)).toHaveLength(1);
    expect(repo.findCallers(alpha.id)).toHaveLength(1);
  });

  it("cascades delete from graph_nodes to all graph_* tables", () => {
    const repoRoot = makeTmpRepo();
    const repo = new GraphRepo(repoRoot);

    const from = repo.upsertNode({ path: "src/a.ts", language: "typescript", parseStatus: "ok", contentHash: "h1", mtime: 100 });
    const to = repo.upsertNode({ path: "src/b.ts", language: "typescript", parseStatus: "ok", contentHash: "h2", mtime: 101 });

    const { symbols } = repo.replaceAllForNode({
      nodeId: from.id,
      edges: [{ toNodeId: to.id, edgeType: "import", line: 1 }],
      symbols: [{
        name: "alpha",
        kind: "function",
        isExport: true,
        line: 1,
        startLine: 1,
        endLine: 2,
        signature: null,
        docComment: null,
        scope: null,
      }],
      references: [],
      calls: [],
    });
    const alpha = symbols[0]!;
    repo.replaceReferencesForNode(to.id, [{ symbolId: alpha.id, line: 2, col: 1, kind: "usage" }]);
    repo.replaceCallsForNode(from.id, [{ callerSymbolId: alpha.id, calleeName: "alpha", calleeNodeId: from.id, calleeSymbolId: alpha.id, line: 3 }]);

    repo.deleteNode(from.id);

    expect(repo.findNodeById(from.id)).toBeUndefined();
    expect(repo.findEdgesFromNode(from.id)).toHaveLength(0);
    expect(repo.findSymbolsByNode(from.id)).toHaveLength(0);
    expect(repo.findReferencesBySymbol(alpha.id)).toHaveLength(0);
    expect(repo.findCallsByNode(from.id)).toHaveLength(0);
  });
});
