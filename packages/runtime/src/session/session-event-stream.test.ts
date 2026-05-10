import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { SessionEventStream } from "./session-event-stream.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-run-events-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string): SessionState {
  return {
    sessionId: "session-run-1",
    repoRoot,
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "in_progress",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "always",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos = [];
});

describe("SessionEventStream", () => {
  it("emits ordered run events and persists them as session runtime events", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    const stream = new SessionEventStream({ repoRoot: repo, sessionId: "session-run-1" });

    stream.emit("session.created", { commandFamily: "run", title: "Inspect repo" });
    stream.emit("message.started", { role: "assistant" });
    stream.emit("text.delta", { text: "hello" });
    stream.emit("session.finished", { finalStatus: "clean_success" });

    expect(stream.events.map((event) => event.sequence)).toEqual([1, 2, 3, 4]);
    expect(stream.events.map((event) => event.type)).toEqual([
      "session.created",
      "message.started",
      "text.delta",
      "session.finished",
    ]);

    const persisted = new SessionRuntimeEventsRepo(repo).listBySession("session-run-1");
    expect(persisted.map((event) => event.eventType)).toEqual([
      "session.finished",
      "text.delta",
      "message.started",
      "session.created",
    ]);
    expect(persisted[0]?.eventJson).toMatchObject({
      type: "session.finished",
      sequence: 4,
      payload: { finalStatus: "clean_success" },
    });
  });
});
