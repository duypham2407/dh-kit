import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { buildSessionStats } from "./session-stats.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-stats-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-stats",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  vi.useRealTimers();
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session stats service", () => {
  it("aggregates sessions, runtime events, models, and tools", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-1", lane: "quick", status: "in_progress" }));
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-2", lane: "delivery", status: "complete" }));
    const events = new SessionRuntimeEventsRepo(repo);
    events.save({ sessionId: "session-1", eventType: "message.started", eventJson: { payload: { model: "openai/gpt-5" } } });
    events.save({ sessionId: "session-1", eventType: "tool.started", eventJson: { payload: { toolName: "read" } } });

    const stats = buildSessionStats(repo, { models: 3, tools: 3 });

    expect(stats.totalSessions).toBe(2);
    expect(stats.sessionsByLane).toContainEqual({ key: "quick", count: 1 });
    expect(stats.sessionsByStatus).toContainEqual({ key: "complete", count: 1 });
    expect(stats.runtimeEventsByType).toContainEqual({ key: "message.started", count: 1 });
    expect(stats.topModels).toEqual([{ key: "openai/gpt-5", count: 1 }]);
    expect(stats.topTools).toEqual([{ key: "read", count: 1 }]);
    expect(stats.tokenUsage).toBe("unavailable");
    expect(stats.costUsd).toBe("unavailable");
  });

  it("filters sessions by days using updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "recent", updatedAt: "2026-05-10T00:00:00.000Z" }));
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "old", updatedAt: "2026-04-01T00:00:00.000Z" }));

    expect(buildSessionStats(repo, { days: 7 }).totalSessions).toBe(1);
  });
});
