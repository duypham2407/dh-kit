import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runQuickWorkflow } from "./quick.js";
import { runDeliveryWorkflow } from "./delivery.js";
import { runMigrationWorkflow } from "./migration.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { enforceMcpRouting, enforceMcpRoutingDetailed } from "../executor/enforce-mcp-routing.js";

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-workflow-"));
  fs.mkdirSync(path.join(repo, ".dh", "sqlite"), { recursive: true });
  return repo;
}

function makeEnvelope(lane: "quick" | "delivery" | "migration", stage: string): ExecutionEnvelopeState {
  return {
    id: `env-${lane}`,
    sessionId: "sess-1",
    lane,
    stage,
    role: lane === "quick" ? "quick" : "architect",
    agentId: lane === "quick" ? "quick-agent" : "solution-lead",
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    resolvedModel: { providerId: "openai", modelId: "gpt-4.1", variantId: "default" },
    semanticMode: "auto",
    evidencePolicy: "strict",
    createdAt: new Date().toISOString(),
  };
}

function seedSession(repoRoot: string, sessionId: string, lane: "delivery" | "migration", stage: string): void {
  const repo = new SessionsRepo(repoRoot);
  const session: SessionState = {
    sessionId,
    repoRoot,
    lane,
    laneLocked: true,
    currentStage: stage as SessionState["currentStage"],
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
  repo.save(session);
}

describe("workflow lanes", () => {
  it("runs quick workflow and emits summary", async () => {
    const repo = makeRepo();
    const result = await runQuickWorkflow({
      objective: "fix lint issue",
      stage: "quick_plan",
      repoRoot: repo,
      envelope: makeEnvelope("quick", "quick_plan"),
    });
    expect(result.summary.length).toBeGreaterThan(0);
    expect(result.nextStep.length).toBeGreaterThan(0);
  });

  it("runs delivery workflow with handoffs and gates", async () => {
    const repo = makeRepo();
    seedSession(repo, "sess-delivery", "delivery", "delivery_solution");
    const result = await runDeliveryWorkflow({
      sessionId: "sess-delivery",
      objective: "deliver feature",
      stage: "delivery_solution",
      repoRoot: repo,
      envelope: makeEnvelope("delivery", "delivery_solution"),
    });

    expect(result.summary.some((line) => line.includes("Ready work items"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Executed work items"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Reviewer:"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Tester:"))).toBe(true);
  });

  it("runs migration workflow preserving verification gates", async () => {
    const repo = makeRepo();
    seedSession(repo, "sess-migration", "migration", "migration_strategy");
    const result = await runMigrationWorkflow({
      sessionId: "sess-migration",
      objective: "upgrade dependencies",
      stage: "migration_strategy",
      repoRoot: repo,
      envelope: makeEnvelope("migration", "migration_strategy"),
    });

    expect(result.summary[0]).toContain("Migration mode preserves behavior");
    expect(result.summary.some((line) => line.includes("Executed work items"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Execution order"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Tester:"))).toBe(true);
  });

  it("routes browser verification through tester MCP policy", async () => {
    const repo = makeRepo();
    seedSession(repo, "sess-delivery-browser", "delivery", "delivery_solution");
    const objective = "Verify browser UI flow for checkout frontend";
    const baseEnvelope = makeEnvelope("delivery", "delivery_solution");
    const browserMcps = enforceMcpRouting(baseEnvelope, objective);
    const envelope = {
      ...baseEnvelope,
      activeMcps: browserMcps,
    };

    const result = await runDeliveryWorkflow({
      sessionId: "sess-delivery-browser",
      objective,
      stage: "delivery_solution",
      repoRoot: repo,
      envelope,
    });

    const testerLine = result.summary.find((line) => line.startsWith("Tester:")) ?? "";
    expect(testerLine).toContain("Browser verification evidence available.");
  });

  it("workflow consumers can use normalized MCP decision payload", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope("delivery", "delivery_solution"), "browser ui", {
      runtimeSnapshot: {
        "chrome-devtools": { status: "unavailable", authReady: false },
        playwright: { status: "available", authReady: true },
      },
      supportedContractVersions: ["v1"],
    });

    expect(Array.isArray(decision.selected)).toBe(true);
    expect(typeof decision.decisions).toBe("object");
    expect(typeof decision.reasons).toBe("object");
    expect(typeof decision.rejected).toBe("object");
  });
});
