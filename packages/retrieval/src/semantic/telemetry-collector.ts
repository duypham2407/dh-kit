/**
 * Telemetry collector — project-local event recording.
 *
 * All events are appended to a JSONL file at `.dh/telemetry/events.jsonl`.
 * The file can be rotated or truncated at any time; the collector will
 * recreate it on the next write.
 *
 * Usage:
 *   import { recordTelemetry, readTelemetryEvents, summarizeTelemetry } from "./telemetry-collector.js";
 *   recordTelemetry(repoRoot, { kind: "embedding_pipeline", metrics: { ... } });
 */

import fs from "node:fs";
import path from "node:path";
import type { TelemetryEvent, EmbeddingPipelineMetrics, AnnBuildMetrics, SemanticSearchMetrics } from "../../../shared/src/types/telemetry.js";

type RetrievalTelemetryEvent = TelemetryEvent | {
  kind: "retrieval_dependency_graph_unavailable";
  details: {
    reason: string;
    attemptedAdapter: string;
    engine?: string;
    selectorLabel?: string;
    runtimeBehavior?: string;
    fallbackPath: "semantic_vector_retrieval";
  };
};

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function telemetryDir(repoRoot: string): string {
  return path.join(repoRoot, ".dh", "telemetry");
}

function eventsFilePath(repoRoot: string): string {
  return path.join(telemetryDir(repoRoot), "events.jsonl");
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

type TimestampedEvent = RetrievalTelemetryEvent & { timestamp: string };

export type TelemetrySummaryWindow = {
  sinceIso?: string;
  untilIso?: string;
};

/**
 * Append a telemetry event to the local JSONL log.
 * Synchronous to avoid interfering with async pipeline flow.
 */
export function recordTelemetry(repoRoot: string, event: RetrievalTelemetryEvent): void {
  const dir = telemetryDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const line: TimestampedEvent = { ...event, timestamp: new Date().toISOString() };
  fs.appendFileSync(eventsFilePath(repoRoot), JSON.stringify(line) + "\n", "utf8");
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Read all telemetry events from the local JSONL log.
 * Returns an empty array if the file is missing or empty.
 */
export function readTelemetryEvents(repoRoot: string): TimestampedEvent[] {
  const filePath = eventsFilePath(repoRoot);
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (raw.length === 0) return [];
  const events: TimestampedEvent[] = [];
  for (const line of raw.split("\n")) {
    try {
      events.push(JSON.parse(line) as TimestampedEvent);
    } catch {
      // Malformed telemetry is non-authoritative diagnostics; skip the line and keep reading later events.
      continue;
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Summarize
// ---------------------------------------------------------------------------

export type TelemetrySummary = {
  totalEvents: number;
  embeddingPipeline: {
    runs: number;
    totalTokens: number;
    totalChunksEmbedded: number;
    totalDurationMs: number;
    avgDurationMs: number;
  };
  annBuild: {
    runs: number;
    totalDurationMs: number;
    avgDurationMs: number;
  };
  semanticSearch: {
    queries: number;
    totalDurationMs: number;
    avgDurationMs: number;
    strategyBreakdown: Record<string, number>;
  };
  unresolvedPaths: {
    semantic: number;
    evidence: number;
  };
  degradedRetrieval: {
    dependencyGraphUnavailable: number;
  };
};

/**
 * Produce a human/machine-readable summary of all recorded telemetry.
 */
export function summarizeTelemetry(repoRoot: string): TelemetrySummary {
  const events = readTelemetryEvents(repoRoot);
  return summarizeTelemetryFromEvents(events);
}

export function summarizeTelemetryInWindow(repoRoot: string, window: TelemetrySummaryWindow): TelemetrySummary {
  const events = readTelemetryEvents(repoRoot);
  return summarizeTelemetryFromEvents(filterEventsByWindow(events, window));
}

function summarizeTelemetryFromEvents(events: TimestampedEvent[]): TelemetrySummary {

  const pipelineEvents = events.filter((e): e is TimestampedEvent & { kind: "embedding_pipeline"; metrics: EmbeddingPipelineMetrics } => e.kind === "embedding_pipeline");
  const annEvents = events.filter((e): e is TimestampedEvent & { kind: "ann_build"; metrics: AnnBuildMetrics } => e.kind === "ann_build");
  const searchEvents = events.filter((e): e is TimestampedEvent & { kind: "semantic_search"; metrics: SemanticSearchMetrics } => e.kind === "semantic_search");

  const pTotalTokens = pipelineEvents.reduce((s, e) => s + e.metrics.totalTokens, 0);
  const pTotalChunks = pipelineEvents.reduce((s, e) => s + e.metrics.chunksEmbedded, 0);
  const pTotalDur = pipelineEvents.reduce((s, e) => s + e.metrics.durationMs, 0);

  const aTotalDur = annEvents.reduce((s, e) => s + e.metrics.durationMs, 0);

  const sTotalDur = searchEvents.reduce((s, e) => s + e.metrics.durationMs, 0);
  const semanticPathUnresolvedCount = events.filter((e) => e.kind === "semantic_path_unresolved").length;
  const evidencePathUnresolvedCount = events.filter((e) => e.kind === "evidence_path_unresolved").length;
  const dependencyGraphUnavailableCount = events.filter((e) => e.kind === "retrieval_dependency_graph_unavailable").length;
  const strategyBreakdown: Record<string, number> = {};
  for (const e of searchEvents) {
    strategyBreakdown[e.metrics.strategy] = (strategyBreakdown[e.metrics.strategy] ?? 0) + 1;
  }

  return {
    totalEvents: events.length,
    embeddingPipeline: {
      runs: pipelineEvents.length,
      totalTokens: pTotalTokens,
      totalChunksEmbedded: pTotalChunks,
      totalDurationMs: pTotalDur,
      avgDurationMs: pipelineEvents.length > 0 ? pTotalDur / pipelineEvents.length : 0,
    },
    annBuild: {
      runs: annEvents.length,
      totalDurationMs: aTotalDur,
      avgDurationMs: annEvents.length > 0 ? aTotalDur / annEvents.length : 0,
    },
    semanticSearch: {
      queries: searchEvents.length,
      totalDurationMs: sTotalDur,
      avgDurationMs: searchEvents.length > 0 ? sTotalDur / searchEvents.length : 0,
      strategyBreakdown,
    },
    unresolvedPaths: {
      semantic: semanticPathUnresolvedCount,
      evidence: evidencePathUnresolvedCount,
    },
    degradedRetrieval: {
      dependencyGraphUnavailable: dependencyGraphUnavailableCount,
    },
  };
}

function filterEventsByWindow(events: TimestampedEvent[], window: TelemetrySummaryWindow): TimestampedEvent[] {
  const sinceMs = window.sinceIso ? Date.parse(window.sinceIso) : Number.NEGATIVE_INFINITY;
  const untilMs = window.untilIso ? Date.parse(window.untilIso) : Number.POSITIVE_INFINITY;
  return events.filter((event) => {
    const at = Date.parse(event.timestamp);
    if (!Number.isFinite(at)) return false;
    return at >= sinceMs && at <= untilMs;
  });
}
