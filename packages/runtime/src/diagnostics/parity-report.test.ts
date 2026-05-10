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
        "web",
        "attach",
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
    expect(report.summary.missingCommandSurfaces).not.toContain("agent");
    expect(report.summary.missingCommandSurfaces).not.toContain("plugin");
    expect(report.summary.missingCommandSurfaces).not.toContain("serve");
    expect(report.summary.missingCommandSurfaces).not.toEqual(
      expect.arrayContaining(["ask", "explain", "trace", "index", "doctor"]),
    );
    expect(
      report.features.filter((feature) => feature.status === "supported").flatMap((feature) => feature.missingCommandSurfaces),
    ).toEqual([]);
  });

  it("reports the personal coding assistant roadmap as the active direction", () => {
    const report = buildOpenCodeParityReport();

    expect(report.summary.recommendedNextMilestone).toBe("Personal Coding Assistant v1: TUI + Deep Context + Speed + Multi Agent");
    expect(report.summary.byStatus.partial).toBeGreaterThan(0);
    expect(report.summary.byStatus.planned).toBe(0);
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
      "task subagent execution",
    ]));
    expect(tool?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "model tool-call loop integration",
      "interactive permission prompt UI",
    ]));
  });

  it("reports agent command and bounded subagent runtime while keeping scheduler gaps visible", () => {
    const report = buildOpenCodeParityReport();
    const agent = report.features.find((feature) => feature.category === "agent");

    expect(report.summary.missingCommandSurfaces).not.toContain("agent");
    expect(agent?.dhSurface).toEqual(expect.arrayContaining([
      "agent list/create",
      "built-in build/plan/general agents",
      "repo-local custom agents",
      "bounded task subagent runtime",
    ]));
    expect(agent?.missingCommandSurfaces).toEqual([]);
    expect(agent?.missingRuntimeCapabilities).not.toEqual(expect.arrayContaining([
      "runtime agent registry",
      "subagent task delegation",
      "agent selection in run loop",
    ]));
    expect(agent?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "advanced multi-agent scheduler",
      "parallel subagent orchestration",
    ]));
  });

  it("reports LSP diagnostics and tool wrappers while keeping process-supervision gaps visible", () => {
    const report = buildOpenCodeParityReport();
    const lsp = report.features.find((feature) => feature.category === "lsp");

    expect(lsp?.status).toBe("partial");
    expect(lsp?.dhSurface).toEqual(expect.arrayContaining([
      "LSP service boundary",
      "lsp diagnostics CLI",
      "LSP tool wrappers",
      "live LSP retrieval augmentation",
    ]));
    expect(lsp?.missingRuntimeCapabilities).not.toEqual(expect.arrayContaining([
      "LSP client service",
      "diagnostics tool",
    ]));
    expect(lsp?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "long-lived LSP process supervision",
      "language server auto-install",
    ]));
  });

  it("reports local plugin MVP while keeping executable plugin gaps visible", () => {
    const report = buildOpenCodeParityReport();
    const plugin = report.features.find((feature) => feature.category === "plugin");

    expect(report.summary.missingCommandSurfaces).not.toContain("plugin");
    expect(plugin?.status).toBe("deferred");
    expect(plugin?.dhSurface).toEqual(expect.arrayContaining([
      "local plugin registry",
      "plugin list/add",
      "deterministic declarative hooks",
      "plugin timeout/error isolation",
    ]));
    expect(plugin?.missingCommandSurfaces).toEqual([]);
    expect(plugin?.missingRuntimeCapabilities).not.toEqual(expect.arrayContaining([
      "server plugin API",
      "deterministic hook order",
    ]));
    expect(plugin?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "executable JS/WASM plugin API",
      "TUI plugin hooks",
    ]));
    expect(plugin?.notes).toEqual(expect.arrayContaining([
      "Community plugin ecosystem is deferred by ADR 2026-05-10 personal coding assistant direction.",
    ]));
  });

  it("reports the TUI MVP while keeping attach and streaming gaps visible", () => {
    const report = buildOpenCodeParityReport();
    const tui = report.features.find((feature) => feature.category === "tui");

    expect(tui?.status).toBe("partial");
    expect(tui?.dhSurface).toEqual(expect.arrayContaining([
      "tui command",
      "local server attach/start",
      "session list rendering",
      "prompt submission",
      "permission request rendering",
    ]));
    expect(tui?.missingRuntimeCapabilities).not.toEqual(expect.arrayContaining([
      "TUI client",
      "session attachment",
    ]));
    expect(tui?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "attach command",
      "WebSocket/event streaming",
      "interactive permission approval API",
      "TUI plugin hooks",
    ]));
  });

  it("keeps web and desktop implementation out of scope after the ADR", () => {
    const report = buildOpenCodeParityReport();
    const packaging = report.features.find((feature) => feature.category === "packaging");

    expect(packaging?.status).toBe("out_of_scope");
    expect(packaging?.dhSurface).toEqual(expect.arrayContaining(["local CLI release assets"]));
    expect(packaging?.missingRuntimeCapabilities).toEqual(expect.arrayContaining([
      "web app",
      "desktop app",
      "cloud console",
      "remote share service",
    ]));
    expect(packaging?.notes).toEqual(expect.arrayContaining([
      "Web and desktop implementation deferred by ADR 2026-05-10.",
      "Community/cloud surfaces are not part of Personal Coding Assistant v1.",
    ]));
  });
});
