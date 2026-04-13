import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase, openDhDatabase } from "../../../storage/src/sqlite/db.js";
import { runKnowledgeCommand } from "./run-knowledge-command.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-run-knowledge-"));
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

describe("runKnowledgeCommand", () => {
  it("returns missing input error unchanged", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(1);
    expect(report.message).toContain("Missing input");
  });

  it("creates a knowledge session and returns additive metadata", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how auth works",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.command).toBe("ask");
    expect(report.intent).toBeTruthy();
    expect(report.sessionId).toBeDefined();
    expect(report.resumed).toBe(false);
    expect(report.compaction?.attempted).toBe(true);
    expect(typeof report.compaction?.continuationSummaryGeneratedInMemory).toBe("boolean");
    expect(typeof report.compaction?.continuationSummaryPersisted).toBe("boolean");
    expect(typeof report.persistence?.persisted).toBe("boolean");
  });

  it("preserves existing report fields and adds session fields optionally", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "where is workflow state persisted",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(typeof report.command).toBe("string");
    expect(typeof report.repo).toBe("string");
    expect(typeof report.intent).toBe("string");
    expect(Array.isArray(report.tools)).toBe(true);
    expect(Array.isArray(report.seedTerms)).toBe(true);
    expect(typeof report.workspaceCount).toBe("number");
    expect(typeof report.resultCount).toBe("number");
    expect(typeof report.evidenceCount).toBe("number");
    expect(Array.isArray(report.evidencePreview)).toBe(true);
    expect(report.sessionId).toBeDefined();
    expect(typeof report.resumed).toBe("boolean");
    expect(report.compaction).toBeDefined();
  });

  it("resumes a session when resumeSessionId is supplied", async () => {
    const repo = makeRepo();
    const first = await runKnowledgeCommand({
      kind: "explain",
      input: "runLaneWorkflow",
      repoRoot: repo,
    });

    const resumed = await runKnowledgeCommand({
      kind: "trace",
      input: "workflow state flow",
      repoRoot: repo,
      resumeSessionId: first.sessionId,
    });

    expect(first.exitCode).toBe(0);
    expect(first.sessionId).toBeDefined();
    expect(resumed.exitCode).toBe(0);
    expect(resumed.sessionId).toBe(first.sessionId);
    expect(resumed.resumed).toBe(true);
  });

  it("fails clearly on invalid resume session id", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "auth flow",
      repoRoot: repo,
      resumeSessionId: "knowledge-session-not-found",
    });

    expect(report.exitCode).toBe(1);
    expect(report.message).toContain("was not found");
  });

  it("surfaces compaction trigger metadata when prompt overflows", async () => {
    const repo = makeRepo();
    new ConfigRepo(repo).write("session.auto_compaction", true);
    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "x".repeat(60_000),
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.compaction?.attempted).toBe(true);
    expect(report.compaction?.overflow).toBe(true);
    expect(report.compaction?.compacted).toBe(true);
    expect(report.compaction?.continuationSummaryGeneratedInMemory).toBe(true);
    expect(report.compaction?.continuationSummaryPersisted).toBe(true);
    expect(report.persistence?.persisted).toBe(true);
  });

  it("keeps command success but reports persistence failure when bridge writes fail", async () => {
    const repo = makeRepo();
    openDhDatabase(repo).exec("DROP TABLE knowledge_command_summaries");

    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "x".repeat(60_000),
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.persistence?.persisted).toBe(false);
    expect(report.persistence?.warning).toContain("Cross-surface persistence failed");
  });
});
