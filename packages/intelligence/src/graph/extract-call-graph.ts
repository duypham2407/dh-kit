import type { TreeSitterNode } from "../parser/tree-sitter-init.js";
import type { GraphCall, GraphEdge, GraphSymbol } from "../../../shared/src/types/graph.js";

export function extractCallGraphFromTree(input: {
  root: TreeSitterNode;
  symbols: GraphSymbol[];
  importEdges: GraphEdge[];
  symbolLookupByName: Map<string, GraphSymbol[]>;
}): Array<Omit<GraphCall, "id">> {
  const byLine = [...input.symbols].sort((a, b) => a.line - b.line);
  const calls: Array<Omit<GraphCall, "id">> = [];

  function visit(node: TreeSitterNode) {
    if (node.type === "call_expression") {
      const callee = extractCalleeName(node.text);
      if (callee) {
        const line = node.startPosition.row + 1;
        const caller = findCallerSymbol(line, byLine);
        const targets = input.symbolLookupByName.get(callee) ?? [];
        const target = targets.length === 1 ? targets[0] : null;
        if (caller) {
          calls.push({
            callerSymbolId: caller.id,
            calleeName: callee,
            calleeNodeId: target?.nodeId ?? null,
            calleeSymbolId: target?.id ?? null,
            line,
          });
        }
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child);
    }
  }

  visit(input.root);

  const seen = new Set<string>();
  return calls.filter((call) => {
    const key = `${call.callerSymbolId}:${call.calleeName}:${call.line}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findCallerSymbol(line: number, symbols: GraphSymbol[]): GraphSymbol | null {
  for (const symbol of symbols) {
    const start = symbol.startLine ?? symbol.line;
    const end = symbol.endLine ?? symbol.line;
    if (line >= start && line <= end) {
      return symbol;
    }
  }
  return null;
}

function extractCalleeName(text: string): string | null {
  const member = text.match(/([A-Za-z_$][\w$]*)\s*\(/);
  if (!member?.[1]) {
    return null;
  }
  const parts = member[1].split(".");
  return parts[parts.length - 1] ?? null;
}
