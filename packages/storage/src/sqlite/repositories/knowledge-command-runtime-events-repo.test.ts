import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../db.js";
import { openDhDatabase } from "../db.js";
import { KnowledgeCommandSessionsRepo } from "./knowledge-command-sessions-repo.js";
import { KnowledgeCommandRuntimeEventsRepo } from "./knowledge-command-runtime-events-repo.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-knowledge-runtime-events-"));
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

describe("KnowledgeCommandRuntimeEventsRepo", () => {
  it("declares FK ownership to knowledge_command_sessions", () => {
    const repo = makeRepo();
    const db = openDhDatabase(repo);
    const fks = db.prepare("PRAGMA foreign_key_list(knowledge_command_runtime_events)").all() as Array<{
      table: string;
      from: string;
      to: string;
    }>;

    expect(fks.some((fk) => fk.table === "knowledge_command_sessions" && fk.from === "knowledge_session_id" && fk.to === "session_id")).toBe(true);
  });

  it("stores and lists compaction events by knowledge session", () => {
    const repo = makeRepo();
    const session = new KnowledgeCommandSessionsRepo(repo).create();
    const events = new KnowledgeCommandRuntimeEventsRepo(repo);

    events.save({
      knowledgeSessionId: session.sessionId,
      eventType: "compaction",
      eventJson: { overflow: true },
    });
    events.save({
      knowledgeSessionId: session.sessionId,
      eventType: "compaction",
      eventJson: { overflow: false },
    });

    const listed = events.listByKnowledgeSession(session.sessionId);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.eventType).toBe("compaction");
    expect(listed[0]?.eventJson).toEqual({ overflow: false });
  });
});
