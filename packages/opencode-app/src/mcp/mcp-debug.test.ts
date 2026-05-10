import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpConfigService } from "./mcp-config-service.js";
import { buildMcpDebugReport } from "./mcp-debug.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-mcp-debug-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("buildMcpDebugReport", () => {
  it("returns redacted launch metadata for local MCP servers", () => {
    const repo = makeRepo();
    const service = new McpConfigService(repo);
    service.addServer({
      name: "local-docs",
      command: "node",
      args: ["server.js"],
      env: { API_TOKEN: "secret-token" },
    });
    service.setAuthState({
      name: "local-docs",
      status: "degraded",
      lastFailure: "Bearer secret-token failed",
    });

    const report = buildMcpDebugReport(repo, "local-docs");

    expect(report).toMatchObject({
      name: "local-docs",
      source: "local",
      authStatus: "degraded",
      launch: {
        command: "node",
        args: ["server.js"],
        env: { API_TOKEN: "[REDACTED_SECRET]" },
      },
      toolCount: 0,
      resourceCount: 0,
      promptCount: 0,
      runtime: {
        state: "not_launched",
      },
    });
    expect(JSON.stringify(report)).not.toContain("secret-token");
  });

  it("debugs default registry entries without a launch command", () => {
    const report = buildMcpDebugReport(makeRepo(), "augment_context_engine");

    expect(report).toMatchObject({
      name: "augment_context_engine",
      source: "default",
      authStatus: "available",
      launch: undefined,
    });
    expect(report.capabilities).toContain("code_search");
  });

  it("throws for unknown MCP servers", () => {
    expect(() => buildMcpDebugReport(makeRepo(), "missing")).toThrow("MCP server 'missing' was not found.");
  });
});
