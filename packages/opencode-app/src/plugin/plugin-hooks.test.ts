import { describe, expect, it } from "vitest";
import type { LoadedPluginRecord } from "./plugin-api.js";
import { executePluginHook } from "./plugin-hooks.js";

function loaded(input: {
  id: string;
  timeoutMs?: number;
  hook: Record<string, unknown>;
}): LoadedPluginRecord {
  return {
    id: input.id,
    path: `plugins/${input.id}.json`,
    enabled: true,
    loaded: true,
    hooks: ["permission.ask"],
    timeoutMs: input.timeoutMs ?? 100,
    plugin: {
      id: input.id,
      hooks: {
        "permission.ask": input.hook as never,
      },
    },
  };
}

describe("executePluginHook", () => {
  it("executes hooks in plugin order", async () => {
    const report = await executePluginHook({
      plugins: [
        loaded({ id: "first", hook: { decision: "observe", reason: "first" } }),
        loaded({ id: "second", hook: { decision: "deny", reason: "second" } }),
      ],
      hookName: "permission.ask",
      payload: { toolName: "shell" },
    });

    expect(report.results.map((result) => result.pluginId)).toEqual(["first", "second"]);
    expect(report.results[1]).toMatchObject({ decision: "deny", reason: "second" });
  });

  it("isolates hook timeouts", async () => {
    const report = await executePluginHook({
      plugins: [loaded({ id: "slow", timeoutMs: 1, hook: { decision: "observe", delayMs: 20 } })],
      hookName: "permission.ask",
      payload: {},
    });

    expect(report.results[0]).toMatchObject({
      pluginId: "slow",
      error: expect.stringContaining("timed out"),
    });
  });

  it("isolates hook errors and continues", async () => {
    const report = await executePluginHook({
      plugins: [
        loaded({ id: "bad", hook: { decision: "observe", throwMessage: "boom" } }),
        loaded({ id: "good", hook: { decision: "allow", reason: "ok" } }),
      ],
      hookName: "permission.ask",
      payload: {},
    });

    expect(report.results[0]).toMatchObject({ pluginId: "bad", error: "boom" });
    expect(report.results[1]).toMatchObject({ pluginId: "good", decision: "allow" });
  });
});
