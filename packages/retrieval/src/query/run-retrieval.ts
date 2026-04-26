import type { NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { detectProjects } from "../../../intelligence/src/workspace/detect-projects.js";
import { extractImportEdges } from "../../../intelligence/src/graph/extract-import-edges.js";
import { extractSymbolsFromFiles } from "../../../intelligence/src/symbols/extract-symbols.js";
import { buildEvidencePackets } from "./build-evidence-packets.js";
import { buildRetrievalPlan } from "./build-retrieval-plan.js";
import { expandGraph } from "./expand-graph.js";
import { searchDefinitions, searchReferences } from "./search-symbols.js";
import { chunkFiles } from "../semantic/chunker.js";
import { runEmbeddingPipeline, type EmbedPipelineResult } from "../semantic/embedding-pipeline.js";
import { semanticSearch, semanticResultsToNormalizedWithContext } from "../semantic/semantic-search.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import type { ScanOptions } from "../../../intelligence/src/workspace/detect-projects.js";
import { resolveIndexedFileAbsolutePath, toRepoRelativePath } from "../../../intelligence/src/workspace/scan-paths.js";
import type { IndexedFile } from "../../../shared/src/types/indexing.js";
import { recordTelemetry } from "../semantic/telemetry-collector.js";

/**
 * Retrieval package execution path.
 *
 * Non-authoritative contract note:
 * - `evidencePackets` emitted here are retrieval-local artifacts for diagnostics
 *   and compatibility.
 * - Touched product knowledge-command flows must consume canonical Rust evidence
 *   packet truth and must not promote this retrieval-local packet output to
 *   authoritative product evidence.
 */

export async function runRetrieval(input: {
  repoRoot: string;
  query: string;
  mode: "ask" | "explain" | "trace";
  semanticMode?: "always" | "auto" | "off";
  scanOptions?: ScanOptions;
}) {
  const plan = buildRetrievalPlan({
    query: input.query,
    mode: input.mode,
    semanticMode: input.semanticMode,
  });
  const workspaces = await detectProjects(input.repoRoot, input.scanOptions);
  const files = workspaces.flatMap((workspace) => workspace.files);
  const reducedCoverage = workspaces.some((workspace) => workspace.scanMeta?.partial === true);
  const scanStopReasons = [...new Set(workspaces
    .map((workspace) => workspace.diagnostics?.stopReason ?? "none")
    .filter((reason) => reason !== "none"))];
  const symbols = await extractSymbolsFromFiles(input.repoRoot, files);
  const edges = await extractImportEdges(input.repoRoot, files);
  const filePathById = buildRepoRelativeFilePathById(input.repoRoot, files);
  const symbolResults = selectSymbolResults(plan.intent, symbols, filePathById, plan.seedTerms);
  const fileResults = selectResults(files, filePathById, plan.seedTerms, plan.selectedTools);
  const expandedResults = plan.graphExpansion.maxDepth > 1 || plan.selectedTools.includes("graph_expand")
    ? expandGraph({
      repoRoot: input.repoRoot,
      results: symbolResults.length > 0 ? symbolResults : fileResults,
      files,
      symbols,
      edges,
    })
    : [];

  // ── Semantic retrieval path ──────────────────────────────────────
  let semanticResults: NormalizedRetrievalResult[] = [];
  let embeddingStats: EmbedPipelineResult | undefined;

  const useSemanticPath = plan.semanticMode === "always"
    || (plan.semanticMode === "auto" && symbolResults.length + fileResults.length < 3);

  if (useSemanticPath) {
    // 1. Chunk workspace files when DB has no chunk cache yet
    const chunksRepo = new ChunksRepo(input.repoRoot);
    const hasPersistedChunks = chunksRepo.count() > 0;
    const chunkInputs = hasPersistedChunks ? [] : await chunkFiles(input.repoRoot, files, symbols);

    // 2. Persist chunks and embed them
    if (chunkInputs.length > 0) {
      embeddingStats = await runEmbeddingPipeline(input.repoRoot, chunkInputs);
    }

    // 3. Semantic search against stored embeddings
    const searchResults = await semanticSearch(input.repoRoot, input.query);
    semanticResults = semanticResultsToNormalizedWithContext(searchResults, {
      repoRoot: input.repoRoot,
      filePathById,
    });

    for (const result of semanticResults) {
      const unresolved = result.metadata["semanticPathUnresolved"];
      if (unresolved === true) {
        recordTelemetry(input.repoRoot, {
          kind: "semantic_path_unresolved",
          details: {
            chunkId: String(result.metadata["chunkId"] ?? "unknown"),
            filePath: result.filePath,
            originalFilePath: String(result.metadata["semanticOriginalFilePath"] ?? result.filePath),
          },
        });
      }
    }
  }

  const normalizedResults = rerankResults([...symbolResults, ...fileResults, ...expandedResults, ...semanticResults]);
  const evidencePackets = await buildEvidencePackets(input.repoRoot, normalizedResults);

  return {
    plan,
    workspaces,
    scanMeta: {
      reducedCoverage,
      stopReasons: scanStopReasons,
    },
    symbols,
    edges,
    results: normalizedResults,
    evidencePackets,
    embeddingStats,
  };
}

function selectSymbolResults(
  intent: string,
  symbols: import("../../../shared/src/types/indexing.js").IndexedSymbol[],
  filesById: Map<string, string>,
  seedTerms: string[],
): NormalizedRetrievalResult[] {
  if (intent === "impact_analysis") {
    return searchReferences(symbols, filesById, seedTerms);
  }
  return searchDefinitions(symbols, filesById, seedTerms);
}

function selectResults(
  files: Array<{ id: string; path: string; language: string }>,
  filePathById: Map<string, string>,
  seedTerms: string[],
  selectedTools: string[],
): NormalizedRetrievalResult[] {
  const loweredTerms = seedTerms.map((term) => term.toLowerCase());
  const matches = files.filter((file) => {
    const normalizedPath = filePathById.get(file.id) ?? file.path;
    return loweredTerms.some((term) => normalizedPath.toLowerCase().includes(term));
  });
  const sourceTool = selectedTools[0] ?? "keyword_search";
  const candidates = (matches.length > 0 ? matches : files.slice(0, 5)).slice(0, 8);

  return candidates.map((file, index) => ({
    entityType: "file",
    entityId: createId("result"),
    filePath: filePathById.get(file.id) ?? file.path,
    symbolName: undefined,
    lineRange: [1, 40],
    sourceTool,
    matchReason: matches.length > 0 ? "Matched query seed term in file path." : "Fallback seed result from indexed workspace.",
    rawScore: 1 - index * 0.1,
    normalizedScore: Math.max(0.3, 0.95 - index * 0.08),
    metadata: { language: file.language },
  }));
}

function buildRepoRelativeFilePathById(repoRoot: string, files: IndexedFile[]): Map<string, string> {
  const filePathById = new Map<string, string>();
  for (const file of files) {
    const absolutePath = resolveIndexedFileAbsolutePath(repoRoot, file);
    if (!absolutePath) {
      continue;
    }
    const repoRelativePath = toRepoRelativePath(repoRoot, absolutePath);
    if (!repoRelativePath) {
      continue;
    }
    filePathById.set(file.id, repoRelativePath);
  }
  return filePathById;
}

function rerankResults(results: NormalizedRetrievalResult[]): NormalizedRetrievalResult[] {
  return [...results]
    .sort((left, right) => right.normalizedScore - left.normalizedScore)
    .filter((result, index, array) => {
      return array.findIndex((candidate) => candidate.filePath === result.filePath && candidate.symbolName === result.symbolName && candidate.sourceTool === result.sourceTool) === index;
    })
    .slice(0, 12);
}
