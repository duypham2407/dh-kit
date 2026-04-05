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
import { semanticSearch, semanticResultsToNormalized } from "../semantic/semantic-search.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";

export async function runRetrieval(input: {
  repoRoot: string;
  query: string;
  mode: "ask" | "explain" | "trace";
  semanticMode?: "always" | "auto" | "off";
}) {
  const plan = buildRetrievalPlan({
    query: input.query,
    mode: input.mode,
    semanticMode: input.semanticMode,
  });
  const workspaces = await detectProjects(input.repoRoot);
  const files = workspaces.flatMap((workspace) => workspace.files);
  const symbols = await extractSymbolsFromFiles(input.repoRoot, files);
  const edges = await extractImportEdges(input.repoRoot, files);
  const filesById = new Map(files.map((file) => [file.id, file.path]));
  const symbolResults = selectSymbolResults(plan.intent, symbols, filesById, plan.seedTerms);
  const fileResults = selectResults(files, plan.seedTerms, plan.selectedTools);
  const expandedResults = plan.graphExpansion.maxDepth > 1 || plan.selectedTools.includes("graph_expand")
    ? expandGraph({ results: symbolResults.length > 0 ? symbolResults : fileResults, files, symbols, edges })
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
    semanticResults = semanticResultsToNormalized(searchResults);
  }

  const normalizedResults = rerankResults([...symbolResults, ...fileResults, ...expandedResults, ...semanticResults]);
  const evidencePackets = await buildEvidencePackets(input.repoRoot, normalizedResults);

  return {
    plan,
    workspaces,
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
  seedTerms: string[],
  selectedTools: string[],
): NormalizedRetrievalResult[] {
  const loweredTerms = seedTerms.map((term) => term.toLowerCase());
  const matches = files.filter((file) => loweredTerms.some((term) => file.path.toLowerCase().includes(term)));
  const sourceTool = selectedTools[0] ?? "keyword_search";
  const candidates = (matches.length > 0 ? matches : files.slice(0, 5)).slice(0, 8);

  return candidates.map((file, index) => ({
    entityType: "file",
    entityId: createId("result"),
    filePath: file.path,
    symbolName: undefined,
    lineRange: [1, 40],
    sourceTool,
    matchReason: matches.length > 0 ? "Matched query seed term in file path." : "Fallback seed result from indexed workspace.",
    rawScore: 1 - index * 0.1,
    normalizedScore: Math.max(0.3, 0.95 - index * 0.08),
    metadata: { language: file.language },
  }));
}

function rerankResults(results: NormalizedRetrievalResult[]): NormalizedRetrievalResult[] {
  return [...results]
    .sort((left, right) => right.normalizedScore - left.normalizedScore)
    .filter((result, index, array) => {
      return array.findIndex((candidate) => candidate.filePath === result.filePath && candidate.symbolName === result.symbolName && candidate.sourceTool === result.sourceTool) === index;
    })
    .slice(0, 12);
}
