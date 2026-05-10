import { afterEach, describe, expect, it, vi } from "vitest";
import { runModelsCommand } from "./models.js";

afterEach(() => vi.restoreAllMocks());

describe("runModelsCommand", () => {
  it("renders model catalog JSON with cache metadata", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runModelsCommand(["openai", "--refresh", "--json"], "/repo", {
      listModels: async () => ({
        refreshed: true,
        cache: { path: "~/.dh/cache/models.json", ageMs: 1 },
        models: [{ providerId: "openai", modelId: "gpt-test", name: "GPT Test", available: true }],
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).models[0].modelId).toBe("gpt-test");
  });
});
