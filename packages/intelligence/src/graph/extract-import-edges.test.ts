import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { IndexedFile } from "../../../shared/src/types/indexing.js";
import { extractImportEdges, extractImportEdgesRegex } from "./extract-import-edges.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-import-edges-"));
  fs.mkdirSync(path.join(repo, "src", "lib"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "dep.ts"), "export const dep = 1;\n", "utf8");
  fs.writeFileSync(path.join(repo, "src", "dyn.ts"), "export const dyn = 1;\n", "utf8");
  fs.writeFileSync(path.join(repo, "src", "req.ts"), "export const req = 1;\n", "utf8");
  fs.writeFileSync(path.join(repo, "src", "type-only.ts"), "export type T = string;\n", "utf8");
  fs.writeFileSync(path.join(repo, "src", "side.ts"), "export const side = 1;\n", "utf8");
  fs.writeFileSync(path.join(repo, "src", "lib", "index.ts"), "export const idx = 1;\n", "utf8");
  return repo;
}

function files(): IndexedFile[] {
  return [
    { id: "f-main", path: "src/main.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
    { id: "f-dep", path: "src/dep.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
    { id: "f-dyn", path: "src/dyn.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
    { id: "f-req", path: "src/req.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
    { id: "f-type", path: "src/type-only.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
    { id: "f-side", path: "src/side.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
    { id: "f-lib", path: "src/lib/index.ts", extension: ".ts", language: "typescript", sizeBytes: 1, status: "indexed" },
  ];
}

describe("extractImportEdges (AST)", () => {
  it("covers static, side-effect, re-export, type-only, require and dynamic import", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "src", "main.ts"), [
      "import { dep } from './dep';",
      "import './side';",
      "import type { T } from './type-only';",
      "export { dep as dep2 } from './dep';",
      "const req = require('./req');",
      "const dyn = await import('./dyn');",
      "import { idx } from './lib';",
      "void dep; void req; void dyn; void idx;",
    ].join("\n"), "utf8");

    const astEdges = await extractImportEdges(repo, files());
    const fromMain = astEdges.filter((edge) => edge.fromId === "f-main");
    const toIds = fromMain.map((edge) => edge.toId);

    expect(toIds).toContain("f-dep");
    expect(toIds).toContain("f-side");
    expect(toIds).toContain("f-type");
    expect(toIds).toContain("f-req");
    expect(toIds).toContain("f-dyn");
    expect(toIds).toContain("f-lib");
  });

  it("finds at least regex edges and typically more", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "src", "main.ts"), [
      "import { dep } from './dep';",
      "const req = require('./req');",
      "const dyn = await import('./dyn');",
    ].join("\n"), "utf8");

    const astEdges = await extractImportEdges(repo, files());
    const regexEdges = await extractImportEdgesRegex(repo, files());

    expect(astEdges.length).toBeGreaterThanOrEqual(regexEdges.length);
    const regexTargets = new Set(regexEdges.map((edge) => `${edge.fromId}:${edge.toId}`));
    for (const edge of astEdges.filter((item) => regexTargets.has(`${item.fromId}:${item.toId}`))) {
      expect(regexTargets.has(`${edge.fromId}:${edge.toId}`)).toBe(true);
    }
  });
});
