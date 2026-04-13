/**
 * Index job runner — scans the workspace, extracts symbols, chunks files,
 * and runs the embedding pipeline. This is the main entry point for
 * building and refreshing the local code intelligence index.
 */

import { detectProjects } from "../../../intelligence/src/workspace/detect-projects.js";
import { evaluateOperatorSafeProjectWorktree } from "../workspace/operator-safe-project-worktree-utils.js";
import { extractCallEdges } from "../../../intelligence/src/graph/extract-call-edges.js";
import { extractCallSites } from "../../../intelligence/src/graph/extract-call-sites.js";
import { extractSymbolsFromFiles } from "../../../intelligence/src/symbols/extract-symbols.js";
import { extractImportEdges } from "../../../intelligence/src/graph/extract-import-edges.js";
import { chunkFiles } from "../../../retrieval/src/semantic/chunker.js";
import {
  createEmbeddingProvider,
  refreshFileChunks,
  runEmbeddingPipeline,
  type EmbedPipelineResult,
} from "../../../retrieval/src/semantic/embedding-pipeline.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { contentHash } from "../../../retrieval/src/semantic/chunker.js";
import type { IndexedFile, IndexedSymbol, IndexedEdge, IndexedWorkspace } from "../../../shared/src/types/indexing.js";
import type { ScanOptions } from "../../../intelligence/src/workspace/detect-projects.js";

export type IndexJobResult = {
  workspaces: IndexedWorkspace[];
  filesScanned: number;
  symbolsExtracted: number;
  edgesExtracted: number;
  callSitesExtracted: number;
  chunksProduced: number;
  embedding: EmbedPipelineResult | undefined;
  durationMs: number;
  summary: string;
  diagnostics: {
    filesDiscovered: number;
    /** Number of files selected for refresh/chunk work in this run (not total discovered files). */
    filesIndexed: number;
    filesSkipped: number;
    /** Number of files whose chunks/embeddings were refreshed in this run. */
    filesRefreshed: number;
    filesUnchanged: number;
    workspaceCount: number;
    workspaceCoverage: Array<{
      root: string;
      partial: boolean;
      stopReason: string;
    }>;
    partialScan: boolean;
    scanStopReasons: string[];
    operatorSafety: {
      mode: "check" | "dry_run" | "execute";
      allowed: boolean;
      warningCount: number;
      blockingCount: number;
      recommendedAction: string;
    };
  };
};

export type IndexJobOptions = {
  /** Skip embedding (useful for quick re-index without API cost) */
  skipEmbedding?: boolean;
  /** Force full re-index even if chunks exist */
  force?: boolean;
  /** Optional scan controls for bounded project discovery */
  scanOptions?: ScanOptions;
};

/**
 * Run the full indexing workflow for a repository:
 *
 * 1. Scan workspace for indexable files
 * 2. Extract symbols (AST-first, regex fallback)
 * 3. Extract import edges
 * 4. Chunk files (symbol-aligned when possible)
 * 5. Persist chunks and run embedding pipeline
 */
export async function runIndexWorkflow(
  repoRoot: string,
  options?: IndexJobOptions,
): Promise<IndexJobResult> {
  const start = Date.now();
  const opts = options ?? {};

  // ── Step 1: Scan workspace ──────────────────────────────────────
  const workspaces = await detectProjects(repoRoot, opts.scanOptions);
  const operatorSafety = await evaluateOperatorSafeProjectWorktree({
    mode: "check",
    operation: "index_workspace",
    repoRoot,
    targetPath: repoRoot,
    requireVcs: false,
    knownWorkspaces: workspaces,
  });
  const files = workspaces.flatMap((ws) => ws.files);

  if (files.length === 0) {
    const partialScan = workspaces.some((workspace) => workspace.scanMeta?.partial === true);
    const scanStopReasons = uniqueStopReasons(workspaces);
    return makeResult(workspaces, 0, 0, 0, 0, 0, undefined, start, {
      filesDiscovered: 0,
      filesIndexed: 0,
      filesSkipped: 0,
      filesRefreshed: 0,
      filesUnchanged: 0,
      workspaceCount: workspaces.length,
      workspaceCoverage: buildWorkspaceCoverage(workspaces),
      partialScan,
      scanStopReasons,
      operatorSafety: {
        mode: operatorSafety.mode,
        allowed: operatorSafety.allowed,
        warningCount: operatorSafety.warnings.length,
        blockingCount: operatorSafety.blockingReasons.length,
        recommendedAction: operatorSafety.recommendedAction,
      },
    });
  }

  const partialScan = workspaces.some((workspace) => workspace.scanMeta?.partial === true);
  const scanStopReasons = uniqueStopReasons(workspaces);

  // ── Step 2: Extract symbols ─────────────────────────────────────
  // check-mode operator safety is advisory-only in this runner.
  // We always continue indexing while surfacing diagnostics for operator review.
  const symbols = await extractSymbolsFromFiles(repoRoot, files);

  // ── Step 3: Extract import edges ────────────────────────────────
  const importEdges = await extractImportEdges(repoRoot, files);
  const callEdges = await extractCallEdges(repoRoot, files, symbols);
  const callSites = await extractCallSites(repoRoot, files, symbols);
  const edges = [...importEdges, ...callEdges];

  // ── Step 4: Chunk files ─────────────────────────────────────────
  // When not forced, only re-chunk files whose chunk content has changed.
  const filesToChunk = opts.force ? files : await filterFilesNeedingRefresh(repoRoot, files, symbols);
  const filesUnchanged = Math.max(0, files.length - filesToChunk.length);
  const chunkInputs = await chunkFiles(repoRoot, filesToChunk, symbols);

  // ── Step 5: Embed chunks ────────────────────────────────────────
  let embeddingResult: EmbedPipelineResult | undefined;
  if (!opts.skipEmbedding && chunkInputs.length > 0) {
    const provider = createEmbeddingProvider();
    if (opts.force) {
      embeddingResult = await runEmbeddingPipeline(repoRoot, chunkInputs, provider);
    } else {
      embeddingResult = await refreshChangedFiles(repoRoot, filesToChunk, chunkInputs, provider);
    }
  }

  return makeResult(
    workspaces,
    files.length,
    symbols.length,
    edges.length,
    callSites.length,
    chunkInputs.length,
    embeddingResult,
    start,
    {
      filesDiscovered: files.length,
      filesIndexed: filesToChunk.length,
      filesSkipped: filesUnchanged,
      filesRefreshed: filesToChunk.length,
      filesUnchanged,
      workspaceCount: workspaces.length,
      workspaceCoverage: buildWorkspaceCoverage(workspaces),
      partialScan,
      scanStopReasons,
      operatorSafety: {
        mode: operatorSafety.mode,
        allowed: operatorSafety.allowed,
        warningCount: operatorSafety.warnings.length,
        blockingCount: operatorSafety.blockingReasons.length,
        recommendedAction: operatorSafety.recommendedAction,
      },
    },
  );
}

