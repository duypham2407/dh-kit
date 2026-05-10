import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runMcpCommand } from "./mcp.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-mcp-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("runMcpCommand", () => {
  it("adds and lists local MCP servers without leaking env values", async () => {
    const repo = makeRepo();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const addCode = await runMcpCommand([
      "add",
      "--name",
      "local-docs",
      "--command",
      "node",
      "--arg",
      "server.js",
      "--env",
      "API_TOKEN=secret-token",
      "--json",
    ], repo);
    const listCode = await runMcpCommand(["list", "--json"], repo);

    expect(addCode).toBe(0);
    expect(listCode).toBe(0);
    const addPayload = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    const listPayload = JSON.parse(String(stdout.mock.calls[1]?.[0]));
    expect(addPayload.name).toBe("local-docs");
    expect(listPayload.servers.some((server: { name: string }) => server.name === "local-docs")).toBe(true);
    expect(String(stdout.mock.calls)).not.toContain("secret-token");
  });

  it("renders debug JSON for a local server", async () => {
    const repo = makeRepo();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runMcpCommand(["add", "--name", "local-docs", "--command", "node"], repo);

    const exitCode = await runMcpCommand(["debug", "local-docs", "--json"], repo);

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[1]?.[0]))).toMatchObject({
      name: "local-docs",
      source: "local",
      runtime: { state: "not_launched" },
    });
  });

  it("rejects invalid env flags without echoing the value", async () => {
    const repo = makeRepo();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runMcpCommand([
      "add",
      "--name",
      "bad",
      "--command",
      "node",
      "--env",
      "API_TOKEN",
    ], repo);

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("--env requires KEY=VALUE.");
    expect(String(stderr.mock.calls[0]?.[0])).not.toContain("API_TOKEN");
  });

  it("lists auth state and logs out local auth", async () => {
    const repo = makeRepo();
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    await runMcpCommand(["add", "--name", "local-docs", "--command", "node"], repo);

    const authCode = await runMcpCommand(["auth", "list", "--json"], repo);
    const logoutCode = await runMcpCommand(["logout", "local-docs"], repo);

    expect(authCode).toBe(0);
    expect(logoutCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[1]?.[0])).auth[0]).toMatchObject({
      name: "local-docs",
      status: "available",
    });
    expect(String(stdout.mock.calls[2]?.[0])).toContain("removed MCP auth state: local-docs");
  });
});
