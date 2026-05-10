import { afterEach, describe, expect, it, vi } from "vitest";
import { runContextCommand } from "./context.js";

afterEach(() => vi.restoreAllMocks());

describe("runContextCommand", () => {
  it("renders context inspect JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runContextCommand(["inspect", "auth", "flow", "--json"], "/repo", {
      inspectContext: async (input) => ({
        query: input.query,
        ledger: {
          id: "ledger-1",
          entries: [{
            id: "evidence-1",
            filePath: "src/auth.ts",
            lineRange: [1, 20],
            reason: "Matched query.",
            score: 0.95,
            source: "symbol",
          }],
        },
        coverage: {
          included: 1,
          skipped: 0,
          warnings: [],
        },
        generatedAt: "2026-05-10T00:00:00.000Z",
      }),
    });

    expect(exitCode).toBe(0);
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    expect(payload.query).toBe("auth flow");
    expect(payload.ledger.entries[0].filePath).toBe("src/auth.ts");
  });

  it("rejects missing inspect query", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runContextCommand(["inspect"], "/repo", {
      inspectContext: async () => {
        throw new Error("unused");
      },
    });

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("dh context inspect requires <query>.");
  });
});
