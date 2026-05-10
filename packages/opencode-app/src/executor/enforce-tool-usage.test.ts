import { describe, expect, it } from "vitest";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { enforceToolUsage } from "./enforce-tool-usage.js";

function makeEnvelope(overrides?: Partial<ExecutionEnvelopeState>): ExecutionEnvelopeState {
  return {
    id: "env-1",
    sessionId: "session-1",
    lane: "quick",
    role: "quick",
    agentId: "quick-agent",
    stage: "quick_execute",
    resolvedModel: { providerId: "openai", modelId: "gpt-5", variantId: "default" },
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    semanticMode: "auto",
    evidencePolicy: "strict",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("enforceToolUsage", () => {
  it("allows structured grep as a catalogued repository tool", () => {
    const decision = enforceToolUsage(makeEnvelope(), "grep");

    expect(decision.allow).toBe(true);
    expect(decision.reason).toContain("Tool allowed");
  });

  it("blocks legacy OS aliases that bypass structured tools", () => {
    const decision = enforceToolUsage(makeEnvelope(), "cat");

    expect(decision.allow).toBe(false);
    expect(decision.reason).toContain("Use structured or built-in repository tools");
  });
});
