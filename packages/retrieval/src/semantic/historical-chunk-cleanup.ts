import fs from "node:fs";
import path from "node:path";
import { normalizeToRepoRelativePath } from "../../../intelligence/src/workspace/scan-paths.js";
import { ChunksRepo, type ChunkPathInventoryRow } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { readTelemetryEvents, summarizeTelemetryInWindow, type TelemetrySummary, type TelemetrySummaryWindow } from "./telemetry-collector.js";

type CleanupClassificationKind = "canonical" | "deterministic_convertible" | "unresolved";

export type HistoricalChunkCleanupRow = {
  chunkId: string;
  fileId: string;
  currentFilePath: string;
  targetFilePath: string | null;
  telemetryFlagged: boolean;
  kind: CleanupClassificationKind;
  reason: string;
};

export type HistoricalChunkCleanupClassification = {
  rowsScanned: number;
  telemetryFlaggedRows: number;
  telemetryFlaggedDeterministicConvertibleRows: number;
  canonicalRows: number;
  deterministicConvertibleRows: number;
  unresolvedRows: number;
  rows: HistoricalChunkCleanupRow[];
};

export type HistoricalChunkCleanupRunMeta = {
  runAt: string;
  operator: string;
  mode: "dry-run" | "apply";
  scope: "historical-semantic-chunk-paths";
  observationWindow: TelemetrySummaryWindow;
  batchSize: number;
};

export type HistoricalChunkCleanupExamples = {
  canonical: string[];
  deterministicConvertible: string[];
  unresolved: string[];
};

export type HistoricalChunkCleanupReport = {
  meta: HistoricalChunkCleanupRunMeta;
  telemetryBefore: TelemetrySummary;
  telemetryAfter: TelemetrySummary;
  storageBefore: HistoricalChunkCleanupClassification;
  storageAfter: HistoricalChunkCleanupClassification;
  deterministicRowsEligibleForApply: number;
  deterministicRowsUpdated: number;
  deterministicRowsNotUpdated: number;
  canonicalRowsUnchanged: number;
  updatedRows: number;
  skippedRows: number;
  unresolvedRowsRetained: number;
  orphanedEmbeddingsBefore: number;
  orphanedEmbeddingsAfter: number;
  orphanedEmbeddingsDeleted: number;
  examples: HistoricalChunkCleanupExamples;
};

export type HistoricalChunkCleanupOptions = {
  mode: "dry-run" | "apply";
  observationWindow?: TelemetrySummaryWindow;
  batchSize?: number;
  exampleLimit?: number;
  operator?: string;
};

export function classifyHistoricalChunkPaths(repoRoot: string, observationWindow: TelemetrySummaryWindow = {}): HistoricalChunkCleanupClassification {
  const chunksRepo = new ChunksRepo(repoRoot);
  const inventory = chunksRepo.listPathInventory();
  const telemetrySignals = collectTelemetryPathSignals(repoRoot, observationWindow);
  const classifiedRows = inventory.map((row) => classifyOneRow(repoRoot, row, telemetrySignals));

  const canonicalRows = classifiedRows.filter((row) => row.kind === "canonical").length;
  const deterministicConvertibleRows = classifiedRows.filter((row) => row.kind === "deterministic_convertible").length;
  const telemetryFlaggedDeterministicConvertibleRows = classifiedRows.filter(
    (row) => row.kind === "deterministic_convertible" && row.telemetryFlagged,
  ).length;
  const unresolvedRows = classifiedRows.filter((row) => row.kind === "unresolved").length;
  const telemetryFlaggedRows = classifiedRows.filter((row) => row.telemetryFlagged).length;

  return {
    rowsScanned: classifiedRows.length,
    telemetryFlaggedRows,
    telemetryFlaggedDeterministicConvertibleRows,
    canonicalRows,
    deterministicConvertibleRows,
    unresolvedRows,
    rows: classifiedRows,
  };
}

