import fs from "node:fs/promises";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { extractSymbolsFromFilesAST } from "../parser/ast-symbol-extractor.js";
import { isSupportedLanguage, listSupportedLanguages } from "../parser/tree-sitter-init.js";
import { resolveIndexedFileAbsolutePath } from "../workspace/scan-paths.js";

export type LanguageSupportStatus = "supported" | "limited" | "fallback-only";

export type LanguageSupportBoundary = {
  language: string;
  status: LanguageSupportStatus;
  reason: string;
};

const FULL_SYMBOL_SUPPORT_LANGUAGES = new Set(["typescript", "tsx", "javascript", "jsx"]);
const LIMITED_SYMBOL_SUPPORT_LANGUAGES = new Set(["python", "go", "rust"]);
const SYMBOL_EXTRACTION_CANDIDATE_LANGUAGES = new Set([
  ...FULL_SYMBOL_SUPPORT_LANGUAGES,
  ...LIMITED_SYMBOL_SUPPORT_LANGUAGES,
]);

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
  const candidateFiles = files.filter((file) => SYMBOL_EXTRACTION_CANDIDATE_LANGUAGES.has(file.language));

  // Try AST extraction first
  try {
    const astFiles = candidateFiles.filter((f) => isSupportedLanguage(f.language));
    if (astFiles.length > 0) {
      const astSymbols = await extractSymbolsFromFilesAST(repoRoot, astFiles);
      if (astSymbols.length > 0) {
        // Get files not covered by AST extraction
        const astFileIds = new Set(astFiles.map((f) => f.id));
        const remainingFiles = candidateFiles.filter((f) => !astFileIds.has(f.id));
        const regexFallbackFiles = remainingFiles.filter((f) => FULL_SYMBOL_SUPPORT_LANGUAGES.has(f.language));
        if (regexFallbackFiles.length > 0) {
          const regexSymbols = await extractSymbolsFromFilesRegex(repoRoot, regexFallbackFiles);
          return [...astSymbols, ...regexSymbols];
        }
        return astSymbols;
      }
    }
  } catch {
    // AST extraction failed, fall through to regex
  }

  const regexCandidateFiles = candidateFiles.filter((file) => FULL_SYMBOL_SUPPORT_LANGUAGES.has(file.language));
  return extractSymbolsFromFilesRegex(repoRoot, regexCandidateFiles);
}

export function getLanguageSupportStatus(language: string): LanguageSupportStatus {
  if (FULL_SYMBOL_SUPPORT_LANGUAGES.has(language)) {
    return "supported";
  }

  if (LIMITED_SYMBOL_SUPPORT_LANGUAGES.has(language)) {
    return "limited";
  }

  return "fallback-only";
}

export function listLanguageSupportBoundaries(): LanguageSupportBoundary[] {
  const supportedByGrammar = listSupportedLanguages();
  const boundaries = supportedByGrammar.map((language) => {
    const status = getLanguageSupportStatus(language);
    if (status === "supported") {
      return {
        language,
        status,
        reason: "Grammar-backed symbol extraction with regex fallback is available.",
      } satisfies LanguageSupportBoundary;
    }

    if (status === "limited") {
      return {
        language,
        status,
        reason: "Grammar-backed parsing exists, but symbol extraction coverage is intentionally bounded.",
      } satisfies LanguageSupportBoundary;
    }

    return {
      language,
      status,
      reason: "Grammar may exist, but this surface currently relies on degraded or non-symbol fallback behavior.",
    } satisfies LanguageSupportBoundary;
  });

  return boundaries.sort((left, right) => left.language.localeCompare(right.language));
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
  const absolutePath = resolveIndexedFileAbsolutePath(repoRoot, file);
  if (!absolutePath) {
    return [];
  }
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
