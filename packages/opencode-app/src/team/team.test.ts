import { describe, it, expect } from "vitest";
import { runAnalyst } from "./analyst.js";
import { runCoordinator } from "./coordinator.js";
import { runArchitect } from "./architect.js";
import { runImplementer } from "./implementer.js";
import { runReviewer } from "./reviewer.js";
import { runTester } from "./tester.js";
import { createMockChatProvider } from "../../../providers/src/chat/mock-chat.js";

describe("team agents with mock provider", () => {
  const jsonProvider = createMockChatProvider((request) => {
    const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
    const text = lastUser?.content ?? "";

    // Return appropriate JSON based on system prompt context
    if (text.includes("Objective:") || text.includes("implement")) {
      return JSON.stringify({
        problemStatement: "Implement the feature",
        scope: ["feature implementation"],
        outOfScope: ["unrelated areas"],
        assumptions: ["codebase is stable"],
        constraints: ["must pass tsc"],
        acceptanceCriteria: ["tests pass"],
        risks: ["complexity"],
        recommendedNextRole: "architect",
      });
    }
    if (text.includes("Lane:") && text.includes("Stage:")) {
      return JSON.stringify({
        lane: "quick",
        stage: "quick_execute",
        nextRole: "complete",
        summary: "Routed to quick lane",
        handoffNotes: ["proceed"],
        blockers: [],
      });
    }
    return JSON.stringify({});
  });

  it("analyst with mock LLM returns structured output", async () => {
    const analystProvider = createMockChatProvider(() =>
      JSON.stringify({
        problemStatement: "Implement the feature",
        scope: ["feature implementation"],
        outOfScope: [],
        assumptions: ["codebase is stable"],
        constraints: ["must pass tsc"],
        acceptanceCriteria: ["tests pass"],
        risks: [],
        recommendedNextRole: "architect",
      }),
    );

    const result = await runAnalyst({
      objective: "Implement the new search feature",
      provider: analystProvider,
    });

    expect(result.problemStatement).toBe("Implement the feature");
    expect(result.scope).toContain("feature implementation");
    expect(result.recommendedNextRole).toBe("architect");
  });

  it("coordinator with mock LLM returns routing", async () => {
    const coordProvider = createMockChatProvider(() =>
      JSON.stringify({
        lane: "quick",
        stage: "quick_execute",
        nextRole: "complete",
        summary: "Routed to quick lane",
        handoffNotes: ["proceed"],
        blockers: [],
      }),
    );

    const result = await runCoordinator({
      lane: "quick",
      stage: "quick_execute",
      objective: "Fix the bug",
      provider: coordProvider,
    });

    expect(result.lane).toBe("quick");
    expect(result.nextRole).toBe("complete");
    expect(result.summary).toContain("Routed");
  });

  it("analyst falls back when provider returns invalid JSON", async () => {
    const badProvider = createMockChatProvider(() => "not json at all");
    const result = await runAnalyst({
      objective: "test objective",
      provider: badProvider,
    });

    // Should get fallback output
    expect(result.problemStatement).toBe("test objective");
    expect(result.recommendedNextRole).toBe("architect");
  });

  it("analyst falls back when no provider given", async () => {
    const result = await runAnalyst({ objective: "test objective" });
    expect(result.problemStatement).toBe("test objective");
  });

  it("all agents work with no provider (fallback path)", async () => {
    const analyst = await runAnalyst({ objective: "test" });
    expect(analyst.problemStatement).toBe("test");

    const coordinator = await runCoordinator({ lane: "delivery", stage: "scope", objective: "test" });
    expect(coordinator.lane).toBe("delivery");

    const architect = await runArchitect({ sessionId: "s1", lane: "delivery", objective: "test" });
    expect(architect.solutionSummary).toContain("test");
    expect(architect.workItems.length).toBeGreaterThan(0);

    const implementer = await runImplementer({ workItemId: "wi-1", summary: "done" });
    expect(implementer.status).toBe("DONE");

    const reviewer = await runReviewer();
    expect(reviewer.status).toBe("PASS_WITH_NOTES");

    const tester = await runTester();
    expect(tester.status).toBe("PASS");
  });

  it("tester fallback reports partial when required browser verification lacks evidence", async () => {
    const tester = await runTester({
      objective: "verify browser checkout UI",
      requiredMcps: ["augment_context_engine"],
      browserEvidencePolicy: "required",
      browserVerificationRequired: true,
    });

    expect(tester.status).toBe("PARTIAL");
    expect(tester.nextAction).toBe("implementer");
    expect(tester.unmetCriteria.length).toBeGreaterThan(0);
  });
});
