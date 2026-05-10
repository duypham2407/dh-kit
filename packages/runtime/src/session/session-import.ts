import type { SessionExportDocument, SessionImportReport } from "../../../shared/src/types/session.js";
import { SESSION_EXPORT_SCHEMA_VERSION } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function parseSessionExportJson(text: string): SessionExportDocument {
  try {
    return JSON.parse(text) as SessionExportDocument;
  } catch (error) {
    throw new Error(`Could not parse session export JSON: ${(error as Error).message}`);
  }
}

export function importSessionDocument(repoRoot: string, document: unknown): SessionImportReport {
  assertSessionExportDocument(document);
  const session = {
    ...document.payload.session,
    repoRoot,
  };

  new SessionsRepo(repoRoot).save(session);
  const runtimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  const summaryRepo = new SessionSummaryRepo(repoRoot);
  const checkpointsRepo = new SessionCheckpointsRepo(repoRoot);
  const revertRepo = new SessionRevertRepo(repoRoot);

  for (const event of document.payload.runtimeEvents) {
    runtimeEventsRepo.saveRecord({ ...event, sessionId: session.sessionId });
  }
  for (const summary of document.payload.summaries) {
    summaryRepo.saveRecord({ ...summary, sessionId: session.sessionId });
  }
  for (const checkpoint of document.payload.checkpoints) {
    checkpointsRepo.saveRecord({ ...checkpoint, sessionId: session.sessionId });
  }
  for (const revert of document.payload.reverts) {
    revertRepo.saveRecord({ ...revert, sessionId: session.sessionId });
  }

  return {
    sessionId: session.sessionId,
    imported: {
      runtimeEvents: document.payload.runtimeEvents.length,
      summaries: document.payload.summaries.length,
      checkpoints: document.payload.checkpoints.length,
      reverts: document.payload.reverts.length,
    },
  };
}

function assertSessionExportDocument(value: unknown): asserts value is SessionExportDocument {
  const candidate = value as Partial<SessionExportDocument>;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid session export: expected an object.");
  }
  if (candidate.schemaVersion !== SESSION_EXPORT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported session export schema version ${String(candidate.schemaVersion)}. This DH build supports version 1.`,
    );
  }
  if (!candidate.payload?.session?.sessionId) {
    throw new Error("Invalid session export: payload.session.sessionId is required.");
  }
  if (
    !Array.isArray(candidate.payload.runtimeEvents) ||
    !Array.isArray(candidate.payload.summaries) ||
    !Array.isArray(candidate.payload.checkpoints) ||
    !Array.isArray(candidate.payload.reverts)
  ) {
    throw new Error("Invalid session export: payload child collections must be arrays.");
  }
}
