import { describe, expect, it } from "vitest";
import { enforceMcpRouting, enforceMcpRoutingDetailed } from "./enforce-mcp-routing.js";
import type { ExecutionEnvelopeState } from "../../../shared/src/types/execution-envelope.js";

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
});
