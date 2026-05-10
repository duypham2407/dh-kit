import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { forkSession } from "./session-fork.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-fork-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string): SessionState {
  return {
    sessionId: "session-source",
    repoRoot,
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "complete",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: ["work-1"],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session fork service", () => {
  it("forks metadata and runtime events into a new active session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({
      sessionId: "session-source",
      eventType: "text.delta",
      eventJson: { payload: { text: "source" } },
    });

    const report = forkSession(repo, "session-source", { title: "Forked title" });
    const forked = new SessionsRepo(repo).findById(report.sessionId);
    const events = new SessionRuntimeEventsRepo(repo).listBySession(report.sessionId);

    expect(report.sourceSessionId).toBe("session-source");
    expect(report.sessionId).not.toBe("session-source");
    expect(forked?.status).toBe("in_progress");
    expect(forked?.activeWorkItemIds).toEqual([]);
    expect(events.some((event) => event.eventType === "session.created")).toBe(true);
    expect(events.some((event) => JSON.stringify(event.eventJson).includes("session-source"))).toBe(true);
  });
});
