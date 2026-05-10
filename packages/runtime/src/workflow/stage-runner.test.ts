import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_AGENT_REGISTRY } from "../../../shared/src/constants/roles.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionManager } from "../session/session-manager.js";
import { createWorkflowState } from "./workflow-state-manager.js";
import { StageRunner } from "./stage-runner.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-stage-runner-test-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("StageRunner", () => {
  it("marks post-stage checkpoints as produced inside the TypeScript worker boundary", async () => {
    const repo = makeTmpRepo();
    const agent = DEFAULT_AGENT_REGISTRY.find((entry) => entry.lanes.includes("quick"));
    if (!agent) {
      throw new Error("Missing quick agent fixture.");
    }
    const created = await new SessionManager(repo).createSession("quick", agent);

    await new StageRunner(repo).advance({
      session: created.session,
      workflow: createWorkflowState(created.session),
      latestEnvelope: created.envelope,
    });

    const checkpoint = new SessionCheckpointsRepo(repo)
      .listBySession(created.session.sessionId)
      .find((candidate) => candidate.checkpointType === "post_stage_advance");

    expect(checkpoint?.metadataJson).toMatchObject({
      source: "stage-runner.advance",
      runtimeAuthority: "typescript_worker",
    });
  });
});
