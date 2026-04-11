import fs from "node:fs/promises";
import path from "node:path";
import { detectProjects } from "../workspace/detect-projects.js";
import { parseSource, type TreeSitterNode } from "../parser/tree-sitter-init.js";
import { extractImportEdges, extractImportEdgesRegex } from "./extract-import-edges.js";
import { GraphRepo, hashContent } from "../../../storage/src/sqlite/repositories/graph-repo.js";
import { extractCallGraphFromTree } from "./extract-call-graph.js";
import { extractSymbolReferencesFromTree } from "./reference-tracker.js";
import type { GraphIndexStats, GraphSymbol } from "../../../shared/src/types/graph.js";
import { extractSymbolsFromFilesAST } from "../parser/ast-symbol-extractor.js";
import type { IndexedEdge, IndexedFile, IndexedSymbol } from "../../../shared/src/types/indexing.js";

export class GraphIndexer {
  private readonly repo: GraphRepo;

  constructor(private readonly repoRoot: string) {
    this.repo = new GraphRepo(repoRoot);
  }

  async indexProject(options?: { force?: boolean }): Promise<GraphIndexStats> {
    const started = Date.now();
    const force = options?.force ?? false;
    const workspaces = await detectProjects(this.repoRoot);
    const files = workspaces.flatMap((workspace) => workspace.files)
      .filter((file) => ["typescript", "tsx", "javascript", "jsx"].includes(file.language));
    const fileMapById = new Map(files.map((file) => [file.id, file]));
    const symbolCache = new Map<string, IndexedSymbol[]>();

    const mergedImportEdges = await this.buildMergedImportEdges(files);
    const importEdgesByFromId = groupImportEdgesByFromId(mergedImportEdges);

    const currentRelPaths = new Set(files.map((file) => normalizePath(file.path)));
    const existingNodes = this.repo.listNodes();
    let filesDeleted = 0;
    for (const node of existingNodes) {
      if (!currentRelPaths.has(normalizePath(node.path))) {
        this.repo.deleteNode(node.id);
        filesDeleted += 1;
      }
    }

    let filesIndexed = 0;
    let filesSkipped = 0;

    for (const file of files) {
      const absPath = path.join(this.repoRoot, file.path);
      let content: string;
      let statMtime = 0;
      try {
        content = await fs.readFile(absPath, "utf8");
        const stat = await fs.stat(absPath);
        statMtime = stat.mtimeMs;
      } catch {
        continue;
      }

      const contentHash = hashContent(content);
      const normalizedPath = normalizePath(file.path);
      const existingNode = this.repo.findNodeByPath(normalizedPath);
      const unchanged = existingNode && existingNode.contentHash === contentHash && !force;
      if (unchanged) {
        filesSkipped += 1;
        continue;
      }

      const node = this.repo.upsertNode({
        path: normalizedPath,
        kind: "module",
        language: file.language,
        contentHash,
        mtime: statMtime,
        parseStatus: "pending",
      });

      let tree: { rootNode: TreeSitterNode; delete(): void } | undefined;
      try {
        tree = await parseSource(file.language, content);

        const rawSymbols = await this.getRawSymbolsForFile(file, symbolCache);
        const graphSymbolsInput = toGraphSymbolInputs(rawSymbols, content);
        const currentTempSymbols = graphSymbolsInput.map((symbol) => ({
          id: toTempSymbolId(symbol),
          nodeId: node.id,
          ...symbol,
        }));

        const sourceImportEdges = importEdgesByFromId.get(file.id) ?? [];
        const deps = sourceImportEdges
          .map((edge) => {
            const targetFile = fileMapById.get(edge.toId);
            if (!targetFile) return null;
            const targetPath = normalizePath(targetFile.path);
            const existingTargetNode = this.repo.findNodeByPath(targetPath);
            const targetNode = existingTargetNode ?? this.repo.upsertNode({
              path: targetPath,
              kind: "module",
              language: targetFile.language,
              parseStatus: "pending",
            });
            return {
              toNodeId: targetNode.id,
              edgeType: "import" as const,
              line: 0,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null);

        const importedMap = new Map<string, GraphSymbol>();
        const symbolLookup = new Map<string, GraphSymbol[]>();
        for (const localSymbol of currentTempSymbols) {
          addToSymbolLookup(symbolLookup, localSymbol);
          importedMap.set(localSymbol.name, localSymbol);
        }

        for (const dep of deps) {
          const targetSymbols = this.repo.findSymbolsByNode(dep.toNodeId);
          let availableSymbols = targetSymbols;
          if (availableSymbols.length === 0) {
            const targetNode = this.repo.findNodeById(dep.toNodeId);
            if (!targetNode) continue;
            const targetFile = files.find((candidate) => normalizePath(candidate.path) === normalizePath(targetNode.path));
            if (!targetFile) continue;
            const targetRawSymbols = await this.getRawSymbolsForFile(targetFile, symbolCache);
            const targetSymbolInputs = toGraphSymbolInputs(targetRawSymbols, await fs.readFile(path.join(this.repoRoot, targetFile.path), "utf8"));
            if (targetSymbolInputs.length > 0) {
              availableSymbols = this.repo.replaceSymbolsForNode(dep.toNodeId, targetSymbolInputs);
            }
          }

          for (const targetSymbol of availableSymbols) {
            addToSymbolLookup(symbolLookup, targetSymbol);
            if (targetSymbol.isExport) {
              importedMap.set(targetSymbol.name, targetSymbol);
            }
          }
        }

        const calls = extractCallGraphFromTree({
          root: tree.rootNode,
          symbols: currentTempSymbols,
          importEdges: deps.map((edge) => ({
            id: "",
            fromNodeId: node.id,
            toNodeId: edge.toNodeId,
            edgeType: edge.edgeType,
            line: edge.line,
          })),
          symbolLookupByName: symbolLookup,
        });

        const refs = extractSymbolReferencesFromTree({
          root: tree.rootNode,
          importedSymbolMap: importedMap,
          sourceText: content,
        });

        this.repo.replaceAllForNode({
          nodeId: node.id,
          edges: deps,
          symbols: graphSymbolsInput,
          references: refs,
          calls,
        });

        this.repo.upsertNode({
          path: normalizedPath,
          kind: "module",
          language: file.language,
          contentHash,
          mtime: statMtime,
          parseStatus: "ok",
        });

        filesIndexed += 1;
      } catch {
        this.repo.upsertNode({
          path: normalizedPath,
          kind: "module",
          language: file.language,
          contentHash,
          mtime: statMtime,
          parseStatus: "error",
        });
      } finally {
        tree?.delete();
      }
    }

    return {
      filesScanned: files.length,
      filesIndexed,
      filesSkipped,
      filesDeleted,
      durationMs: Date.now() - started,
    };
  }

  private async getRawSymbolsForFile(
    file: IndexedFile,
    symbolCache: Map<string, IndexedSymbol[]>,
  ): Promise<IndexedSymbol[]> {
    const cached = symbolCache.get(file.id);
    if (cached) {
      return cached;
    }
    const symbols = await extractSymbolsFromFilesAST(this.repoRoot, [file]);
    const filtered = symbols.filter((symbol) => symbol.fileId === file.id);
    symbolCache.set(file.id, filtered);
    return filtered;
  }

  private async buildMergedImportEdges(files: IndexedFile[]): Promise<IndexedEdge[]> {
    const importEdges = await extractImportEdges(this.repoRoot, files);
    const regexImportEdges = await extractImportEdgesRegex(this.repoRoot, files);
    const merged = new Map<string, IndexedEdge>();
    for (const edge of [...importEdges, ...regexImportEdges]) {
      const key = `${edge.fromId}:${edge.toId}:${edge.kind}`;
      if (!merged.has(key)) {
        merged.set(key, edge);
      }
    }
    return [...merged.values()];
  }
}

function groupImportEdgesByFromId(edges: IndexedEdge[]): Map<string, IndexedEdge[]> {
  const grouped = new Map<string, IndexedEdge[]>();
  for (const edge of edges) {
    const bucket = grouped.get(edge.fromId) ?? [];
    bucket.push(edge);
    grouped.set(edge.fromId, bucket);
  }
  return grouped;
}

function toGraphSymbolInputs(symbols: IndexedSymbol[], sourceText: string): Array<Omit<GraphSymbol, "id" | "nodeId">> {
  const exportNameSet = collectNamedExports(sourceText);
  const lines = sourceText.split(/\r?\n/);
  return symbols.map((symbol) => ({
    name: symbol.name,
    kind: symbol.kind,
    isExport: isExportedSymbol(symbol, lines, exportNameSet),
    line: symbol.lineStart,
    startLine: symbol.lineStart,
    endLine: symbol.lineEnd,
    signature: null,
    docComment: null,
    scope: "module",
  }));
}

function collectNamedExports(sourceText: string): Set<string> {
  const exportNames = new Set<string>();
  const regex = /export\s+(?:type\s+)?\{([^}]+)\}/g;
  for (const match of sourceText.matchAll(regex)) {
    const specifiers = (match[1] ?? "").split(",");
    for (const raw of specifiers) {
      const token = raw.trim();
      if (!token) continue;
      const aliasMatch = token.match(/^(\w+)\s+as\s+(\w+)$/i);
      if (aliasMatch) {
        exportNames.add(aliasMatch[1]!);
        exportNames.add(aliasMatch[2]!);
      } else {
        exportNames.add(token);
      }
    }
  }
  return exportNames;
}

function isExportedSymbol(symbol: IndexedSymbol, lines: string[], exportNameSet: Set<string>): boolean {
  const lineIndex = Math.max(0, symbol.lineStart - 1);
  const currentLine = lines[lineIndex] ?? "";
  const previousLine = lineIndex > 0 ? (lines[lineIndex - 1] ?? "") : "";
  if (/\bexport\b/.test(currentLine) || /^\s*export\s*$/.test(previousLine)) {
    return true;
  }
  return exportNameSet.has(symbol.name);
}

function addToSymbolLookup(symbolLookup: Map<string, GraphSymbol[]>, symbol: GraphSymbol): void {
  const bucket = symbolLookup.get(symbol.name) ?? [];
  bucket.push(symbol);
  symbolLookup.set(symbol.name, bucket);
}

function toTempSymbolId(symbol: Omit<GraphSymbol, "id" | "nodeId">): string {
  return `temp:${symbol.name}`;
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
