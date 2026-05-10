import os from "node:os";
import type { SessionExportDocument } from "../../../shared/src/types/session.js";
import { SESSION_EXPORT_SCHEMA_VERSION } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function buildSessionExport(repoRoot: string, input: {
  sessionId?: string;
  version: string;
  sanitize?: boolean;
}): SessionExportDocument {
  const sessionsRepo = new SessionsRepo(repoRoot);
  const session = input.sessionId ? sessionsRepo.findById(input.sessionId) : sessionsRepo.findLatest();
  if (!session) {
    throw new Error(input.sessionId ? `Session '${input.sessionId}' was not found.` : "No session is available to export.");
  }

  const document: SessionExportDocument = {
    schemaVersion: SESSION_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      product: "dh",
      version: input.version,
      repoRoot,
    },
    sanitized: Boolean(input.sanitize),
    payload: {
      session,
      runtimeEvents: new SessionRuntimeEventsRepo(repoRoot).listBySession(session.sessionId),
      summaries: new SessionSummaryRepo(repoRoot).listBySession(session.sessionId),
      checkpoints: new SessionCheckpointsRepo(repoRoot).listBySession(session.sessionId),
      reverts: new SessionRevertRepo(repoRoot).listBySession(session.sessionId),
    },
  };

  return input.sanitize ? sanitizeSessionExport(document, repoRoot) : document;
}

export function sanitizeSessionExport(document: SessionExportDocument, repoRoot: string): SessionExportDocument {
  return redactValue(document, repoRoot) as SessionExportDocument;
}

function redactValue(value: unknown, repoRoot: string, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, repoRoot, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, repoRoot, entryKey),
      ]),
    );
  }
  if (typeof value !== "string") {
    return value;
  }
  if (isSecretKey(key) || containsSecret(value)) {
    return "[REDACTED_SECRET]";
  }
  if (isCommandKey(key)) {
    return "[REDACTED_COMMAND]";
  }
  if (isFileContentKey(key)) {
    return "[REDACTED_FILE_CONTENT]";
  }
  if (isPathLike(value, repoRoot)) {
    return "[REDACTED_PATH]";
  }
  return value;
}

function isSecretKey(key: string): boolean {
  return /api[_-]?key|token|authorization|secret|password/i.test(key);
}

function containsSecret(value: string): boolean {
  return /bearer\s+[a-z0-9._:-]+|sk-[a-z0-9._:-]+/i.test(value);
}

function isCommandKey(key: string): boolean {
  return /command|cmd|shell/i.test(key);
}

function isFileContentKey(key: string): boolean {
  return /content|fileContent|body/i.test(key);
}

function isPathLike(value: string, repoRoot: string): boolean {
  const home = os.homedir();
  return value.startsWith(repoRoot) || value.startsWith(home);
}
