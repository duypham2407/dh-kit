import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseSource } from "../parser/tree-sitter-init.js";
import { extractCallGraphFromTree } from "./extract-call-graph.js";
import type { GraphSymbol } from "../../../shared/src/types/graph.js";

describe("extractCallGraphFromTree", () => {
  it("captures local, member and unresolved calls at symbol level", async () => {
    const src = [
      "function alpha() { beta(); foo.bar(); unknown(); }",
      "function beta() {}",
    ].join("\n");
    const tree = await parseSource("typescript", src);

    const symbols: GraphSymbol[] = [
      {
        id: "s-alpha",
        nodeId: "n-a",
        name: "alpha",
        kind: "function",
        isExport: true,
        line: 1,
        startLine: 1,
        endLine: 1,
        signature: null,
        docComment: null,
        scope: null,
      },
      {
        id: "s-beta",
        nodeId: "n-a",
        name: "beta",
        kind: "function",
        isExport: true,
        line: 2,
        startLine: 2,
        endLine: 2,
        signature: null,
        docComment: null,
        scope: null,
      },
    ];

    const lookup = new Map<string, GraphSymbol[]>([["beta", [symbols[1]!]]]);
    const calls = extractCallGraphFromTree({ root: tree.rootNode, symbols, importEdges: [], symbolLookupByName: lookup });
    tree.delete();

    expect(calls.some((call) => call.calleeName === "beta" && call.calleeSymbolId === "s-beta")).toBe(true);
    expect(calls.some((call) => call.calleeName === "bar" && call.calleeSymbolId === null)).toBe(true);
    expect(calls.some((call) => call.calleeName === "unknown" && call.calleeSymbolId === null)).toBe(true);
  });
});
