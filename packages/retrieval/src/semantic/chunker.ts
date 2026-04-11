import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import type { ChunkInput } from "../../../shared/src/types/embedding.js";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import { resolveIndexedFileAbsolutePath } from "../../../intelligence/src/workspace/scan-paths.js";

const DEFAULT_CHUNK_MAX_LINES = 60;
const DEFAULT_CHUNK_OVERLAP_LINES = 8;

export type ChunkerOptions = {
  maxLines?: number;
  overlapLines?: number;
};

/**
 * Estimate token count from text. Rough heuristic: ~4 characters per token for code.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Compute a content hash for deduplication / cache invalidation.
 */
export function contentHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Chunk a single file into overlapping windows. If symbols are available,
 * prefer symbol-aligned boundaries; otherwise fall back to line-based sliding window.
 */
export async function chunkFile(
  repoRoot: string,
  file: IndexedFile,
  symbols: IndexedSymbol[],
  options?: ChunkerOptions,
): Promise<ChunkInput[]> {
  const absolutePath = resolveIndexedFileAbsolutePath(repoRoot, file);
  if (!absolutePath) {
    return [];
  }
  let content: string;
  try {
    content = await fs.readFile(absolutePath, "utf8");
  } catch {
    return [];
  }

  const lines = content.split("\n");
  const fileSymbols = symbols.filter((s) => s.fileId === file.id);

  if (fileSymbols.length > 0) {
    return chunkBySymbols(file, lines, fileSymbols);
  }

  return chunkByWindow(file, lines, options);
}

/**
 * Symbol-aligned chunking: each symbol becomes one chunk, plus any gaps
 * between symbols become their own chunks.
 */
function chunkBySymbols(
  file: IndexedFile,
  lines: string[],
  symbols: IndexedSymbol[],
): ChunkInput[] {
  const sorted = [...symbols].sort((a, b) => a.lineStart - b.lineStart);
  const chunks: ChunkInput[] = [];
  let cursor = 0;

  for (const symbol of sorted) {
    const symStart = symbol.lineStart - 1; // 0-indexed
    const symEnd = Math.min(symbol.lineEnd, lines.length);

    // Gap before this symbol
    if (cursor < symStart) {
      const gapContent = lines.slice(cursor, symStart).join("\n");
      if (gapContent.trim().length > 0) {
        chunks.push({
          fileId: file.id,
          filePath: file.path,
          lineStart: cursor + 1,
          lineEnd: symStart,
          content: gapContent,
          language: file.language,
        });
      }
    }

    // Symbol chunk
    const symContent = lines.slice(symStart, symEnd).join("\n");
    if (symContent.trim().length > 0) {
      chunks.push({
        fileId: file.id,
        filePath: file.path,
        symbolId: symbol.id,
        lineStart: symStart + 1,
        lineEnd: symEnd,
        content: symContent,
        language: file.language,
      });
    }

    cursor = symEnd;
  }

  // Trailing content after last symbol
  if (cursor < lines.length) {
    const tailContent = lines.slice(cursor).join("\n");
    if (tailContent.trim().length > 0) {
      chunks.push({
        fileId: file.id,
        filePath: file.path,
        lineStart: cursor + 1,
        lineEnd: lines.length,
        content: tailContent,
        language: file.language,
      });
    }
  }

  return chunks;
}

/**
 * Sliding-window chunking for files without symbol data.
 */
function chunkByWindow(
  file: IndexedFile,
  lines: string[],
  options?: ChunkerOptions,
): ChunkInput[] {
  const maxLines = options?.maxLines ?? DEFAULT_CHUNK_MAX_LINES;
  const overlap = options?.overlapLines ?? DEFAULT_CHUNK_OVERLAP_LINES;
  const chunks: ChunkInput[] = [];
  let start = 0;

  while (start < lines.length) {
    const end = Math.min(start + maxLines, lines.length);
    const chunkContent = lines.slice(start, end).join("\n");

    if (chunkContent.trim().length > 0) {
      chunks.push({
        fileId: file.id,
        filePath: file.path,
        lineStart: start + 1,
        lineEnd: end,
        content: chunkContent,
        language: file.language,
      });
    }

    if (end >= lines.length) break;
    start = end - overlap;
  }

  return chunks;
}

/**
 * Chunk multiple files. Returns flat array of all chunk inputs.
 */
export async function chunkFiles(
  repoRoot: string,
  files: IndexedFile[],
  symbols: IndexedSymbol[],
  options?: ChunkerOptions,
): Promise<ChunkInput[]> {
  const results = await Promise.all(
    files.map((file) => chunkFile(repoRoot, file, symbols, options)),
  );
  return results.flat();
}
