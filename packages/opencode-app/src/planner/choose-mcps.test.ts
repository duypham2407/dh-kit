import { describe, expect, it } from "vitest";
import { chooseMcps, chooseMcpsDetailed } from "./choose-mcps.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";

function makeEnvelope(overrides?: Partial<ExecutionEnvelopeState>): ExecutionEnvelopeState {
  return {
    id: "env-1",
    sessionId: "sess-1",
    lane: "delivery",
    role: "architect",
    agentId: "architect-1",
    stage: "delivery_solution",
    resolvedModel: { providerId: "openai", modelId: "gpt-4.1", variantId: "default" },
    activeSkills: [],
    activeMcps: [],
    requiredTools: [],
    semanticMode: "auto",
    evidencePolicy: "strict",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("chooseMcpsDetailed", () => {
  it("returns structured decision with reasons/rejected", () => {
    const decision = chooseMcpsDetailed(makeEnvelope(), "library api migration");
    expect(decision.selected.length).toBeGreaterThan(0);
    expect(Object.keys(decision.reasons).length).toBeGreaterThan(0);
    expect(typeof decision.rejected).toBe("object");
  });

  it("marks no_runtime_status when runtime snapshot missing", () => {
    const decision = chooseMcpsDetailed(makeEnvelope(), "codebase trace");
    const hasNoRuntimeStatus = Object.values(decision.reasons).some((codes) => codes.includes("no_runtime_status"));
    expect(hasNoRuntimeStatus).toBe(true);
  });

  it("keeps legacy adapter output as string list", () => {
    const selected = chooseMcps(makeEnvelope(), "browser ui flow");
    expect(Array.isArray(selected)).toBe(true);
    expect(selected.every((item) => typeof item === "string")).toBe(true);
  });
});
