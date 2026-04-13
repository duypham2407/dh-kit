import type { SessionSummaryRecord } from "../../../shared/src/types/session-runtime.js";

export function summarizeWorkflowArtifacts(input: {
  workflowSummary: string[];
  stage?: string;
  previous?: SessionSummaryRecord;
  latestCheckpointId?: string;
  continuationSummary?: string;
}): Omit<SessionSummaryRecord, "id" | "sessionId" | "updatedAt"> {
  const previous = input.previous;
  const changed = parseFileChangeStats(input.workflowSummary);

  const filesChanged = Math.max(previous?.filesChanged ?? 0, changed.filesChanged);
  const additions = (previous?.additions ?? 0) + changed.additions;
  const deletions = (previous?.deletions ?? 0) + changed.deletions;

  return {
    filesChanged,
    additions,
    deletions,
    lastDiffAt: changed.touched ? new Date().toISOString() : previous?.lastDiffAt,
    latestStage: input.stage as SessionSummaryRecord["latestStage"] | undefined,
    latestCheckpointId: input.latestCheckpointId ?? previous?.latestCheckpointId,
    continuationSummary: input.continuationSummary ?? previous?.continuationSummary,
    continuationCreatedAt: input.continuationSummary ? new Date().toISOString() : previous?.continuationCreatedAt,
  };
}

function parseFileChangeStats(lines: string[]): { filesChanged: number; additions: number; deletions: number; touched: boolean } {
  let filesChanged = 0;
  let additions = 0;
  let deletions = 0;
  let touched = false;

  for (const line of lines) {
    const normalized = line.toLowerCase();

    const filesChangedMatch = normalized.match(/files?\s*changed\s*[:=]\s*(\d+)/);
    if (filesChangedMatch) {
      filesChanged = Math.max(filesChanged, Number(filesChangedMatch[1]));
      touched = true;
    }

    const additionsMatch = normalized.match(/additions?\s*[:=]\s*(\d+)/);
    if (additionsMatch) {
      additions += Number(additionsMatch[1]);
      touched = true;
    }

    const deletionsMatch = normalized.match(/deletions?\s*[:=]\s*(\d+)/);
    if (deletionsMatch) {
      deletions += Number(deletionsMatch[1]);
      touched = true;
    }
  }

  return { filesChanged, additions, deletions, touched };
}
