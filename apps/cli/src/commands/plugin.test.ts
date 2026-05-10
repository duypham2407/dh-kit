import { afterEach, describe, expect, it, vi } from "vitest";
import { runPluginCommand } from "./plugin.js";

afterEach(() => vi.restoreAllMocks());

describe("runPluginCommand", () => {
  it("renders plugin list JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runPluginCommand(["list", "--json"], "/repo", {
      listPlugins: () => ({ plugins: [{ id: "policy", path: "plugins/policy.json", enabled: true, timeoutMs: 1000 }] }),
      addPlugin: () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).plugins[0].id).toBe("policy");
  });

  it("adds plugins from flags", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const calls: unknown[] = [];

    const exitCode = await runPluginCommand(["add", "--id", "policy", "--path", "plugins/policy.json"], "/repo", {
      listPlugins: () => ({ plugins: [] }),
      addPlugin: (_repoRoot, input) => {
        calls.push(input);
        return { id: input.id, path: input.path, enabled: true, timeoutMs: 1000 };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls[0]).toEqual({ id: "policy", path: "plugins/policy.json" });
    expect(String(stdout.mock.calls[0]?.[0])).toContain("added plugin: policy");
  });

  it("rejects add without path", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runPluginCommand(["add", "--id", "policy"], "/repo", {
      listPlugins: () => ({ plugins: [] }),
      addPlugin: () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("dh plugin add requires --path <path>.");
  });
});
