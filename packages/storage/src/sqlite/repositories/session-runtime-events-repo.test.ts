import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { SessionRuntimeEventsRepo } from "./session-runtime-events-repo.js";
import { SessionsRepo } from "./sessions-repo.js";
import type { SessionState } from "../../../../shared/src/types/session.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-events-repo-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "sess-1",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    updatedAt: overrides.updatedAt ?? new Date().toISOString(),
    activeWorkItemIds: overrides.activeWorkItemIds ?? [],
    semanticMode: overrides.semanticMode ?? "auto",
    toolEnforcementLevel: overrides.toolEnforcementLevel ?? "very-hard",
    latestSummaryId: overrides.latestSummaryId,
    latestCheckpointId: overrides.latestCheckpointId,
    latestRevertId: overrides.latestRevertId,
  };
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
  }
  repos = [];
});

describe("SessionRuntimeEventsRepo", () => {
  it("stores and lists events for session", () => {
    const repo = makeRepo();
    const sessionsRepo = new SessionsRepo(repo);
    sessionsRepo.save(makeSession(repo));
    const events = new SessionRuntimeEventsRepo(repo);

    events.save({ sessionId: "sess-1", eventType: "busy", eventJson: { runId: "r1" } });
    events.save({ sessionId: "sess-1", eventType: "idle", eventJson: { runId: "r1" } });

    const listed = events.listBySession("sess-1");
    expect(listed).toHaveLength(2);
    expect(listed[0]?.eventType).toBe("idle");
  });

  it("lists run events by event type for latest run-session lookup", () => {
    const repo = makeRepo();
    const sessionsRepo = new SessionsRepo(repo);
    sessionsRepo.save(makeSession(repo, { sessionId: "session-old" }));
    sessionsRepo.save(makeSession(repo, { sessionId: "session-new" }));
    const events = new SessionRuntimeEventsRepo(repo);

    events.save({
      sessionId: "session-old",
      eventType: "session.created",
      eventJson: { commandFamily: "run" },
      createdAt: "2026-05-10T01:00:00.000Z",
    });
    events.save({
      sessionId: "session-new",
      eventType: "session.created",
      eventJson: { commandFamily: "run" },
      createdAt: "2026-05-10T02:00:00.000Z",
    });

    expect(events.listByEventType("session.created")[0]?.sessionId).toBe("session-new");
  });

  it("upserts imported records and deletes events by session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-import" }));
    const events = new SessionRuntimeEventsRepo(repo);

    events.saveRecord({
      id: "event-imported",
      sessionId: "session-import",
      eventType: "text.delta",
      eventJson: { payload: { text: "first" } },
      createdAt: "2026-05-10T02:00:00.000Z",
    });
    events.saveRecord({
      id: "event-imported",
      sessionId: "session-import",
      eventType: "text.delta",
      eventJson: { payload: { text: "second" } },
      createdAt: "2026-05-10T03:00:00.000Z",
    });

    expect(events.listBySession("session-import")).toHaveLength(1);
    expect(events.listBySession("session-import")[0]?.eventJson).toEqual({ payload: { text: "second" } });
    expect(events.deleteBySession("session-import")).toBe(1);
    expect(events.listBySession("session-import")).toHaveLength(0);
  });
});
