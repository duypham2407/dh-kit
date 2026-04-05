import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { extractCallEdges } from "./extract-call-edges.js";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";

describe("extractCallEdges", () => {
  it("extracts basic call edges between indexed functions", async () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dh-call-edges-"));
    const filePath = path.join(repoRoot, "a.ts");
    fs.writeFileSync(filePath, `function alpha() { beta() }\nfunction beta() {}`);

    const files: IndexedFile[] = [
      { id: "file-1", path: "a.ts", extension: ".ts", language: "typescript", sizeBytes: 10, status: "indexed" },
    ];
    const symbols: IndexedSymbol[] = [
      { id: "sym-1", fileId: "file-1", name: "alpha", kind: "function", lineStart: 1, lineEnd: 1 },
      { id: "sym-2", fileId: "file-1", name: "beta", kind: "function", lineStart: 2, lineEnd: 2 },
    ];

    const edges = await extractCallEdges(repoRoot, files, symbols);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ fromId: "sym-1", toId: "sym-2", kind: "call" });
  });
});
