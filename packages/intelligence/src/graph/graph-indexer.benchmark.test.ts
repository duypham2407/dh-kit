import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { GraphIndexer } from "./graph-indexer.js";
import { GraphRepo, hashContent } from "../../../storage/src/sqlite/repositories/graph-repo.js";

let tmpDirs: string[] = [];

function makeRepo(fileCount = 120): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-graph-bench-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });

  for (let i = 0; i < fileCount; i++) {
    const next = i + 1;
    const importLine = next < fileCount ? `import { fn${next} } from './m${next}';\n` : "";
    const body = next < fileCount ? `return fn${next}() + ${i};` : `return ${i};`;
    fs.writeFileSync(
      path.join(repo, "src", `m${i}.ts`),
      `${importLine}export function fn${i}(){ ${body} }\n`,
      "utf8",
    );
  }

  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("GraphIndexer benchmark", () => {
  it("captures full vs incremental indexing latency", async () => {
    const repo = makeRepo(120);
    const indexer = new GraphIndexer(repo);

    const full = await indexer.indexProject({ force: true });

    const touched = path.join(repo, "src", "m40.ts");
    fs.writeFileSync(
      touched,
      "import { fn41 } from './m41';\nexport function fn40(){ return fn41() + 4000; }\n",
      "utf8",
    );
    const incremental = await indexer.indexProject();

    // eslint-disable-next-line no-console
    console.log(
      `[graph-indexer-benchmark] full_ms=${full.durationMs} full_indexed=${full.filesIndexed} incremental_ms=${incremental.durationMs} incremental_indexed=${incremental.filesIndexed} incremental_skipped=${incremental.filesSkipped}`,
    );

    expect(full.filesScanned).toBeGreaterThanOrEqual(100);
    expect(full.filesIndexed).toBeGreaterThanOrEqual(100);
    expect(incremental.filesIndexed).toBeGreaterThanOrEqual(1);
    expect(incremental.filesIndexed).toBeLessThan(full.filesIndexed);
  });

  it("keeps node parse status and content hash consistent on persistence failure", async () => {
    const repo = makeRepo(8);
    const indexer = new GraphIndexer(repo);

    const first = await indexer.indexProject({ force: true });
    expect(first.filesIndexed).toBeGreaterThanOrEqual(8);

    const brokenPath = path.join(repo, "src", "m0.ts");
    const brokenSource = "export function broken(){ return 999; }\n";
    fs.writeFileSync(brokenPath, brokenSource, "utf8");

    const replaceAllSpy = vi
      .spyOn(GraphRepo.prototype, "replaceAllForNode")
      .mockImplementationOnce(() => {
        throw new Error("simulated persistence failure");
      });

    const second = await indexer.indexProject();
    expect(second.filesIndexed).toBeGreaterThanOrEqual(0);
    expect(replaceAllSpy).toHaveBeenCalled();
    replaceAllSpy.mockRestore();

    const graph = new GraphRepo(repo);
    const brokenNode = graph.findNodeByPath("src/m0.ts");
    expect(brokenNode).toBeDefined();
    expect(brokenNode!.parseStatus).toBe("error");
    expect(brokenNode!.contentHash).toBe(hashContent(brokenSource));

    const calls = graph.findCallsByNode(brokenNode!.id);
    const refs = graph.findReferencesByNode(brokenNode!.id);
    expect(Array.isArray(calls)).toBe(true);
    expect(Array.isArray(refs)).toBe(true);
  });
});