async function filterFilesNeedingRefresh(repoRoot: string, files: IndexedFile[], symbols: IndexedSymbol[]): Promise<IndexedFile[]> {
  const chunksRepo = new ChunksRepo(repoRoot);
  const candidateChunkInputs = await chunkFiles(repoRoot, files, symbols);
  const grouped = groupChunkInputsByFileId(candidateChunkInputs);

  return files.filter((file) => {
    const existingHashes = chunksRepo.findContentHashesByFileId(file.id);
    const nextHashes = (grouped.get(file.id) ?? []).map((chunk) => contentHash(chunk.content));
    if (existingHashes.length === 0) {
      return true;
    }
    if (existingHashes.length !== nextHashes.length) {
      return true;
    }
    return existingHashes.some((hash, index) => hash !== nextHashes[index]);
  });
}

async function refreshChangedFiles(
  repoRoot: string,
  filesToChunk: IndexedFile[],
  chunkInputs: Awaited<ReturnType<typeof chunkFiles>>,
  provider: ReturnType<typeof createEmbeddingProvider>,
): Promise<EmbedPipelineResult> {
  const grouped = groupChunkInputsByFileId(chunkInputs);
  const totals: EmbedPipelineResult = {
    chunksStored: 0,
    embeddingsStored: 0,
    skippedDuplicates: 0,
    totalTokens: 0,
  };

  for (const file of filesToChunk) {
    const perFileInputs = grouped.get(file.id) ?? [];
    const result = await refreshFileChunks(repoRoot, file.id, perFileInputs, provider);
    totals.chunksStored += result.chunksStored;
    totals.embeddingsStored += result.embeddingsStored;
    totals.skippedDuplicates += result.skippedDuplicates;
    totals.totalTokens += result.totalTokens;
  }

  return totals;
}

function groupChunkInputsByFileId(chunkInputs: Awaited<ReturnType<typeof chunkFiles>>) {
  const grouped = new Map<string, typeof chunkInputs>();
  for (const chunk of chunkInputs) {
    const existing = grouped.get(chunk.fileId) ?? [];
    existing.push(chunk);
    grouped.set(chunk.fileId, existing);
  }
  return grouped;
}

function makeResult(
  workspaces: IndexedWorkspace[],
  filesScanned: number,
  symbolsExtracted: number,
  edgesExtracted: number,
  callSitesExtracted: number,
  chunksProduced: number,
  embedding: EmbedPipelineResult | undefined,
  startMs: number,
  diagnostics: IndexJobResult["diagnostics"],
): IndexJobResult {
  const durationMs = Date.now() - startMs;
  const embSummary = embedding
    ? ` embeddings=${embedding.embeddingsStored} skipped=${embedding.skippedDuplicates} tokens=${embedding.totalTokens}`
    : " embeddings=skipped";
  const scanSummary = diagnostics.partialScan
    ? ` scan=partial(${diagnostics.scanStopReasons.join(",") || "unknown"})`
    : " scan=complete";
  const safetySummary = ` operator-safety=${diagnostics.operatorSafety.allowed ? "allow" : "block"}(${diagnostics.operatorSafety.recommendedAction})`;
  const workspaceSummary = ` workspaces=${diagnostics.workspaceCount}`;

  return {
    workspaces,
    filesScanned,
    symbolsExtracted,
    edgesExtracted,
    callSitesExtracted,
    chunksProduced,
    embedding,
    durationMs,
    summary: `Indexed ${filesScanned} files (${diagnostics.filesRefreshed} refreshed, ${diagnostics.filesUnchanged} unchanged), ${symbolsExtracted} symbols, ${edgesExtracted} edges, ${callSitesExtracted} call-sites, ${chunksProduced} chunks.${embSummary}.${scanSummary}.${safetySummary}.${workspaceSummary} (${durationMs}ms)`,
    diagnostics,
  };
}

function uniqueStopReasons(workspaces: IndexedWorkspace[]): string[] {
  return [...new Set(workspaces
    .map((workspace) => workspace.diagnostics?.stopReason ?? "none")
    .filter((reason) => reason !== "none"))];
}

function buildWorkspaceCoverage(workspaces: IndexedWorkspace[]): Array<{
  root: string;
  partial: boolean;
  stopReason: string;
}> {
  return workspaces.map((workspace) => ({
    root: workspace.root,
    partial: workspace.scanMeta?.partial === true,
    stopReason: workspace.diagnostics?.stopReason ?? "none",
  }));
}
