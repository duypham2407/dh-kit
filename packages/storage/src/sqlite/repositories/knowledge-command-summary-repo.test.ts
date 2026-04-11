import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { openDhDatabase } from "../db.js";
import { KnowledgeCommandSessionsRepo } from "./knowledge-command-sessions-repo.js";
import { KnowledgeCommandSummaryRepo } from "./knowledge-command-summary-repo.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-knowledge-summary-repo-"));
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

describe("KnowledgeCommandSummaryRepo", () => {
  it("declares FK ownership to knowledge_command_sessions", () => {
    const repo = makeRepo();
    const db = openDhDatabase(repo);
    const fks = db.prepare("PRAGMA foreign_key_list(knowledge_command_summaries)").all() as Array<{
      table: string;
      from: string;
      to: string;
    }>;

    expect(fks.some((fk) => fk.table === "knowledge_command_sessions" && fk.from === "knowledge_session_id" && fk.to === "session_id")).toBe(true);
  });

  it("upserts and reads latest resume-visible knowledge summary state", () => {
    const repo = makeRepo();
    const session = new KnowledgeCommandSessionsRepo(repo).create();
    const summaries = new KnowledgeCommandSummaryRepo(repo);

    summaries.save({
      knowledgeSessionId: session.sessionId,
      lastCommandKind: "ask",
      lastRunAt: new Date().toISOString(),
      compactionAttempted: true,
      compactionOverflow: true,
      compactionApplied: true,
      continuationSummary: "summary-v1",
      continuationCreatedAt: new Date().toISOString(),
    });

    summaries.save({
      knowledgeSessionId: session.sessionId,
      lastCommandKind: "trace",
      lastRunAt: new Date().toISOString(),
      compactionAttempted: true,
      compactionOverflow: false,
      compactionApplied: false,
      continuationSummary: "summary-v2",
      continuationCreatedAt: new Date().toISOString(),
      compactionEventId: "event-2",
    });

    const found = summaries.findByKnowledgeSession(session.sessionId);
    expect(found?.lastCommandKind).toBe("trace");
    expect(found?.compactionApplied).toBe(false);
    expect(found?.continuationSummary).toBe("summary-v2");
    expect(found?.compactionEventId).toBe("event-2");
  });
});
