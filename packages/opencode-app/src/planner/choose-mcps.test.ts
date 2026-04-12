import { describe, expect, it } from "vitest";
import { chooseMcps, chooseMcpsDetailed } from "./choose-mcps.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";

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
    expect(Object.keys(decision.decisions).length).toBeGreaterThan(0);
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

  it("uses deterministic ordering for tied scores by extension id", () => {
    const decision = chooseMcpsDetailed(makeEnvelope(), "unknown-intent-no-tags", {
      maxSelected: 10,
      supportedContractVersions: ["v1"],
    });

    const ordered = [...decision.selected];
    const sortedById = [...ordered].sort((a, b) => {
      const left = DEFAULT_MCP_REGISTRY.find((entry) => entry.id === a)!;
      const right = DEFAULT_MCP_REGISTRY.find((entry) => entry.id === b)!;
      const leftScore = left.priority - 25;
      const rightScore = right.priority - 25;
      if (rightScore !== leftScore) {
        return rightScore - leftScore;
      }
      return a.localeCompare(b);
    });
    expect(ordered).toEqual(sortedById);
  });

  it("rejects unsupported contract versions with stable reason code", () => {
    const decision = chooseMcpsDetailed(makeEnvelope(), "codebase", {
      supportedContractVersions: [],
    });
    expect(decision.selected).toEqual([]);
    const rejectedReasons = Object.values(decision.rejected).flat();
    expect(rejectedReasons).toContain("contract_version_mismatch");
  });

  it("rejects when required capabilities are missing", () => {
    const decision = chooseMcpsDetailed(makeEnvelope(), "codebase", {
      requiredCapabilities: ["nonexistent_capability"],
      supportedContractVersions: ["v1"],
    });
    expect(decision.selected).toEqual([]);
    const rejectedReasons = Object.values(decision.rejected).flat();
    expect(rejectedReasons).toContain("capability_denied");
  });

  it("rejects missing entry metadata with stable reason code", () => {
    const target = DEFAULT_MCP_REGISTRY.find((entry) => entry.id === "augment_context_engine");
    expect(target).toBeDefined();
    const originalEntry = target!.entry;

    try {
      target!.entry = "";
      const decision = chooseMcpsDetailed(makeEnvelope(), "codebase", {
        supportedContractVersions: ["v1"],
      });
      expect(decision.selected).not.toContain("augment_context_engine");
      expect(decision.rejected.augment_context_engine).toContain("entry_missing");
    } finally {
      target!.entry = originalEntry;
    }
  });

  it("rejects lane and role mismatches with stable reason codes", () => {
    const decision = chooseMcpsDetailed(makeEnvelope({ lane: "migration", role: "implementer" }), "library api", {
      supportedContractVersions: ["v1"],
      maxSelected: 10,
    });
    expect(decision.rejected.grep_app).toContain("role_mismatch");
    expect(decision.rejected.websearch).toContain("role_mismatch");
    expect(decision.rejected["chrome-devtools"]).toContain("role_mismatch");
  });
});