export function runHistoricalChunkCleanup(
  repoRoot: string,
  options: HistoricalChunkCleanupOptions,
): HistoricalChunkCleanupReport {
  const mode = options.mode;
  const observationWindow: TelemetrySummaryWindow = options.observationWindow ?? {};
  const batchSize = options.batchSize && options.batchSize > 0 ? options.batchSize : 200;
  const exampleLimit = options.exampleLimit && options.exampleLimit > 0 ? options.exampleLimit : 5;
  const operator = options.operator?.trim() || "unknown";

  const telemetryBefore = summarizeTelemetryInWindow(repoRoot, observationWindow);
  const storageBefore = classifyHistoricalChunkPaths(repoRoot, observationWindow);

  const embeddingsRepo = new EmbeddingsRepo(repoRoot);
  const orphanedEmbeddingsBefore = embeddingsRepo.countOrphaned();

  const deterministicRows = storageBefore.rows.filter(
    (row) => row.kind === "deterministic_convertible" && row.targetFilePath,
  );
  const unresolvedRowsRetained = storageBefore.unresolvedRows;

  let updatedRows = 0;
  if (mode === "apply" && deterministicRows.length > 0) {
    const chunksRepo = new ChunksRepo(repoRoot);
    for (const batch of toBatches(deterministicRows, batchSize)) {
      const updates = batch.map((row) => ({
        chunkId: row.chunkId,
        filePath: row.targetFilePath!,
      }));
      updatedRows += chunksRepo.updateFilePathsByChunkId(updates);
    }
  }

  const orphanedEmbeddingsDeleted = mode === "apply" ? embeddingsRepo.deleteOrphaned() : 0;
  const orphanedEmbeddingsAfter = embeddingsRepo.countOrphaned();

  const storageAfter = classifyHistoricalChunkPaths(repoRoot, observationWindow);
  const telemetryAfter = summarizeTelemetryInWindow(repoRoot, observationWindow);

  const deterministicRowsEligibleForApply = deterministicRows.length;
  const deterministicRowsUpdated = updatedRows;
  const deterministicRowsNotUpdated = Math.max(0, deterministicRowsEligibleForApply - deterministicRowsUpdated);
  const canonicalRowsUnchanged = storageBefore.canonicalRows;

  return {
    meta: {
      runAt: new Date().toISOString(),
      operator,
      mode,
      scope: "historical-semantic-chunk-paths",
      observationWindow,
      batchSize,
    },
    telemetryBefore,
    telemetryAfter,
    storageBefore,
    storageAfter,
    deterministicRowsEligibleForApply,
    deterministicRowsUpdated,
    deterministicRowsNotUpdated,
    canonicalRowsUnchanged,
    updatedRows,
    skippedRows: deterministicRowsNotUpdated,
    unresolvedRowsRetained,
    orphanedEmbeddingsBefore,
    orphanedEmbeddingsAfter,
    orphanedEmbeddingsDeleted,
    examples: {
      canonical: collectExamples(storageAfter.rows, "canonical", exampleLimit),
      deterministicConvertible: collectExamples(storageBefore.rows, "deterministic_convertible", exampleLimit),
      unresolved: collectExamples(storageAfter.rows, "unresolved", exampleLimit),
    },
  };
}

function classifyOneRow(
  repoRoot: string,
  row: ChunkPathInventoryRow,
  telemetrySignals: Set<string>,
): HistoricalChunkCleanupRow {
  const telemetryFlagged = telemetrySignals.has(row.filePath);
  const canonical = normalizeToRepoRelativePath(repoRoot, row.filePath);
  if (!canonical) {
    return {
      chunkId: row.id,
      fileId: row.fileId,
      currentFilePath: row.filePath,
      targetFilePath: null,
      telemetryFlagged,
      kind: "unresolved",
      reason: telemetryFlagged
        ? "Telemetry-flagged unresolved path cannot be normalized into repo-relative contract."
        : "Path cannot be normalized into repo-relative contract.",
    };
  }

  if (canonical === row.filePath) {
    return {
      chunkId: row.id,
      fileId: row.fileId,
      currentFilePath: row.filePath,
      targetFilePath: canonical,
      telemetryFlagged,
      kind: "canonical",
      reason: "Already canonical repo-relative path.",
    };
  }

  const absoluteCandidate = path.join(repoRoot, canonical);
  if (!existsSyncSafe(absoluteCandidate)) {
    return {
      chunkId: row.id,
      fileId: row.fileId,
      currentFilePath: row.filePath,
      targetFilePath: null,
      telemetryFlagged,
      kind: "unresolved",
      reason: "Normalized path does not map to an existing file.",
    };
  }

  return {
    chunkId: row.id,
    fileId: row.fileId,
    currentFilePath: row.filePath,
    targetFilePath: canonical,
    telemetryFlagged,
    kind: "deterministic_convertible",
    reason: "Deterministic normalization with existing file target.",
  };
}

function collectTelemetryPathSignals(repoRoot: string, observationWindow: TelemetrySummaryWindow): Set<string> {
  const sinceMs = observationWindow.sinceIso ? Date.parse(observationWindow.sinceIso) : Number.NEGATIVE_INFINITY;
  const untilMs = observationWindow.untilIso ? Date.parse(observationWindow.untilIso) : Number.POSITIVE_INFINITY;

  const signaled = new Set<string>();
  const events = readTelemetryEvents(repoRoot);
  for (const event of events) {
    const eventMs = Date.parse(event.timestamp);
    if (!Number.isFinite(eventMs) || eventMs < sinceMs || eventMs > untilMs) {
      continue;
    }

    if (event.kind === "semantic_path_unresolved") {
      signaled.add(event.details.filePath);
      signaled.add(event.details.originalFilePath);
      continue;
    }
    if (event.kind === "evidence_path_unresolved") {
      signaled.add(event.details.filePath);
      if (event.details.normalizedFilePath) {
        signaled.add(event.details.normalizedFilePath);
      }
    }
  }
  return signaled;
}

function existsSyncSafe(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

function collectExamples(rows: HistoricalChunkCleanupRow[], kind: CleanupClassificationKind, limit: number): string[] {
  return rows
    .filter((row) => row.kind === kind)
    .slice(0, limit)
    .map((row) => `${row.currentFilePath}${row.targetFilePath && row.targetFilePath !== row.currentFilePath ? ` -> ${row.targetFilePath}` : ""}`);
}

function toBatches<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
