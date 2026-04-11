import fs from "node:fs/promises";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import { resolveIndexedFileAbsolutePath } from "../workspace/scan-paths.js";

export type CallSite = {
  fileId: string;
  symbolName: string;
  line: number;
};

export async function extractCallSites(
  repoRoot: string,
  files: IndexedFile[],
  symbols: IndexedSymbol[],
): Promise<CallSite[]> {
  const functionNames = Array.from(new Set(
    symbols
      .filter((symbol) => symbol.kind === "function" || symbol.kind === "method")
      .map((symbol) => symbol.name),
  ));

  if (functionNames.length === 0) {
    return [];
  }

  const callSites: CallSite[] = [];
  for (const file of files) {
    const absolutePath = resolveIndexedFileAbsolutePath(repoRoot, file);
    if (!absolutePath) {
      continue;
    }
    let content: string;
    try {
      content = await fs.readFile(absolutePath, "utf8");
    } catch {
      continue;
    }

    for (const symbolName of functionNames) {
      const pattern = new RegExp(`\\b${escapeRegExp(symbolName)}\\s*\\(`, "g");
      for (const match of content.matchAll(pattern)) {
        const index = match.index ?? 0;
        callSites.push({
          fileId: file.id,
          symbolName,
          line: countLines(content, index),
        });
      }
    }
  }

  return dedupeCallSites(callSites);
}

function countLines(content: string, endIndex: number): number {
  return content.slice(0, endIndex).split("\n").length;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeCallSites(callSites: CallSite[]): CallSite[] {
  const seen = new Set<string>();
  return callSites.filter((callSite) => {
    const key = `${callSite.fileId}:${callSite.symbolName}:${callSite.line}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
