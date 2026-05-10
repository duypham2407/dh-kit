import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { listSessions, showSession } from "./session-query.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-query-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: overrides.activeWorkItemIds ?? [],
    semanticMode: overrides.semanticMode ?? "auto",
    toolEnforcementLevel: overrides.toolEnforcementLevel ?? "very-hard",
    latestSummaryId: overrides.latestSummaryId,
    latestCheckpointId: overrides.latestCheckpointId,
    latestRevertId: overrides.latestRevertId,
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session query service", () => {
  it("lists sessions through the repository order", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    sessions.save(makeSession(repo, { sessionId: "older", updatedAt: "2026-05-10T01:00:00.000Z" }));
    sessions.save(makeSession(repo, { sessionId: "newer", updatedAt: "2026-05-10T02:00:00.000Z" }));

    expect(listSessions(repo, { limit: 1 }).sessions.map((session) => session.sessionId)).toEqual(["newer"]);
  });

  it("shows latest summary and dependent row counts", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-show" }));
    new SessionSummaryRepo(repo).save({ sessionId: "session-show", filesChanged: 1, additions: 2, deletions: 3 });
    new SessionRuntimeEventsRepo(repo).save({
      sessionId: "session-show",
      eventType: "text.delta",
      eventJson: { payload: { text: "hi" } },
    });

    const report = showSession(repo, "session-show");

    expect(report.session.sessionId).toBe("session-show");
    expect(report.latestSummary?.filesChanged).toBe(1);
    expect(report.counts.runtimeEvents).toBe(1);
    expect(report.counts.summaries).toBe(1);
  });

  it("throws for missing sessions", () => {
    const repo = makeRepo();
    expect(() => showSession(repo, "missing")).toThrow("Session 'missing' was not found.");
  });
});
