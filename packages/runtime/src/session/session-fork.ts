import type { SessionForkReport } from "../../../shared/src/types/session.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function forkSession(repoRoot: string, sourceSessionId: string, input: { title?: string } = {}): SessionForkReport {
  const sessionsRepo = new SessionsRepo(repoRoot);
  const source = sessionsRepo.findById(sourceSessionId);
  if (!source) {
    throw new Error(`Session '${sourceSessionId}' was not found.`);
  }

  const sessionId = createId("session");
  const timestamp = nowIso();
  sessionsRepo.save({
    ...source,
    sessionId,
    status: "in_progress",
    activeWorkItemIds: [],
    latestSummaryId: undefined,
    latestCheckpointId: undefined,
    latestRevertId: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const runtimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  const summaryRepo = new SessionSummaryRepo(repoRoot);
  const checkpointsRepo = new SessionCheckpointsRepo(repoRoot);
  const revertRepo = new SessionRevertRepo(repoRoot);

  const runtimeEvents = runtimeEventsRepo.listBySession(sourceSessionId);
  const summaries = summaryRepo.listBySession(sourceSessionId);
  const checkpoints = checkpointsRepo.listBySession(sourceSessionId);
  const reverts = revertRepo.listBySession(sourceSessionId);
  const checkpointIdMap = new Map<string, string>();

  for (const event of runtimeEvents) {
    runtimeEventsRepo.saveRecord({
      ...event,
      id: createId("session-runtime-event"),
      sessionId,
      eventJson: rewriteSessionId(event.eventJson, sourceSessionId, sessionId),
    });
  }
  for (const summary of summaries) {
    summaryRepo.saveRecord({ ...summary, id: createId("session-summary"), sessionId });
  }
  for (const checkpoint of checkpoints) {
    const checkpointId = createId("session-checkpoint");
    checkpointIdMap.set(checkpoint.id, checkpointId);
    checkpointsRepo.saveRecord({ ...checkpoint, id: checkpointId, sessionId });
  }
  for (const revert of reverts) {
    revertRepo.saveRecord({
      ...revert,
      id: createId("session-revert"),
      sessionId,
      checkpointId: checkpointIdMap.get(revert.checkpointId) ?? revert.checkpointId,
      previousCheckpointId: revert.previousCheckpointId ? checkpointIdMap.get(revert.previousCheckpointId) ?? revert.previousCheckpointId : undefined,
    });
  }

  runtimeEventsRepo.save({
    sessionId,
    eventType: "session.created",
    eventJson: {
      type: "session.created",
      sessionId,
      payload: {
        commandFamily: "session",
        forkedFromSessionId: sourceSessionId,
        title: input.title,
      },
    },
    createdAt: timestamp,
  });

  return {
    sourceSessionId,
    sessionId,
    copied: {
      runtimeEvents: runtimeEvents.length,
      summaries: summaries.length,
      checkpoints: checkpoints.length,
      reverts: reverts.length,
    },
  };
}

function rewriteSessionId(value: unknown, sourceSessionId: string, targetSessionId: string): Record<string, unknown> {
  return rewriteValue(value, sourceSessionId, targetSessionId) as Record<string, unknown>;
}

function rewriteValue(value: unknown, sourceSessionId: string, targetSessionId: string): unknown {
  if (value === sourceSessionId) return targetSessionId;
  if (Array.isArray(value)) return value.map((item) => rewriteValue(item, sourceSessionId, targetSessionId));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        rewriteValue(entry, sourceSessionId, targetSessionId),
      ]),
    );
  }
  return value;
}
