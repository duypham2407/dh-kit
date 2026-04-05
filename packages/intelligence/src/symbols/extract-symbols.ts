import fs from "node:fs/promises";
import path from "node:path";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { extractSymbolsFromFilesAST } from "../parser/ast-symbol-extractor.js";
import { isSupportedLanguage } from "../parser/tree-sitter-init.js";

const SYMBOL_PATTERNS: Array<{
  kind: IndexedSymbol["kind"];
  regex: RegExp;
  nameIndex: number;
}> = [
  { kind: "function", regex: /^\s*export\s+async\s+function\s+(\w+)/gm, nameIndex: 1 },
  { kind: "function", regex: /^\s*export\s+function\s+(\w+)/gm, nameIndex: 1 },
  { kind: "function", regex: /^\s*async\s+function\s+(\w+)/gm, nameIndex: 1 },
  { kind: "function", regex: /^\s*function\s+(\w+)/gm, nameIndex: 1 },
  { kind: "class", regex: /^\s*export\s+class\s+(\w+)/gm, nameIndex: 1 },
  { kind: "class", regex: /^\s*class\s+(\w+)/gm, nameIndex: 1 },
  { kind: "interface", regex: /^\s*export\s+interface\s+(\w+)/gm, nameIndex: 1 },
  { kind: "interface", regex: /^\s*interface\s+(\w+)/gm, nameIndex: 1 },
  { kind: "type", regex: /^\s*export\s+type\s+(\w+)/gm, nameIndex: 1 },
  { kind: "type", regex: /^\s*type\s+(\w+)/gm, nameIndex: 1 },
  { kind: "const", regex: /^\s*export\s+const\s+(\w+)/gm, nameIndex: 1 },
  { kind: "const", regex: /^\s*const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm, nameIndex: 1 },
  { kind: "const", regex: /^\s*const\s+(\w+)\s*=\s*(?:async\s*)?[^=]+=>/gm, nameIndex: 1 },
  { kind: "method", regex: /^\s{2,}(\w+)\s*\(/gm, nameIndex: 1 },
];

/**
 * Extract symbols from files. Tries AST-based extraction first (tree-sitter),
 * falls back to regex heuristics if tree-sitter fails or is unavailable.
 */
export async function extractSymbolsFromFiles(repoRoot: string, files: IndexedFile[]): Promise<IndexedSymbol[]> {
  const candidateFiles = files.filter((file) => ["typescript", "tsx", "javascript", "jsx"].includes(file.language));

  // Try AST extraction first
  try {
    const astFiles = candidateFiles.filter((f) => isSupportedLanguage(f.language));
    if (astFiles.length > 0) {
      const astSymbols = await extractSymbolsFromFilesAST(repoRoot, astFiles);
      if (astSymbols.length > 0) {
        // Get files not covered by AST extraction
        const astFileIds = new Set(astFiles.map((f) => f.id));
        const remainingFiles = candidateFiles.filter((f) => !astFileIds.has(f.id));
        if (remainingFiles.length > 0) {
          const regexSymbols = await extractSymbolsFromFilesRegex(repoRoot, remainingFiles);
          return [...astSymbols, ...regexSymbols];
        }
        return astSymbols;
      }
    }
  } catch {
    // AST extraction failed, fall through to regex
  }

  return extractSymbolsFromFilesRegex(repoRoot, candidateFiles);
}

/**
 * Regex-based symbol extraction (original heuristic approach).
 * Used as a fallback when tree-sitter is unavailable.
 */
export async function extractSymbolsFromFilesRegex(repoRoot: string, files: IndexedFile[]): Promise<IndexedSymbol[]> {
  const symbolGroups = await Promise.all(files.map((file) => extractSymbolsFromFile(repoRoot, file)));
  return symbolGroups.flat();
}

async function extractSymbolsFromFile(repoRoot: string, file: IndexedFile): Promise<IndexedSymbol[]> {
  const absolutePath = path.join(repoRoot, file.path);
  const content = await fs.readFile(absolutePath, "utf8");
  const symbols: IndexedSymbol[] = [];

  for (const pattern of SYMBOL_PATTERNS) {
    for (const match of content.matchAll(pattern.regex)) {
      const name = match[pattern.nameIndex];
      const index = match.index ?? 0;
      const lineStart = countLines(content, index);
      const lineEnd = Math.min(lineStart + 8, content.split("\n").length);
      symbols.push({
        id: createId("symbol"),
        fileId: file.id,
        name,
        kind: pattern.kind,
        lineStart,
        lineEnd,
      });
    }
  }

  return dedupeSymbols(symbols);
}

function countLines(content: string, endIndex: number): number {
  return content.slice(0, endIndex).split("\n").length;
}

function dedupeSymbols(symbols: IndexedSymbol[]): IndexedSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.fileId}:${symbol.name}:${symbol.kind}:${symbol.lineStart}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
