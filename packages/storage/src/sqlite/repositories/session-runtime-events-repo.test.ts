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
    const session: SessionState = {
      sessionId: "sess-1",
      repoRoot: repo,
      lane: "quick",
      laneLocked: true,
      currentStage: "quick_plan",
      status: "in_progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      activeWorkItemIds: [],
      semanticMode: "auto",
      toolEnforcementLevel: "very-hard",
    };
    sessionsRepo.save(session);
    const events = new SessionRuntimeEventsRepo(repo);

    events.save({ sessionId: "sess-1", eventType: "busy", eventJson: { runId: "r1" } });
    events.save({ sessionId: "sess-1", eventType: "idle", eventJson: { runId: "r1" } });

    const listed = events.listBySession("sess-1");
    expect(listed).toHaveLength(2);
    expect(listed[0]?.eventType).toBe("idle");
  });
});
