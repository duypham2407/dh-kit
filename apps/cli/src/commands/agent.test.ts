import { afterEach, describe, expect, it, vi } from "vitest";
import { runAgentCommand } from "./agent.js";

afterEach(() => vi.restoreAllMocks());

describe("runAgentCommand", () => {
  it("renders agent list as JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runAgentCommand(["list", "--json"], "/repo", {
      listAgents: () => ({
        agents: [{
          agentId: "plan",
          displayName: "Plan",
          role: "architect",
          lanes: ["quick", "delivery", "migration"],
          configurable: false,
          mode: "primary",
          prompt: "plan",
          permission: "read_only",
          source: "builtin",
        }],
      }),
      createAgent: () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).agents[0]).toMatchObject({
      agentId: "plan",
      permission: "read_only",
    });
  });

  it("creates agents from flags", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const calls: unknown[] = [];

    const exitCode = await runAgentCommand([
      "create",
      "--id",
      "docs-writer",
      "--mode",
      "subagent",
      "--prompt",
      "Write docs",
      "--model",
      "openai/gpt-5",
      "--permission",
      "read_only",
    ], "/repo", {
      listAgents: () => ({ agents: [] }),
      createAgent: (_repoRoot, input) => {
        calls.push(input);
        return {
          agent: {
            agentId: input.id,
            displayName: "Docs Writer",
            role: "quick",
            lanes: ["quick"],
            configurable: true,
            mode: input.mode,
            prompt: input.prompt,
            permission: input.permission ?? "standard",
            source: "local",
            defaultProvider: "openai",
            defaultModel: "gpt-5",
          },
        };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls[0]).toMatchObject({
      id: "docs-writer",
      mode: "subagent",
      prompt: "Write docs",
      model: "openai/gpt-5",
      permission: "read_only",
    });
    expect(String(stdout.mock.calls[0]?.[0])).toContain("created agent: docs-writer");
  });

  it("rejects missing create flags", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runAgentCommand(["create", "--id", "x"], "/repo", {
      listAgents: () => ({ agents: [] }),
      createAgent: () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("dh agent create requires --mode <primary|subagent>.");
  });
});
