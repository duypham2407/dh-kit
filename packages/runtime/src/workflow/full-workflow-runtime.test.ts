import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import {
  FULL_WORKFLOW_APPROVAL_GATES,
  FULL_WORKFLOW_ROLES,
  FULL_WORKFLOW_STAGES,
  startFullWorkflow,
  advanceFullWorkflow,
  inspectFullWorkflow,
  rerouteFullWorkflow,
  blockFullWorkflow,
  runFullWorkflowSupportRole,
} from "./full-workflow-runtime.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-full-workflow-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos.length = 0;
});

describe("full workflow runtime", () => {
  it("defines the bounded OpenKit-style role, stage, and gate contracts", () => {
    expect(FULL_WORKFLOW_ROLES.map((role) => role.id)).toEqual([
      "master_orchestrator",
      "product_lead",
      "solution_lead",
      "fullstack_agent",
      "code_reviewer",
      "qa_agent",
      "context_scout",
      "summarizer",
    ]);
    expect(FULL_WORKFLOW_STAGES).toEqual([
      "full_intake",
      "full_product",
      "full_solution",
      "full_implementation",
      "full_code_review",
      "full_qa",
      "full_done",
    ]);
    expect(FULL_WORKFLOW_APPROVAL_GATES.map((gate) => gate.id)).toEqual([
      "product_to_solution",
      "solution_to_fullstack",
      "fullstack_to_code_review",
      "code_review_to_qa",
      "qa_to_done",
    ]);
  });

  it("starts a parent session with Product Lead as first child task and audit evidence", async () => {
    const repo = makeRepo();

    const report = await startFullWorkflow({ repoRoot: repo, objective: "ship auth refactor", maxReadOnlyWorkers: 2 });

    expect(report.parentSessionId).toMatch(/^session-/);
    expect(report.state.currentStage).toBe("full_product");
    expect(report.state.currentOwner).toBe("product_lead");
    expect(report.state.status).toBe("running");
    expect(report.state.concurrency).toEqual({ maxReadOnlyWorkers: 2, singleWriteOwner: "fullstack_agent" });
    expect(report.state.childSessions).toEqual([
      expect.objectContaining({ role: "product_lead", stage: "full_product", status: "complete", permission: "read_only" }),
    ]);
    expect(report.state.artifacts).toEqual([
      expect.objectContaining({ role: "product_lead", stage: "full_product", type: "role_output" }),
    ]);
    expect(new SessionsRepo(repo).findById(report.parentSessionId)).toMatchObject({
      lane: "full",
      currentStage: "full_product",
      status: "in_progress",
    });
    expect(new SessionRuntimeEventsRepo(repo).listBySession(report.parentSessionId).map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "full.started",
      "full.role.started",
      "full.role.finished",
    ]));
  });

  it("advances through approval gates and supports inspectable reroute issues", async () => {
    const repo = makeRepo();
    const started = await startFullWorkflow({ repoRoot: repo, objective: "ship auth refactor" });

    const advanced = await advanceFullWorkflow({
      repoRoot: repo,
      parentSessionId: started.parentSessionId,
      gateId: "product_to_solution",
      decision: "approve",
    });
    const rerouted = await rerouteFullWorkflow({
      repoRoot: repo,
      parentSessionId: started.parentSessionId,
      finding: "implementation bug",
      targetStage: "full_implementation",
    });
    const inspected = await inspectFullWorkflow({ repoRoot: repo, parentSessionId: started.parentSessionId });

    expect(advanced.state.currentStage).toBe("full_solution");
    expect(advanced.state.currentOwner).toBe("solution_lead");
    expect(advanced.state.approvals).toContainEqual(expect.objectContaining({
      gateId: "product_to_solution",
      decision: "approve",
    }));
    expect(rerouted.state.currentStage).toBe("full_implementation");
    expect(rerouted.state.currentOwner).toBe("fullstack_agent");
    expect(inspected.state.rerouteIssues).toContainEqual(expect.objectContaining({
      finding: "implementation bug",
      targetStage: "full_implementation",
    }));
    expect(new SessionRuntimeEventsRepo(repo).listBySession(started.parentSessionId).map((event) => event.eventType)).toContain("full.rerouted");
  });

  it("runs support roles and blocks the parent workflow through orchestrator routes", async () => {
    const repo = makeRepo();
    const started = await startFullWorkflow({ repoRoot: repo, objective: "ship auth refactor" });

    const scouted = await runFullWorkflowSupportRole({
      repoRoot: repo,
      parentSessionId: started.parentSessionId,
      role: "context_scout",
      stage: "full_product",
    });
    const blocked = await blockFullWorkflow({
      repoRoot: repo,
      parentSessionId: started.parentSessionId,
      reason: "needs product clarification",
    });

    expect(scouted.state.childSessions).toContainEqual(expect.objectContaining({
      role: "context_scout",
      stage: "full_product",
      status: "complete",
      permission: "read_only",
    }));
    expect(scouted.state.artifacts).toContainEqual(expect.objectContaining({
      role: "context_scout",
      stage: "full_product",
      type: "role_output",
    }));
    expect(blocked.state.status).toBe("blocked");
    expect(blocked.state.rerouteIssues).toContainEqual(expect.objectContaining({
      finding: "needs product clarification",
      targetStage: "full_product",
    }));
    expect(new SessionsRepo(repo).findById(started.parentSessionId)).toMatchObject({
      status: "blocked",
      currentStage: "full_product",
    });
  });
});
