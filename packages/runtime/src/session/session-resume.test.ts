import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { resumeSession } from "./session-resume.js";
import { SessionStore } from "../../../storage/src/fs/session-store.js";
import type { PersistedSessionRecord } from "../../../storage/src/fs/session-store.js";
import { resolveDhPaths } from "../../../shared/src/utils/path.js";
import type { WorkflowStage } from "../../../shared/src/types/stage.js";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { SessionState } from "../../../shared/src/types/session.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-resume-"));
  fs.mkdirSync(path.join(repo, ".dh", "sessions"), { recursive: true });
  return repo;
}

async function writeSession(repo: string, sessionId: string, lane: WorkflowLane | "broken-lane") {
  const store = new SessionStore(repo);
  const stage = (lane === "quick" ? "quick_plan" : lane === "delivery" ? "delivery_analysis" : "migration_baseline") as WorkflowStage;
  const session: SessionState = {
    sessionId,
    repoRoot: repo,
    lane: lane as WorkflowLane,
    laneLocked: true,
    currentStage: stage,
    status: "in_progress",
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
    activeWorkItemIds: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const payload: PersistedSessionRecord = {
    session,
    workflow: {
      lane: lane as WorkflowLane,
      stage,
      stageStatus: "in_progress",
      gateStatus: "pending",
      blockers: [],
    },
    envelopes: [],
  };
  await store.write(payload);
}

describe("resumeSession", () => {
  it("resumes when lane lock is compatible", async () => {
    const repo = makeRepo();
    await writeSession(repo, "sess-1", "quick");

    const result = await resumeSession(repo, "sess-1", "quick");
    expect(result.ok).toBe(true);
    expect(result.reason).toContain("Resumed session");
  });

  it("fails when lane lock conflicts", async () => {
    const repo = makeRepo();
    await writeSession(repo, "sess-2", "delivery");

    const result = await resumeSession(repo, "sess-2", "quick");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Lane is locked");
  });

  it("fails gracefully on corrupted lane value", async () => {
    const repo = makeRepo();
    await writeSession(repo, "sess-3", "broken-lane");

    const result = await resumeSession(repo, "sess-3", "quick");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("corrupted");
  });

  it("fails gracefully on invalid JSON", async () => {
    const repo = makeRepo();
    const dataHome = resolveDhPaths(repo).dataHome;
    fs.mkdirSync(path.join(dataHome, "sessions"), { recursive: true });
    fs.writeFileSync(path.join(dataHome, "sessions", "sess-4.json"), "{ not-json", "utf8");

    const result = await resumeSession(repo, "sess-4", "quick");
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("Failed to read session");
  });
});
