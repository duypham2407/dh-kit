import type { SessionDeleteReport } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function deleteSession(repoRoot: string, sessionId: string): SessionDeleteReport {
  const sessionsRepo = new SessionsRepo(repoRoot);
  if (!sessionsRepo.findById(sessionId)) {
    throw new Error(`Session '${sessionId}' was not found.`);
  }

  const runtimeEvents = new SessionRuntimeEventsRepo(repoRoot).deleteBySession(sessionId);
  const summaries = new SessionSummaryRepo(repoRoot).deleteBySession(sessionId);
  const reverts = new SessionRevertRepo(repoRoot).deleteBySession(sessionId);
  const checkpoints = new SessionCheckpointsRepo(repoRoot).deleteBySession(sessionId);
  const session = sessionsRepo.deleteById(sessionId);

  return {
    sessionId,
    deleted: { session, runtimeEvents, summaries, checkpoints, reverts },
  };
}
