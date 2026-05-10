import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { buildSessionExport } from "./session-export.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-export-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-export",
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
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session export service", () => {
  it("exports the requested session with dependent rows", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({
      sessionId: "session-export",
      eventType: "message.started",
      eventJson: { payload: { model: "openai/gpt-5" } },
    });

    const exported = buildSessionExport(repo, { sessionId: "session-export", version: "test" });

    expect(exported.schemaVersion).toBe(1);
    expect(exported.source.product).toBe("dh");
    expect(exported.payload.session.sessionId).toBe("session-export");
    expect(exported.payload.runtimeEvents).toHaveLength(1);
  });

  it("exports the latest session when no session id is provided", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    sessions.save(makeSession(repo, { sessionId: "older", updatedAt: "2026-05-10T01:00:00.000Z" }));
    sessions.save(makeSession(repo, { sessionId: "newer", updatedAt: "2026-05-10T02:00:00.000Z" }));

    expect(buildSessionExport(repo, { version: "test" }).payload.session.sessionId).toBe("newer");
  });

  it("sanitizes secrets, paths, file contents, and commands while preserving shape", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({
      sessionId: "session-export",
      eventType: "tool.started",
      eventJson: {
        payload: {
          api_key: "sk-secret",
          path: path.join(repo, "README.md"),
          content: "private file body",
          command: "curl -H Authorization: bearer-secret https://example.test",
        },
      },
    });

    const exported = buildSessionExport(repo, { sessionId: "session-export", version: "test", sanitize: true });
    const text = JSON.stringify(exported);

    expect(exported.sanitized).toBe(true);
    expect(text).toContain("[REDACTED_SECRET]");
    expect(text).toContain("[REDACTED_PATH]");
    expect(text).toContain("[REDACTED_FILE_CONTENT]");
    expect(text).toContain("[REDACTED_COMMAND]");
    expect(text).not.toContain("sk-secret");
    expect(text).not.toContain("private file body");
  });
});
