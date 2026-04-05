import type { IndexedSymbol } from "../../../shared/src/types/indexing.js";
import type { NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { createId } from "../../../shared/src/utils/ids.js";

export function searchDefinitions(symbols: IndexedSymbol[], filesById: Map<string, string>, seedTerms: string[]): NormalizedRetrievalResult[] {
  const lowered = seedTerms.map((term) => term.toLowerCase());
  const matches = symbols.filter((symbol) => lowered.some((term) => symbol.name.toLowerCase().includes(term)));
  return matches.slice(0, 8).map((symbol, index) => ({
    entityType: "symbol",
    entityId: createId("result"),
    filePath: filesById.get(symbol.fileId) ?? "unknown",
    symbolName: symbol.name,
    lineRange: [symbol.lineStart, symbol.lineEnd],
    sourceTool: "symbol_search",
    matchReason: "Matched query seed term in symbol name.",
    rawScore: 0.95 - index * 0.05,
    normalizedScore: 0.98 - index * 0.06,
    metadata: { kind: symbol.kind },
  }));
}

export function searchReferences(symbols: IndexedSymbol[], filesById: Map<string, string>, seedTerms: string[]): NormalizedRetrievalResult[] {
  const lowered = seedTerms.map((term) => term.toLowerCase());
  const matches = symbols.filter((symbol) => lowered.some((term) => symbol.name.toLowerCase().startsWith(term)));
  return matches.slice(0, 8).map((symbol, index) => ({
    entityType: "symbol",
    entityId: createId("result"),
    filePath: filesById.get(symbol.fileId) ?? "unknown",
    symbolName: symbol.name,
    lineRange: [symbol.lineStart, symbol.lineEnd],
    sourceTool: "reference_search",
    matchReason: "Matched query seed term as reference candidate.",
    rawScore: 0.85 - index * 0.05,
    normalizedScore: 0.88 - index * 0.05,
    metadata: { kind: symbol.kind },
  }));
}
