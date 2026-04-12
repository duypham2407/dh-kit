import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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

  it("applies fail-safe fallback when runtime signal is missing", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser ui", {
      runtimeSnapshot: {
        "chrome-devtools": { status: "available", signalMissing: true },
        playwright: { status: "available", signalMissing: false },
      },
    });

    expect(decision.blocked).toContain("chrome-devtools");
    expect(decision.rejected["chrome-devtools"]).toContain("missing_runtime_signal");
    expect(decision.selected).toContain("playwright");
  });

  it("applies fail-safe fallback when runtime status is stale", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser ui", {
      runtimeSnapshot: {
        "chrome-devtools": { status: "available", stale: true },
        playwright: { status: "available", stale: false },
      },
    });

    expect(decision.blocked).toContain("chrome-devtools");
    expect(decision.rejected["chrome-devtools"]).toContain("status_stale");
    expect(decision.selected).toContain("playwright");
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

  it("keeps metadata-only allowance when missing-signal fail-safe is allow_with_warning", () => {
    const decision = enforceMcpRoutingDetailed(makeEnvelope(), "browser ui", {
      missingRuntimeFailSafe: "allow_with_warning",
      runtimeSnapshot: {
        "chrome-devtools": { status: "available", signalMissing: true },
      },
    });

    expect(decision.blocked).not.toContain("chrome-devtools");
    expect(decision.selected).toContain("chrome-devtools");
    expect(decision.reasons["chrome-devtools"]).toContain("missing_runtime_signal");
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

  it("adds runtime-state observability without changing routing semantics", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-mcp-runtime-state-"));
    fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });

    try {
      const base = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
        runtimeSnapshot: {
          augment_context_engine: { status: "available" },
        },
      });

      const withRuntimeState = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
        runtimeSnapshot: {
          augment_context_engine: { status: "available" },
        },
        runtimeStateRepoRoot: repo,
      });

      expect(withRuntimeState.selected).toEqual(base.selected);
      expect(withRuntimeState.runtimeStates?.augment_context_engine?.state).toBe("first");

      const second = enforceMcpRoutingDetailed(makeEnvelope(), "codebase", {
        runtimeSnapshot: {
          augment_context_engine: { status: "available" },
        },
        runtimeStateRepoRoot: repo,
      });
      expect(second.selected).toEqual(base.selected);
      expect(second.runtimeStates?.augment_context_engine?.state).toBe("same");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
