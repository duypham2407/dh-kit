import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { McpConfigService } from "./mcp-config-service.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-mcp-config-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("McpConfigService", () => {
  it("adds local command MCP servers and lists them without leaking env values", () => {
    const repo = makeRepo();
    const service = new McpConfigService(repo);

    const added = service.addServer({
      name: "local-docs",
      command: "node",
      args: ["server.js"],
      env: { API_TOKEN: "secret-token", MODE: "dev" },
    });

    expect(added).toMatchObject({
      name: "local-docs",
      source: "local",
      command: "node",
      args: ["server.js"],
      env: { API_TOKEN: "[REDACTED_SECRET]", MODE: "[REDACTED_SECRET]" },
      enabled: true,
      authStatus: "available",
    });
    expect(JSON.stringify(added)).not.toContain("secret-token");
    expect(JSON.stringify(added)).not.toContain("dev");

    const rawFile = fs.readFileSync(path.join(repo, ".dh", "mcp", "servers.json"), "utf8");
    expect(rawFile).toContain("secret-token");
  });

  it("merges default registry entries with local servers", () => {
    const service = new McpConfigService(makeRepo());
    service.addServer({ name: "local-docs", command: "node" });

    const servers = service.listServers();

    expect(servers.some((server) => server.name === "augment_context_engine" && server.source === "default")).toBe(true);
    expect(servers.some((server) => server.name === "local-docs" && server.source === "local")).toBe(true);
  });

  it("lists and clears local auth state", () => {
    const repo = makeRepo();
    const service = new McpConfigService(repo);
    service.addServer({ name: "local-docs", command: "node" });
    service.setAuthState({ name: "local-docs", status: "needs_auth", serverIdentity: "local-docs-server" });

    expect(service.listAuth()).toEqual([{
      name: "local-docs",
      status: "needs_auth",
      serverIdentity: "local-docs-server",
    }]);
    expect(service.logout("local-docs")).toEqual({ name: "local-docs", removed: true });
    expect(service.logout("local-docs")).toEqual({ name: "local-docs", removed: false });
  });

  it("throws a clear parse error for malformed local MCP config", () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, ".dh", "mcp"), { recursive: true });
    fs.writeFileSync(path.join(repo, ".dh", "mcp", "servers.json"), "{");

    expect(() => new McpConfigService(repo).listServers()).toThrow("Failed to parse .dh/mcp/servers.json:");
  });
});
