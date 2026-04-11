import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase, openDhDatabase } from "../../../storage/src/sqlite/db.js";
import { KnowledgeCommandSessionBridge } from "./knowledge-command-session-bridge.js";
import { KnowledgeCommandSessionsRepo } from "../../../storage/src/sqlite/repositories/knowledge-command-sessions-repo.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { KnowledgeCommandSummaryRepo } from "../../../storage/src/sqlite/repositories/knowledge-command-summary-repo.js";
import { KnowledgeCommandRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-knowledge-bridge-"));
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

describe("KnowledgeCommandSessionBridge", () => {
  it("creates a new session when resume id is not provided", () => {
    const repo = makeRepo();
    const bridge = new KnowledgeCommandSessionBridge(repo);

    const result = bridge.resolveSession({
      kind: "ask",
      prompt: "where is auth handled?",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.resumed).toBe(false);
    expect(result.session.sessionId).toMatch(/^knowledge-session-/);
  });

  it("resumes an existing active knowledge session", () => {
    const repo = makeRepo();
    const sessions = new KnowledgeCommandSessionsRepo(repo);
    const existing = sessions.create();
    const bridge = new KnowledgeCommandSessionBridge(repo);

    const result = bridge.resolveSession({
      kind: "explain",
      prompt: "runLaneWorkflow",
      resumeSessionId: existing.sessionId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.resumed).toBe(true);
    expect(result.session.sessionId).toBe(existing.sessionId);
  });

  it("fails for invalid session id", () => {
    const repo = makeRepo();
    const bridge = new KnowledgeCommandSessionBridge(repo);

    const result = bridge.resolveSession({
      kind: "trace",
      prompt: "auth flow",
      resumeSessionId: "knowledge-session-missing",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("was not found");
  });

  it("fails for foreign-repo session id", () => {
    const repo = makeRepo();
    const sessions = new KnowledgeCommandSessionsRepo(repo);
    const existing = sessions.create();
    sessions.save({
      ...existing,
      repoRoot: `${repo}-other`,
      updatedAt: new Date().toISOString(),
    });

    const bridge = new KnowledgeCommandSessionBridge(repo);
    const result = bridge.resolveSession({
      kind: "ask",
      prompt: "auth",
      resumeSessionId: existing.sessionId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("different repository");
  });

  it("fails for non-resumable closed session", () => {
    const repo = makeRepo();
    const sessions = new KnowledgeCommandSessionsRepo(repo);
    const existing = sessions.create();
    sessions.save({
      ...existing,
      status: "closed",
      updatedAt: new Date().toISOString(),
    });

    const bridge = new KnowledgeCommandSessionBridge(repo);
    const result = bridge.resolveSession({
      kind: "trace",
      prompt: "auth path",
      resumeSessionId: existing.sessionId,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.reason).toContain("not resumable");
  });

  it("records compaction overflow when prompt is large", () => {
    const repo = makeRepo();
    new ConfigRepo(repo).write("session.auto_compaction", true);
    const bridge = new KnowledgeCommandSessionBridge(repo);

    const result = bridge.resolveSession({
      kind: "ask",
      prompt: "x".repeat(60_000),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.compaction.attempted).toBe(true);
    expect(result.compaction.overflow).toBe(true);
    expect(result.compaction.compacted).toBe(true);
    expect(result.compaction.continuationSummaryGeneratedInMemory).toBe(true);
    expect(result.compaction.continuationSummaryPersisted).toBe(true);
    expect(result.persistence.persisted).toBe(true);

    const summary = new KnowledgeCommandSummaryRepo(repo).findByKnowledgeSession(result.session.sessionId);
    const events = new KnowledgeCommandRuntimeEventsRepo(repo).listByKnowledgeSession(result.session.sessionId);
    expect(summary?.continuationSummary).toContain("Continuation summary");
    expect(events).toHaveLength(1);
    expect(summary?.compactionEventId).toBe(events[0]?.id);
  });

  it("truncates persisted lastInput to keep bounded history", () => {
    const repo = makeRepo();
    const bridge = new KnowledgeCommandSessionBridge(repo);

    const result = bridge.resolveSession({
      kind: "ask",
      prompt: "x".repeat(20_000),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.session.lastInput?.length).toBeLessThan(2_200);
    expect(result.session.lastInput).toContain("[truncated");
  });

  it("fails fast and marks persistence warning when cross-surface write fails", () => {
    const repo = makeRepo();
    const bridge = new KnowledgeCommandSessionBridge(repo);
    const session = new KnowledgeCommandSessionsRepo(repo).create();
    const db = new ConfigRepo(repo);
    db.write("session.auto_compaction", true);

    // Simulate summary-surface outage after bridge/session setup.
    const database = openDhDatabase(repo);
    database.exec("DROP TABLE knowledge_command_summaries");

    const result = bridge.resolveSession({
      kind: "ask",
      prompt: "x".repeat(60_000),
      resumeSessionId: session.sessionId,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.persistence.persisted).toBe(false);
    expect(result.persistence.warning).toContain("Cross-surface persistence failed");
    expect(result.compaction.continuationSummaryGeneratedInMemory).toBe(true);
    expect(result.compaction.continuationSummaryPersisted).toBe(false);
  });
});
