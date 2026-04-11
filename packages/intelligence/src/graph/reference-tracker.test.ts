import { describe, expect, it } from "vitest";
import { parseSource } from "../parser/tree-sitter-init.js";
import { extractSymbolReferencesFromTree } from "./reference-tracker.js";
import type { GraphSymbol } from "../../../shared/src/types/graph.js";

describe("extractSymbolReferencesFromTree", () => {
  it("tracks usage refs and reduces local shadowing false positives", async () => {
    const src = [
      "import { dep } from './dep';",
      "type T = dep;",
      "function run() {",
      "  const dep = 1;",
      "  return dep;",
      "}",
      "console.log(dep);",
    ].join("\n");

    const tree = await parseSource("typescript", src);
    const depSymbol: GraphSymbol = {
      id: "dep-sym",
      nodeId: "dep-node",
      name: "dep",
      kind: "const",
      isExport: true,
      line: 1,
      startLine: 1,
      endLine: 1,
      signature: null,
      docComment: null,
      scope: null,
    };

    const refs = extractSymbolReferencesFromTree({
      root: tree.rootNode,
      importedSymbolMap: new Map([["dep", depSymbol]]),
    });
    tree.delete();

    // should include usage refs and handle local shadowing conservatively
    expect(refs.some((r) => r.kind === "usage")).toBe(true);
    // shadowed dep inside function should not blow up count
    expect(refs.length).toBeLessThanOrEqual(3);
  });
});
