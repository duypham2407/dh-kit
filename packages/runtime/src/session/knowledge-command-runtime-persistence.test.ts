import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase, openDhDatabase } from "../../../storage/src/sqlite/db.js";
import { KnowledgeCommandSessionsRepo } from "../../../storage/src/sqlite/repositories/knowledge-command-sessions-repo.js";
import { KnowledgeCommandRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.js";
import { KnowledgeCommandSummaryRepo } from "../../../storage/src/sqlite/repositories/knowledge-command-summary-repo.js";
import { KnowledgeCommandRuntimePersistence } from "./knowledge-command-runtime-persistence.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-knowledge-runtime-persist-"));
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

describe("KnowledgeCommandRuntimePersistence", () => {
  it("persists compaction event and summary as one outcome", () => {
    const repo = makeRepo();
    const session = new KnowledgeCommandSessionsRepo(repo).create();
    const persistence = new KnowledgeCommandRuntimePersistence(repo);

    const result = persistence.persistCompactionOutcome({
      knowledgeSessionId: session.sessionId,
      commandKind: "trace",
      lastRunAt: new Date().toISOString(),
      compaction: {
        attempted: true,
        overflow: true,
        compacted: true,
        continuationSummary: "cont-summary",
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    const events = new KnowledgeCommandRuntimeEventsRepo(repo).listByKnowledgeSession(session.sessionId);
    const summary = new KnowledgeCommandSummaryRepo(repo).findByKnowledgeSession(session.sessionId);
    expect(events).toHaveLength(1);
    expect(summary?.compactionEventId).toBe(events[0]?.id);
    expect(summary?.continuationSummary).toBe("cont-summary");
  });

  it("rolls back event write when summary write fails", () => {
    const repo = makeRepo();
    const session = new KnowledgeCommandSessionsRepo(repo).create();
    const db = openDhDatabase(repo);
    db.exec("DROP TABLE knowledge_command_summaries");
    const persistence = new KnowledgeCommandRuntimePersistence(repo);

    const result = persistence.persistCompactionOutcome({
      knowledgeSessionId: session.sessionId,
      commandKind: "ask",
      lastRunAt: new Date().toISOString(),
      compaction: {
        attempted: true,
        overflow: true,
        compacted: true,
        continuationSummary: "will-fail",
      },
    });

    expect(result.ok).toBe(false);
    const events = new KnowledgeCommandRuntimeEventsRepo(repo).listByKnowledgeSession(session.sessionId);
    expect(events).toHaveLength(0);
  });
});
