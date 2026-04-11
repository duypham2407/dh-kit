import fs from "node:fs/promises";
import type { IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { parseSource, isSupportedLanguage, type TreeSitterNode } from "./tree-sitter-init.js";
import { resolveIndexedFileAbsolutePath } from "../workspace/scan-paths.js";

/**
 * AST node types that map to our IndexedSymbol kinds, per language.
 * The key is the tree-sitter node type, the value is our symbol kind.
 */
const TS_JS_SYMBOL_TYPES: Record<string, IndexedSymbol["kind"]> = {
  function_declaration: "function",
  generator_function_declaration: "function",
  class_declaration: "class",
  method_definition: "method",
  abstract_method_signature: "method",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "type",
  // TypeScript namespaces / modules
  internal_module: "namespace",
  module: "namespace",
};

/**
 * Variable declarations that are arrow functions or function expressions.
 * These need special handling — we check the initializer.
 */
const FUNCTION_INIT_TYPES = new Set([
  "arrow_function",
  "function_expression",
  "generator_function",
]);

/**
 * Structural method names that we keep in the index.
 * Listed here for documentation purposes; they're handled via method_definition
 * in TS_JS_SYMBOL_TYPES above.
 */
const _METHOD_KEYWORD_NAMES = new Set(["constructor", "get", "set"]);

const PYTHON_SYMBOL_TYPES: Record<string, IndexedSymbol["kind"]> = {
  function_definition: "function",
  decorated_definition: "function", // @decorator def foo
  class_definition: "class",
};

const GO_SYMBOL_TYPES: Record<string, IndexedSymbol["kind"]> = {
  function_declaration: "function",
  method_declaration: "method",
  type_declaration: "type",
};

const RUST_SYMBOL_TYPES: Record<string, IndexedSymbol["kind"]> = {
  function_item: "function",
  struct_item: "class",
  enum_item: "type",
  trait_item: "interface",
  impl_item: "class",
  type_item: "type",
};

function getSymbolTypesForLanguage(language: string): Record<string, IndexedSymbol["kind"]> {
  switch (language) {
    case "typescript":
    case "tsx":
    case "javascript":
    case "jsx":
      return TS_JS_SYMBOL_TYPES;
    case "python":
      return PYTHON_SYMBOL_TYPES;
    case "go":
      return GO_SYMBOL_TYPES;
    case "rust":
      return RUST_SYMBOL_TYPES;
    default:
      return {};
  }
}

/**
 * Extract the name from an AST node. The naming conventions vary by language
 * and node type.
 */
function extractName(
  node: TreeSitterNode,
): string | undefined {
  // Most declarations: the 'name' field
  const nameNode = node.childForFieldName("name");
  if (nameNode) return nameNode.text;

  // For some declarations without a 'name' field, try first named child
  const first = node.namedChild(0);
  if (first && first.type === "identifier") return first.text;
  if (first && first.type === "type_identifier") return first.text;

  return undefined;
}

/**
 * Walk the AST to extract symbols. Uses a recursive DFS walk.
 *
 * Key handling rules:
 * - `export_statement` wrapping a declaration → visit the inner declaration directly.
 * - `lexical_declaration` / `variable_declaration` with function/arrow initializers → emit as "function".
 * - Namespace / module declarations → emit as "namespace" and also recurse into their body.
 * - Python `decorated_definition` → look for the inner function/class definition.
 */
function walkTree(
  tree: { rootNode: TreeSitterNode },
  language: string,
  fileId: string,
): IndexedSymbol[] {
  const symbolTypes = getSymbolTypesForLanguage(language);
  const symbols: IndexedSymbol[] = [];
  const isJsLike = ["typescript", "tsx", "javascript", "jsx"].includes(language);
  const isPython = language === "python";

  function visit(node: TreeSitterNode, skipEmit = false) {
    const kind = skipEmit ? undefined : symbolTypes[node.type];

    if (kind) {
      const name = extractName(node);
      if (name) {
        symbols.push({
          id: createId("sym"),
          fileId,
          name,
          kind,
          lineStart: node.startPosition.row + 1, // 1-indexed
          lineEnd: node.endPosition.row + 1,
        });
      }
    }

    // Handle variable declarations with function initializers (const foo = () => {})
    if (isJsLike && (node.type === "lexical_declaration" || node.type === "variable_declaration")) {
      for (let i = 0; i < node.namedChildCount; i++) {
        const declarator = node.namedChild(i);
        if (!declarator || declarator.type !== "variable_declarator") continue;

        const nameNode = declarator.childForFieldName("name");
        const valueNode = declarator.childForFieldName("value");
        if (nameNode && valueNode && FUNCTION_INIT_TYPES.has(valueNode.type)) {
          symbols.push({
            id: createId("sym"),
            fileId,
            name: nameNode.text,
            kind: "function",
            lineStart: node.startPosition.row + 1,
            lineEnd: node.endPosition.row + 1,
          });
        }
      }
      // Still recurse for nested declarations (don't return early)
    }

    // Handle export statements that wrap declarations
    if (isJsLike && node.type === "export_statement") {
      const declaration = node.childForFieldName("declaration");
      if (declaration) {
        visit(declaration);
        return; // Visited the inner declaration; skip generic child traversal
      }
      // export { foo, bar } — no declaration field; nothing more to emit at this level
      return;
    }

    // Python decorated_definition: extract the inner function or class
    if (isPython && node.type === "decorated_definition") {
      for (let i = 0; i < node.namedChildCount; i++) {
        const child = node.namedChild(i);
        if (
          child &&
          (child.type === "function_definition" || child.type === "class_definition")
        ) {
          visit(child);
          return;
        }
      }
      return;
    }

    // Recurse into children
    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) visit(child);
    }
  }

  void _METHOD_KEYWORD_NAMES; // retained for documentation; methods handled by symbolTypes

  visit(tree.rootNode);
  return dedupeSymbols(symbols);
}

function dedupeSymbols(symbols: IndexedSymbol[]): IndexedSymbol[] {
  const seen = new Set<string>();
  return symbols.filter((symbol) => {
    const key = `${symbol.fileId}:${symbol.name}:${symbol.kind}:${symbol.lineStart}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Extract symbols from a single file using tree-sitter AST parsing.
 * Falls back to empty array if parsing fails.
 */
export async function extractSymbolsFromFileAST(
  repoRoot: string,
  file: IndexedFile,
): Promise<IndexedSymbol[]> {
  if (!isSupportedLanguage(file.language)) {
    return [];
  }

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

  try {
    const tree = await parseSource(file.language, content);
    const symbols = walkTree(tree, file.language, file.id);
    tree.delete();
    return symbols;
  } catch {
    return [];
  }
}

/**
 * Extract symbols from multiple files using tree-sitter AST parsing.
 */
export async function extractSymbolsFromFilesAST(
  repoRoot: string,
  files: IndexedFile[],
): Promise<IndexedSymbol[]> {
  const results = await Promise.all(
    files.map((file) => extractSymbolsFromFileAST(repoRoot, file)),
  );
  return results.flat();
}
