import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionExportDocument, SessionState } from "../../../shared/src/types/session.js";
import { importSessionDocument, parseSessionExportJson } from "./session-import.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-import-"));
  repos.push(repo);
  return repo;
}

function makeDocument(repoRoot: string): SessionExportDocument {
  const session: SessionState = {
    sessionId: "session-import",
    repoRoot: "/old/repo",
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "in_progress",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
  return {
    schemaVersion: 1,
    exportedAt: "2026-05-10T00:00:00.000Z",
    source: { product: "dh", version: "test", repoRoot },
    sanitized: false,
    payload: {
      session,
      runtimeEvents: [{
        id: "event-import",
        sessionId: "session-import",
        eventType: "text.delta",
        eventJson: { payload: { text: "hello" } },
        createdAt: "2026-05-10T00:00:01.000Z",
      }],
      summaries: [],
      checkpoints: [],
      reverts: [],
    },
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session import service", () => {
  it("imports a version 1 export into the current repo root", () => {
    const repo = makeRepo();
    const report = importSessionDocument(repo, makeDocument(repo));

    expect(report.sessionId).toBe("session-import");
    expect(report.imported.runtimeEvents).toBe(1);
    expect(new SessionsRepo(repo).findById("session-import")?.repoRoot).toBe(repo);
    expect(new SessionRuntimeEventsRepo(repo).listBySession("session-import")).toHaveLength(1);
  });

  it("parses valid JSON and rejects malformed JSON", () => {
    expect(parseSessionExportJson(JSON.stringify(makeDocument("/repo"))).schemaVersion).toBe(1);
    expect(() => parseSessionExportJson("{")).toThrow("Could not parse session export JSON:");
  });

  it("rejects future schema versions", () => {
    const document = { ...makeDocument("/repo"), schemaVersion: 2 };
    expect(() => importSessionDocument(makeRepo(), document)).toThrow(
      "Unsupported session export schema version 2. This DH build supports version 1.",
    );
  });
});
