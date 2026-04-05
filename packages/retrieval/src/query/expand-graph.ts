import type { IndexedEdge, IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import type { NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { createId } from "../../../shared/src/utils/ids.js";

export function expandGraph(args: {
  results: NormalizedRetrievalResult[];
  files: IndexedFile[];
  symbols: IndexedSymbol[];
  edges: IndexedEdge[];
}): NormalizedRetrievalResult[] {
  const fileById = new Map(args.files.map((file) => [file.id, file]));
  const expansion: NormalizedRetrievalResult[] = [];

  for (const result of args.results.slice(0, 5)) {
    const relatedFile = args.files.find((file) => file.path === result.filePath);
    if (!relatedFile) {
      continue;
    }

    const relatedEdges = args.edges.filter((edge) => edge.fromId === relatedFile.id).slice(0, 2);
    for (const edge of relatedEdges) {
      const targetFile = fileById.get(edge.toId);
      if (!targetFile) {
        continue;
      }

      const targetSymbol = args.symbols.find((symbol) => symbol.fileId === targetFile.id);
      expansion.push({
        entityType: targetSymbol ? "symbol" : "file",
        entityId: createId("result"),
        filePath: targetFile.path,
        symbolName: targetSymbol?.name,
        lineRange: targetSymbol ? [targetSymbol.lineStart, targetSymbol.lineEnd] : [1, 40],
        sourceTool: "graph_expand",
        matchReason: `Expanded from import edge out of ${result.filePath}.`,
        rawScore: 0.6,
        normalizedScore: 0.62,
        metadata: { edgeKind: edge.kind },
      });
    }
  }

  return expansion;
}
