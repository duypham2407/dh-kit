import type { SessionRuntimeEventRecord, SessionSummaryRecord } from "../../../shared/src/types/session-runtime.js";

export type CompactionInput = {
  sessionId: string;
  workflowSummary: string[];
  runtimeEvents: SessionRuntimeEventRecord[];
  summary?: SessionSummaryRecord;
  maxSummaryEntries?: number;
  maxSerializedBytes?: number;
  maxRuntimeEventsInHeuristic?: number;
};

export type CompactionResult = {
  overflow: boolean;
  trimmedWorkflowSummary: string[];
  continuationSummary?: string;
  anchors: {
    latestStage?: string;
    latestCheckpointId?: string;
    unresolvedBlockers: string[];
  };
};

export function compactSessionContext(input: CompactionInput): CompactionResult {
  const maxSummaryEntries = input.maxSummaryEntries ?? 12;
  const maxSerializedBytes = input.maxSerializedBytes ?? 24_000;
  const maxRuntimeEventsInHeuristic = input.maxRuntimeEventsInHeuristic ?? 64;
  // Keep heuristic cost bounded by sampling a fixed tail window.
  // Tail sampling preserves recency while preventing age-based growth.
  const runtimeEventsForHeuristic = input.runtimeEvents.slice(-maxRuntimeEventsInHeuristic);

  const payload = {
    workflowSummary: input.workflowSummary,
    runtimeEvents: runtimeEventsForHeuristic,
    summary: input.summary,
  };
  const bytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  const tooManyEntries = input.workflowSummary.length > maxSummaryEntries;
  const overflow = tooManyEntries || bytes > maxSerializedBytes;

  if (!overflow) {
    return {
      overflow: false,
      trimmedWorkflowSummary: input.workflowSummary,
      anchors: {
        latestStage: input.summary?.latestStage,
        latestCheckpointId: input.summary?.latestCheckpointId,
        unresolvedBlockers: extractUnresolvedBlockers(input.workflowSummary),
      },
    };
  }

  const keepTail = Math.max(4, Math.floor(maxSummaryEntries / 2));
  const tail = input.workflowSummary.slice(-keepTail);
  const blockers = extractUnresolvedBlockers(input.workflowSummary);
  const continuationSummary = [
    `Continuation summary for session ${input.sessionId}:`,
    `- Previous summary entries compacted: ${Math.max(0, input.workflowSummary.length - tail.length)}`,
    `- Runtime events observed: ${input.runtimeEvents.length}`,
    input.runtimeEvents.length > runtimeEventsForHeuristic.length
      ? `- Runtime events sampled for heuristic: ${runtimeEventsForHeuristic.length}`
      : `- Runtime events sampled for heuristic: ${input.runtimeEvents.length}`,
    `- Latest stage: ${input.summary?.latestStage ?? "unknown"}`,
    `- Latest checkpoint: ${input.summary?.latestCheckpointId ?? "unknown"}`,
    blockers.length > 0 ? `- Unresolved blockers: ${blockers.join("; ")}` : "- Unresolved blockers: none",
  ].join("\n");

  return {
    overflow: true,
    trimmedWorkflowSummary: tail,
    continuationSummary,
    anchors: {
      latestStage: input.summary?.latestStage,
      latestCheckpointId: input.summary?.latestCheckpointId,
      unresolvedBlockers: blockers,
    },
  };
}

function extractUnresolvedBlockers(lines: string[]): string[] {
  return lines.filter((line) => line.toLowerCase().includes("blocker")).slice(0, 8);
}
