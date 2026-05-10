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
        "run",
        "serve",
        "web",
        "attach",
        "session",
        "export",
        "import",
        "providers",
        "models",
        "mcp",
        "agent",
        "plugin",
        "stats",
        "db",
        "github",
        "pr",
        "acp",
      ]),
    );
    expect(report.summary.missingCommandSurfaces).not.toEqual(
      expect.arrayContaining(["ask", "explain", "trace", "index", "doctor"]),
    );
    expect(
      report.features.filter((feature) => feature.status === "supported").flatMap((feature) => feature.missingCommandSurfaces),
    ).toEqual([]);
  });

  it("recommends Rust runtime authority as the next milestone", () => {
    const report = buildOpenCodeParityReport();

    expect(report.summary.recommendedNextMilestone).toBe("Milestone 1: Rust Runtime Authority For All Command Paths");
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
});
