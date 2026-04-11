import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { KnowledgeCommandSessionsRepo } from "./knowledge-command-sessions-repo.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-knowledge-sessions-repo-"));
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

describe("KnowledgeCommandSessionsRepo", () => {
  it("creates and reads knowledge session records", () => {
    const repo = makeRepo();
    const sessions = new KnowledgeCommandSessionsRepo(repo);

    const created = sessions.create();
    const found = sessions.findById(created.sessionId);

    expect(found?.sessionId).toBe(created.sessionId);
    expect(found?.repoRoot).toBe(repo);
    expect(found?.status).toBe("active");
    expect(found?.lastCompacted).toBe(false);
  });

  it("updates last run metadata additively", () => {
    const repo = makeRepo();
    const sessions = new KnowledgeCommandSessionsRepo(repo);

    const created = sessions.create();
    sessions.save({
      ...created,
      lastCommandKind: "trace",
      lastInput: "auth flow",
      lastCompacted: true,
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const found = sessions.findById(created.sessionId);
    expect(found?.lastCommandKind).toBe("trace");
    expect(found?.lastInput).toBe("auth flow");
    expect(found?.lastCompacted).toBe(true);
  });
});
