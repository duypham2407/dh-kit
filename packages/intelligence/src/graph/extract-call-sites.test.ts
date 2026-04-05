import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createId } from "../../../shared/src/utils/ids.js";
import { extractCallSites } from "./extract-call-sites.js";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-call-sites-test-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  return repo;
}

describe("extractCallSites", () => {
  it("extracts call sites for known symbols", async () => {
    const repo = makeRepo();
    const filePath = path.join(repo, "src", "main.ts");
    fs.writeFileSync(filePath, "function helper() { return 1; }\nconst x = helper();\n", "utf8");

    const file: IndexedFile = {
      id: createId("file"),
      path: "src/main.ts",
      extension: ".ts",
      language: "typescript",
      sizeBytes: 64,
      status: "indexed",
    };
    const symbol: IndexedSymbol = {
      id: createId("symbol"),
      fileId: file.id,
      name: "helper",
      kind: "function",
      lineStart: 1,
      lineEnd: 1,
    };

    const callSites = await extractCallSites(repo, [file], [symbol]);
    expect(callSites.some((site) => site.symbolName === "helper")).toBe(true);
  });
});
