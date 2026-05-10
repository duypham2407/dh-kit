import { describe, expect, it } from "vitest";
import {
  buildOpenCodeParityReport,
  OPENCODE_MISSING_COMMAND_SURFACES,
} from "./parity-report.js";
import { PARITY_CATEGORIES, PARITY_STATUSES } from "../../../shared/src/types/parity.js";

describe("buildOpenCodeParityReport", () => {
  it("reports every required parity category and status vocabulary", () => {
    const report = buildOpenCodeParityReport();

    expect(report.categories).toEqual(PARITY_CATEGORIES);
    expect(report.statuses).toEqual(PARITY_STATUSES);
    expect(Object.keys(report.summary.byCategory).sort()).toEqual([...PARITY_CATEGORIES].sort());
    expect(Object.keys(report.summary.byStatus).sort()).toEqual([...PARITY_STATUSES].sort());
  });

  it("does not claim missing OpenCode command surfaces are supported", () => {
    const report = buildOpenCodeParityReport();

    expect(report.summary.missingCommandSurfaces).toEqual(OPENCODE_MISSING_COMMAND_SURFACES);
    expect(report.summary.missingCommandSurfaces).toEqual(
      expect.arrayContaining([
        "serve",
        "web",
        "attach",
        "agent",
        "plugin",
        "db",
        "github",
        "pr",
        "acp",
      ]),
    );
    expect(report.summary.missingCommandSurfaces).not.toContain("run");
    expect(report.summary.missingCommandSurfaces).not.toContain("mcp");
    expect(report.summary.missingCommandSurfaces).not.toContain("session");
    expect(report.summary.missingCommandSurfaces).not.toContain("export");
    expect(report.summary.missingCommandSurfaces).not.toContain("import");
    expect(report.summary.missingCommandSurfaces).not.toContain("providers");
    expect(report.summary.missingCommandSurfaces).not.toContain("models");
    expect(report.summary.missingCommandSurfaces).not.toContain("stats");
    expect(report.summary.missingCommandSurfaces).not.toEqual(
      expect.arrayContaining(["ask", "explain", "trace", "index", "doctor"]),
    );
    expect(
      report.features.filter((feature) => feature.status === "supported").flatMap((feature) => feature.missingCommandSurfaces),
    ).toEqual([]);
  });

  it("recommends agent runtime as the next milestone", () => {
    const report = buildOpenCodeParityReport();

    expect(report.summary.recommendedNextMilestone).toBe("Milestone 7: Agent/Subagent Runtime");
    expect(report.summary.byStatus.partial).toBeGreaterThan(0);
    expect(report.summary.byStatus.planned).toBeGreaterThan(0);
    expect(report.summary.byStatus.deferred).toBeGreaterThan(0);
    expect(report.summary.byStatus.out_of_scope).toBeGreaterThan(0);
  });

  it("marks runtime authority as supported once lane commands are Rust-hosted", () => {
    const report = buildOpenCodeParityReport();
    const runtime = report.features.find((feature) => feature.category === "runtime");
    const cli = report.features.find((feature) => feature.category === "cli");

    expect(runtime?.status).toBe("supported");
    expect(runtime?.missingRuntimeCapabilities).not.toEqual(
      expect.arrayContaining(["single Rust lifecycle authority for lane, run, session, provider, MCP, and tool paths"]),
    );
    expect(cli?.dhSurface).toEqual(expect.arrayContaining([
      "quick (rust-hosted)",
      "delivery (rust-hosted)",
      "migrate (rust-hosted)",
    ]));
  });

  it("removes direct run loop from missing surfaces after dh run lands", () => {
    const report = buildOpenCodeParityReport();
    const runtime = report.features.find((feature) => feature.category === "runtime");
    const cli = report.features.find((feature) => feature.category === "cli");

    expect(report.summary.missingCommandSurfaces).not.toContain("run");
    expect(runtime?.dhSurface).toEqual(expect.arrayContaining(["Rust-hosted direct run lifecycle"]));
    expect(runtime?.missingRuntimeCapabilities).not.toEqual(
      expect.arrayContaining(["OpenCode run/session/provider/MCP/tool lifecycle authority remains planned in later milestones"]),
    );
    expect(cli?.dhSurface).toEqual(expect.arrayContaining(["run (rust-hosted)"]));
    expect(cli?.missingRuntimeCapabilities).not.toEqual(
      expect.arrayContaining(["OpenCode-like direct interactive run loop"]),
    );
  });

  it("removes MCP command surface while keeping runtime and OAuth gaps visible", () => {
    const report = buildOpenCodeParityReport();
    const mcp = report.features.find((feature) => feature.category === "mcp");

    expect(report.summary.missingCommandSurfaces).not.toContain("mcp");
    expect(mcp?.dhSurface).toEqual(expect.arrayContaining(["mcp list/add/auth/logout/debug local lifecycle"]));
    expect(mcp?.missingCommandSurfaces).toEqual([]);
    expect(mcp?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "OAuth callback handling",
      "runtime MCP server lifecycle",
      "MCP stdio tool execution",
    ]));
  });

  it("reports the tool catalog and runner while keeping model-loop gaps visible", () => {
    const report = buildOpenCodeParityReport();
    const tool = report.features.find((feature) => feature.category === "tool");

    expect(tool?.dhSurface).toEqual(expect.arrayContaining([
      "core tool catalog",
      "validated tool runner",
      "permission-bound shell execution",
      "tool event streaming",
    ]));
    expect(tool?.missingRuntimeCapabilities).not.toEqual(expect.arrayContaining([
      "OpenCode-equivalent tool schemas",
      "streaming tool output",
      "tool result envelopes",
    ]));
    expect(tool?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "model tool-call loop integration",
      "interactive permission prompt UI",
    ]));
  });
});
