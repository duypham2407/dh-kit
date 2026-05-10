import type { SessionListReport, SessionShowReport } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function listSessions(repoRoot: string, input: { limit?: number } = {}): SessionListReport {
  return {
    sessions: new SessionsRepo(repoRoot).list({ limit: input.limit ?? 20 }),
  };
}

export function showSession(repoRoot: string, sessionId: string): SessionShowReport {
  const session = new SessionsRepo(repoRoot).findById(sessionId);
  if (!session) {
    throw new Error(`Session '${sessionId}' was not found.`);
  }

  const runtimeEvents = new SessionRuntimeEventsRepo(repoRoot).listBySession(sessionId);
  const summaries = new SessionSummaryRepo(repoRoot).listBySession(sessionId);
  const checkpoints = new SessionCheckpointsRepo(repoRoot).listBySession(sessionId);
  const reverts = new SessionRevertRepo(repoRoot).listBySession(sessionId);

  return {
    session,
    latestSummary: summaries[0],
    counts: {
      runtimeEvents: runtimeEvents.length,
      summaries: summaries.length,
      checkpoints: checkpoints.length,
      reverts: reverts.length,
    },
  };
}
