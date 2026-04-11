import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { SessionSummaryRepo } from "./session-summary-repo.js";
import { SessionsRepo } from "./sessions-repo.js";
import type { SessionState } from "../../../../shared/src/types/session.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-summary-repo-"));
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

describe("SessionSummaryRepo", () => {
  it("saves and returns latest summary by session", () => {
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
    const summaries = new SessionSummaryRepo(repo);

    summaries.save({ sessionId: "sess-1", filesChanged: 1, additions: 2, deletions: 0 });
    const latest = summaries.save({ sessionId: "sess-1", filesChanged: 3, additions: 5, deletions: 1 });

    const found = summaries.findLatestBySession("sess-1");
    expect(found?.id).toBe(latest.id);
    expect(found?.filesChanged).toBe(3);
  });
});
