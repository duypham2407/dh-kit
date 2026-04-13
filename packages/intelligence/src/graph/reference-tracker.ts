import type { TreeSitterNode } from "../parser/tree-sitter-init.js";
import type { GraphSymbol, GraphSymbolReference } from "../../../shared/src/types/graph.js";

export function extractSymbolReferencesFromTree(input: {
  root: TreeSitterNode;
  importedSymbolMap: Map<string, GraphSymbol>;
  localDeclarations?: Set<string>;
  sourceText?: string;
}): Array<Omit<GraphSymbolReference, "id" | "nodeId">> {
  const references: Array<Omit<GraphSymbolReference, "id" | "nodeId">> = [];
  const scopes: Array<Set<string>> = [new Set(input.localDeclarations ?? [])];

  function isShadowed(name: string): boolean {
    for (let i = scopes.length - 1; i >= 0; i--) {
      if (scopes[i]!.has(name)) return true;
    }
    return false;
  }

  function visit(node: TreeSitterNode) {
    const opensScope = node.type === "function_declaration" || node.type === "arrow_function" || node.type === "statement_block";
    if (opensScope) scopes.push(new Set());

    if (node.type === "variable_declarator") {
      const nameNode = node.childForFieldName("name");
      if (nameNode?.text) scopes[scopes.length - 1]!.add(nameNode.text);
    }

    if (node.type === "identifier" || node.type === "type_identifier") {
      const identifierName = node.text;
      const target = input.importedSymbolMap.get(identifierName);
      if (target && !isDeclarationIdentifier(node) && !isShadowed(identifierName)) {
        references.push({
          symbolId: target.id,
          line: node.startPosition.row + 1,
          col: node.startPosition.column,
          kind: isTypeReference(node, input.sourceText) ? "type-reference" : "usage",
        });
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child);
    }

    if (opensScope) scopes.pop();
  }

  visit(input.root);
  const seen = new Set<string>();
  return references.filter((ref) => {
    const key = `${ref.symbolId}:${ref.line}:${ref.col}:${ref.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isDeclarationIdentifier(node: TreeSitterNode): boolean {
  const parentType = (node as unknown as { parent?: { type?: string } }).parent?.type;
  if (!parentType) return false;
  return parentType === "import_specifier"
    || parentType === "namespace_import"
    || parentType === "import_clause"
    || parentType === "variable_declarator"
    || parentType === "function_declaration"
    || parentType === "class_declaration"
    || parentType === "type_alias_declaration"
    || parentType === "interface_declaration";
}

function isTypeReference(node: TreeSitterNode, sourceText?: string): boolean {
  const lineNumber = node.startPosition.row + 1;
  if (lineNumber <= 1) {
    return false;
  }

  const parentType = (node as unknown as { parent?: { type?: string } }).parent?.type;
  if (parentType && (
    parentType.includes("type")
    || parentType === "interface_declaration"
    || parentType === "type_alias_declaration"
  )) {
    return true;
  }

  if (!sourceText) {
    return false;
  }
  const line = sourceText.split(/\r?\n/)[node.startPosition.row] ?? "";
  return /^\s*type\s+/.test(line) || /:\s*[A-Za-z_$][\w$]*/.test(line);
}
