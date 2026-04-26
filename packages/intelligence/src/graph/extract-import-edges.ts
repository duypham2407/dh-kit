import fs from "node:fs/promises";
import type { IndexedEdge, IndexedFile } from "../../../shared/src/types/indexing.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { parseSource, type TreeSitterNode } from "../parser/tree-sitter-init.js";
import { resolveModuleSpecifierDetailed, type ModuleResolutionResult } from "./module-resolver.js";
import { normalizePathSlashes, resolveIndexedFileAbsolutePath, toRepoRelativePath } from "../workspace/scan-paths.js";

const IMPORT_REGEX = /^\s*import\s+.*?from\s+["'](.+?)["'];?/gm;

export async function extractImportEdgesRegex(repoRoot: string, files: IndexedFile[]): Promise<IndexedEdge[]> {
  const edges: IndexedEdge[] = [];
  for (const file of files.filter((entry) => ["typescript", "tsx", "javascript", "jsx"].includes(entry.language))) {
    const absolutePath = resolveIndexedFileAbsolutePath(repoRoot, file);
    if (!absolutePath) {
      continue;
    }
    const content = await fs.readFile(absolutePath, "utf8");
    for (const match of content.matchAll(IMPORT_REGEX)) {
      edges.push({
        id: createId("edge"),
        fromId: file.id,
        toId: match[1],
        kind: "import",
      });
    }
  }
  return edges;
}

export async function extractImportEdges(repoRoot: string, files: IndexedFile[]): Promise<IndexedEdge[]> {
  return (await extractImportEdgesWithDiagnostics(repoRoot, files)).edges;
}

export type ImportResolutionDiagnostic = ModuleResolutionResult & { fromId: string; importType: ImportSpecifier["type"] };

export async function extractImportEdgesWithDiagnostics(repoRoot: string, files: IndexedFile[]): Promise<{ edges: IndexedEdge[]; diagnostics: ImportResolutionDiagnostic[] }> {
  const sourceFiles = files.filter((entry) => ["typescript", "tsx", "javascript", "jsx"].includes(entry.language));
  const fileByRelativePath = new Map<string, IndexedFile>();
  for (const file of sourceFiles) {
    const absolutePath = resolveIndexedFileAbsolutePath(repoRoot, file);
    if (!absolutePath) {
      continue;
    }
    const repoRelativePath = toRepoRelativePath(repoRoot, absolutePath);
    if (!repoRelativePath) {
      continue;
    }
    fileByRelativePath.set(normalizeRelPath(repoRelativePath), file);
  }
  const edges: IndexedEdge[] = [];
  const diagnostics: ImportResolutionDiagnostic[] = [];

  for (const file of sourceFiles) {
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

    try {
      const tree = await parseSource(file.language, content);
      const specifiers = collectImportSpecifiers(tree.rootNode);
      tree.delete();

      for (const specifier of specifiers) {
        const workspaceRoot = file.workspaceRoot ?? repoRoot;
        const result = resolveModuleSpecifierDetailed(specifier.value, absolutePath, workspaceRoot);
        if (result.status !== "resolved" || !result.resolvedAbsPath) {
          diagnostics.push({ ...result, fromId: file.id, importType: specifier.type });
          continue;
        }
        const rel = toRepoRelativePath(repoRoot, result.resolvedAbsPath);
        if (!rel) {
          continue;
        }
        const target = fileByRelativePath.get(rel);
        if (!target) {
          continue;
        }
        edges.push({
          id: createId("edge"),
          fromId: file.id,
          toId: target.id,
          kind: "import",
        });
      }
    } catch {
      const fallback = await extractImportEdgesRegex(repoRoot, [file]);
      edges.push(...fallback);
    }
  }

  return { edges: dedupeEdges(edges), diagnostics };
}

type ImportSpecifier = {
  value: string;
  type: "static" | "side-effect" | "re-export" | "type-only" | "require" | "dynamic";
};

function collectImportSpecifiers(root: TreeSitterNode): ImportSpecifier[] {
  const found: ImportSpecifier[] = [];

  function visit(node: TreeSitterNode) {
    if (node.type === "import_statement") {
      const text = node.text;
      const spec = extractQuotedSpecifier(text);
      if (spec) {
        found.push({
          value: spec,
          type: text.includes("import type") ? "type-only" : (text.match(/^\s*import\s+["']/) ? "side-effect" : "static"),
        });
      }
    }

    if (node.type === "export_statement") {
      const text = node.text;
      if (/\bfrom\s+["']/.test(text)) {
        const spec = extractQuotedSpecifier(text);
        if (spec) {
          found.push({ value: spec, type: "re-export" });
        }
      }
    }

    if (node.type === "call_expression") {
      const text = node.text;
      const req = text.match(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/);
      if (req?.[1]) {
        found.push({ value: req[1], type: "require" });
      }
      const dyn = text.match(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/);
      if (dyn?.[1]) {
        found.push({ value: dyn[1], type: "dynamic" });
      }
    }

    for (let i = 0; i < node.namedChildCount; i++) {
      const child = node.namedChild(i);
      if (child) {
        visit(child);
      }
    }
  }

  visit(root);
  return found;
}

function extractQuotedSpecifier(text: string): string | null {
  const doubleQuoted = text.match(/"([^"]+)"/);
  if (doubleQuoted?.[1]) {
    return doubleQuoted[1];
  }
  const singleQuoted = text.match(/'([^']+)'/);
  if (singleQuoted?.[1]) {
    return singleQuoted[1];
  }
  return null;
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

function normalizeRelPath(value: string): string {
  return normalizePathSlashes(value);
}
