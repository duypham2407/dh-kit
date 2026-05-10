import { afterEach, describe, expect, it, vi } from "vitest";
import { runLspCommand } from "./lsp.js";

afterEach(() => vi.restoreAllMocks());

describe("runLspCommand", () => {
  it("renders diagnostics JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runLspCommand(["diagnostics", "--file", "src/app.ts", "--json"], "/repo", {
      diagnostics: async () => ({
        available: true,
        file: "src/app.ts",
        serverId: "typescript-language-server",
        language: "typescript",
        diagnostics: [],
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({
      available: true,
      file: "src/app.ts",
    });
  });

  it("rejects diagnostics without a file", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runLspCommand(["diagnostics"], "/repo", {
      diagnostics: async () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("dh lsp diagnostics requires --file <path>.");
  });
});
