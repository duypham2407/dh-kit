import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentConfigService } from "./agent-config-service.js";
import { AgentRuntime } from "./agent-runtime.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-agent-runtime-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("AgentRuntime", () => {
  it("resolves built-in agents", () => {
    const runtime = new AgentRuntime(makeRepo());

    expect(runtime.resolveAgent("plan")).toMatchObject({
      agentId: "plan",
      role: "architect",
      permission: "read_only",
    });
  });

  it("resolves repo-local custom agents", () => {
    const repo = makeRepo();
    new AgentConfigService(repo).createAgent({
      id: "docs-writer",
      mode: "subagent",
      prompt: "Write docs",
      permission: "read_only",
    });

    expect(new AgentRuntime(repo).resolveAgent("docs-writer")).toMatchObject({
      agentId: "docs-writer",
      role: "quick",
      mode: "subagent",
    });
  });

  it("refuses missing agents instead of silently falling back", () => {
    const runtime = new AgentRuntime(makeRepo());

    expect(() => runtime.resolveAgent("missing")).toThrow("Agent 'missing' is not registered.");
  });
});
