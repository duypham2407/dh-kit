import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AgentConfigService } from "./agent-config-service.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-agent-config-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("AgentConfigService", () => {
  it("lists OpenCode-style built-in agents with permission metadata", () => {
    const service = new AgentConfigService(makeRepo());

    const report = service.listAgents();

    expect(report.agents.map((agent) => agent.agentId)).toEqual(expect.arrayContaining([
      "build",
      "plan",
      "general",
      "quick",
      "analyst",
      "architect",
      "implementer",
      "reviewer",
      "tester",
    ]));
    expect(report.agents.find((agent) => agent.agentId === "plan")).toMatchObject({
      mode: "primary",
      permission: "read_only",
      source: "builtin",
    });
    expect(report.agents.find((agent) => agent.agentId === "build")).toMatchObject({
      role: "implementer",
      permission: "builder",
    });
  });

  it("creates repo-local custom agents and merges them into list output", () => {
    const repo = makeRepo();
    const service = new AgentConfigService(repo);

    const created = service.createAgent({
      id: "docs-writer",
      mode: "subagent",
      prompt: "Write concise docs.",
      model: "openai/gpt-5",
      permission: "read_only",
    });

    expect(created.agent).toMatchObject({
      agentId: "docs-writer",
      mode: "subagent",
      prompt: "Write concise docs.",
      defaultProvider: "openai",
      defaultModel: "gpt-5",
      permission: "read_only",
      source: "local",
    });
    expect(new AgentConfigService(repo).listAgents().agents.map((agent) => agent.agentId)).toContain("docs-writer");
  });

  it("refuses to overwrite built-in or existing custom agents", () => {
    const repo = makeRepo();
    const service = new AgentConfigService(repo);

    expect(() => service.createAgent({ id: "plan", mode: "primary", prompt: "x" })).toThrow("Agent 'plan' already exists.");
    service.createAgent({ id: "custom", mode: "primary", prompt: "x" });
    expect(() => service.createAgent({ id: "custom", mode: "primary", prompt: "y" })).toThrow("Agent 'custom' already exists.");
  });

  it("rejects malformed model strings before writing config", () => {
    const repo = makeRepo();
    const service = new AgentConfigService(repo);

    expect(() => service.createAgent({
      id: "bad-model",
      mode: "primary",
      prompt: "x",
      model: "gpt-5",
    })).toThrow("--model must use provider/model format.");
    expect(fs.existsSync(path.join(repo, ".dh", "agents", "agents.json"))).toBe(false);
  });
});
