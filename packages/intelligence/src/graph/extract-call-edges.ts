import fs from "node:fs/promises";
import path from "node:path";
import type { IndexedEdge, IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import { createId } from "../../../shared/src/utils/ids.js";

export async function extractCallEdges(
  repoRoot: string,
  files: IndexedFile[],
  symbols: IndexedSymbol[],
): Promise<IndexedEdge[]> {
  const functionLikeSymbols = symbols.filter((symbol) => symbol.kind === "function" || symbol.kind === "method");
  if (functionLikeSymbols.length === 0) {
    return [];
  }

  const symbolNameToTargets = new Map<string, IndexedSymbol[]>();
  for (const symbol of functionLikeSymbols) {
    const existing = symbolNameToTargets.get(symbol.name) ?? [];
    existing.push(symbol);
    symbolNameToTargets.set(symbol.name, existing);
  }

  const edges: IndexedEdge[] = [];
  for (const file of files) {
    const absolutePath = path.join(repoRoot, file.path);
    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    const fileSymbols = functionLikeSymbols.filter((symbol) => symbol.fileId === file.id);
    for (const source of fileSymbols) {
      const body = getLineWindow(content, source.lineStart, source.lineEnd);
      for (const [name, targets] of symbolNameToTargets.entries()) {
        if (name === source.name) {
          continue;
        }
        const callPattern = new RegExp(`\\b${escapeRegExp(name)}\\s*\\(`, "g");
        if (!callPattern.test(body)) {
          continue;
        }
        for (const target of targets) {
          edges.push({
            id: createId("edge"),
            fromId: source.id,
            toId: target.id,
            kind: "call",
          });
        }
      }
    }
  }

  return dedupeEdges(edges);
}

function getLineWindow(content: string, startLine: number, endLine: number): string {
  const lines = content.split(/\r?\n/);
  return lines.slice(Math.max(0, startLine - 1), Math.max(0, endLine)).join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeEdges(edges: IndexedEdge[]): IndexedEdge[] {
  const seen = new Set<string>();
  return edges.filter((edge) => {
    const key = `${edge.fromId}:${edge.toId}:${edge.kind}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
