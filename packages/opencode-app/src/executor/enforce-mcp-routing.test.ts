import { describe, expect, it } from "vitest";
import { enforceMcpRouting, enforceMcpRoutingDetailed } from "./enforce-mcp-routing.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";
import { DEFAULT_MCP_REGISTRY } from "../registry/mcp-registry.js";

function makeEnvelope(overrides?: Partial<ExecutionEnvelopeState>): ExecutionEnvelopeState {
  return {
    id: "env-1",
    sessionId: "sess-1",
    lane: "quick",
    role: "quick",
    agentId: "quick-agent",
    stage: "quick_execute",
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

describe("enforceMcpRoutingDetailed", () => {
  it("applies fallback when preferred MCP unavailable", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser frontend", {
      runtimeSnapshot: {
        "chrome-devtools": { status: "unavailable", authReady: false },
        playwright: { status: "available", authReady: true },
      },
    });

    expect(decision.blocked).toContain("chrome-devtools");
    expect(decision.selected).toContain("playwright");
    expect(decision.warnings.some((warning) => warning.includes("Fallback applied"))).toBe(true);
  });

  it("applies fallback when MCP needs auth", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser ui", {
      runtimeSnapshot: {
        "chrome-devtools": { status: "needs_auth", authReady: false },
        playwright: { status: "available", authReady: true },
      },
    });

    expect(decision.blocked).toContain("chrome-devtools");
    expect(decision.selected).toContain("playwright");
    expect(decision.rejected["chrome-devtools"]).toContain("needs_auth");
  });

  it("allows degraded MCP with warning when policy permits", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser", {
      runtimeSnapshot: {
        "chrome-devtools": { status: "degraded", authReady: true },
      },
    });
    expect(decision.selected).toContain("chrome-devtools");
    expect(decision.warnings.some((warning) => warning.includes("degraded"))).toBe(true);
  });

  it("keeps legacy adapter output as string[]", () => {
    const selected = enforceMcpRouting(makeEnvelope(), "codebase");
    expect(Array.isArray(selected)).toBe(true);
    expect(selected.every((item) => typeof item === "string")).toBe(true);
  });

  it("blocks unsupported contract versions with stable reason code", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
      supportedContractVersions: [],
      runtimeSnapshot: {
        augment_context_engine: { status: "available" },
      },
    });
    const rejectedReasons = Object.values(decision.rejected).flat();
    expect(rejectedReasons).toContain("contract_version_mismatch");
    expect(Object.values(decision.decisions).length).toBe(0);
  });

  it("enforces capability guardrails before final selection", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
      supportedContractVersions: ["v1"],
      requiredCapabilities: ["nonexistent_capability"],
      runtimeSnapshot: {
        augment_context_engine: { status: "available" },
      },
    });
    expect(decision.selected).toEqual([]);
    const rejectedReasons = Object.values(decision.rejected).flat();
    expect(rejectedReasons).toContain("capability_denied");
    expect(Object.values(decision.decisions).length).toBe(0);
  });

  it("enforces lane and role guardrails with stable reason codes", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
      supportedContractVersions: ["v1"],
      requiredCapabilities: ["release_notes"],
      runtimeSnapshot: {
        augment_context_engine: { status: "available" },
        websearch: { status: "available" },
      },
    });
    const rejectedReasons = Object.values(decision.rejected).flat();
    expect(rejectedReasons).toContain("lane_mismatch");
    expect(rejectedReasons).toContain("capability_denied");
  });

  it("blocks missing entry metadata with stable reason code", () => {
    const target = DEFAULT_MCP_REGISTRY.find((entry) => entry.id === "augment_context_engine");
    expect(target).toBeDefined();
    const originalEntry = target!.entry;

    try {
      target!.entry = "";
      const decision = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
        supportedContractVersions: ["v1"],
        runtimeSnapshot: {
          augment_context_engine: { status: "available" },
        },
      });
      expect(decision.selected).not.toContain("augment_context_engine");
      expect(decision.rejected.augment_context_engine).toContain("entry_missing");
    } finally {
      target!.entry = originalEntry;
    }
  });

  it("normalizes final decisions with allow/block/modify", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser frontend", {
      supportedContractVersions: ["v1"],
      runtimeSnapshot: {
        "chrome-devtools": { status: "unavailable", authReady: false },
        playwright: { status: "available", authReady: true },
      },
    });
    expect(decision.decisions["chrome-devtools"]).toBe("block");
    expect(decision.decisions.playwright).toBe("modify");
  });
});
