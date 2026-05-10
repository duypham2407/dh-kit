import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { deleteSession } from "./session-delete.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-delete-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string): SessionState {
  return {
    sessionId: "session-delete",
    repoRoot,
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
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session delete service", () => {
  it("deletes a session and dependent runtime rows", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({ sessionId: "session-delete", eventType: "text.delta", eventJson: {} });

    const report = deleteSession(repo, "session-delete");

    expect(report.deleted.session).toBe(1);
    expect(report.deleted.runtimeEvents).toBe(1);
    expect(new SessionsRepo(repo).findById("session-delete")).toBeUndefined();
  });

  it("throws for missing sessions", () => {
    expect(() => deleteSession(makeRepo(), "missing")).toThrow("Session 'missing' was not found.");
  });
});
