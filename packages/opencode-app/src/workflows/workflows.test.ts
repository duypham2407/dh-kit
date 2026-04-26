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
import { QualityGateAuditRepo } from "../../../storage/src/sqlite/repositories/quality-gate-audit-repo.js";
import type { ChatProvider, ChatRequest, ChatResponse } from "../../../providers/src/chat/types.js";

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

type CountingProvider = ChatProvider & {
  readonly calls: ChatRequest[];
};

function makeCountingProvider(): CountingProvider {
  const calls: ChatRequest[] = [];
  return {
    providerId: "counting-provider",
    calls,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      calls.push(request);
      const systemPrompt = request.messages.find((message) => message.role === "system")?.content ?? "";
      return {
        content: JSON.stringify(responseForPrompt(systemPrompt)),
        model: "mock",
        finishReason: "stop",
        usage: {
          promptTokens: 1,
          completionTokens: 1,
          totalTokens: 2,
        },
      };
    },
  };
}

function responseForPrompt(systemPrompt: string): Record<string, unknown> {
  if (systemPrompt.includes("Coordinator agent")) {
    return {
      lane: "delivery",
      stage: "delivery_solution",
      nextRole: "analyst",
      summary: "Coordinator used injected provider.",
      handoffNotes: ["provider-threaded"],
      blockers: [],
    };
  }
  if (systemPrompt.includes("Product Analyst")) {
    return {
      problemStatement: "Provider-threaded analysis.",
      scope: ["provider propagation"],
      outOfScope: ["vendor changes"],
      assumptions: ["injected provider is authoritative"],
      constraints: ["preserve workflow semantics"],
      acceptanceCriteria: ["provider receives analyst prompt"],
      risks: [],
      recommendedNextRole: "architect",
    };
  }
  if (systemPrompt.includes("Solution Architect")) {
    return {
      solutionSummary: "Provider-threaded architecture.",
      targetAreas: ["workflow"],
      architecturalDecisions: ["use prepared provider"],
      workItems: [{
        title: "Thread provider through role path",
        description: "Exercise downstream role calls.",
        targetAreas: ["workflow"],
        acceptance: ["provider is called by implementer reviewer tester"],
        validationPlan: ["count provider calls"],
        dependencies: [],
        parallelizable: false,
      }],
      sequencing: ["single item"],
      parallelizationRules: ["none"],
      validationPlan: ["count provider calls"],
      reviewerFocus: ["provider propagation"],
      migrationInvariants: ["behavior preserved"],
    };
  }
  if (systemPrompt.includes("Implementer agent")) {
    return {
      status: "DONE",
      changedAreas: ["workflow"],
      summary: "Implemented with injected provider.",
      concerns: [],
      localVerification: ["provider call counted"],
      reviewNotes: ["review provider propagation"],
    };
  }
  if (systemPrompt.includes("Code Reviewer agent")) {
    return {
      status: "PASS",
      findings: [],
      scopeCompliance: "pass",
      qualityGate: "pass",
      nextAction: "tester",
    };
  }
  if (systemPrompt.includes("QA Tester agent")) {
    return {
      status: "PASS",
      executedChecks: ["provider call counted"],
      evidence: ["injected provider reached tester"],
      unmetCriteria: [],
      limitations: [],
      nextAction: "complete",
    };
  }
  return { summary: "unknown prompt" };
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

    const qualityGateRepo = new QualityGateAuditRepo(repo);
    const qualityGates = qualityGateRepo.listBySession("sess-1", 20);
    expect(qualityGates.length).toBeGreaterThan(0);
    expect(qualityGates.some((record) => record.gateId === "rule_scan")).toBe(true);
    expect(qualityGates.some((record) => record.gateId === "security_scan")).toBe(true);
  });

  it("threads an injected provider through quick coordinator workflow", async () => {
    const repo = makeRepo();
    const provider = makeCountingProvider();

    const result = await runQuickWorkflow({
      objective: "verify quick provider propagation",
      stage: "quick_plan",
      repoRoot: repo,
      envelope: makeEnvelope("quick", "quick_plan"),
      provider,
    });

    expect(result.summary).toContain("Coordinator used injected provider.");
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.messages[0]?.content).toContain("Coordinator agent");
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

  it("threads an injected provider through delivery coordinator, analyst, architect, implementer, reviewer, and tester", async () => {
    const repo = makeRepo();
    const provider = makeCountingProvider();
    seedSession(repo, "sess-delivery-provider", "delivery", "delivery_solution");

    const result = await runDeliveryWorkflow({
      sessionId: "sess-delivery-provider",
      objective: "deliver provider-threaded feature",
      stage: "delivery_solution",
      repoRoot: repo,
      envelope: makeEnvelope("delivery", "delivery_solution"),
      provider,
    });

    expect(result.summary.some((line) => line.includes("Executed work items: 1"))).toBe(true);
    expect(provider.calls.map((call) => call.messages[0]?.content)).toEqual([
      expect.stringContaining("Coordinator agent"),
      expect.stringContaining("Product Analyst"),
      expect.stringContaining("Solution Architect"),
      expect.stringContaining("Implementer agent"),
      expect.stringContaining("Code Reviewer agent"),
      expect.stringContaining("QA Tester agent"),
    ]);
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

  it("threads an injected provider through migration coordinator, architect, implementer, reviewer, and tester", async () => {
    const repo = makeRepo();
    const provider = makeCountingProvider();
    seedSession(repo, "sess-migration-provider", "migration", "migration_strategy");

    const result = await runMigrationWorkflow({
      sessionId: "sess-migration-provider",
      objective: "migrate provider-threaded workflow",
      stage: "migration_strategy",
      repoRoot: repo,
      envelope: makeEnvelope("migration", "migration_strategy"),
      provider,
    });

    expect(result.summary.some((line) => line.includes("Executed work items: 1"))).toBe(true);
    expect(provider.calls.map((call) => call.messages[0]?.content)).toEqual([
      expect.stringContaining("Coordinator agent"),
      expect.stringContaining("Solution Architect"),
      expect.stringContaining("Implementer agent"),
      expect.stringContaining("Code Reviewer agent"),
      expect.stringContaining("QA Tester agent"),
    ]);
  });

  it("routes browser verification through tester MCP policy", async () => {
    const repo = makeRepo();
    seedSession(repo, "sess-delivery-browser", "delivery", "delivery_solution");
    const objective = "Verify browser UI flow for checkout frontend";
    const envelope = {
      ...makeEnvelope("delivery", "delivery_solution"),
      activeMcps: ["playwright", "chrome-devtools"],
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
