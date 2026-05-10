import { afterEach, describe, expect, it, vi } from "vitest";
import { runExportCommand } from "./export.js";

afterEach(() => vi.restoreAllMocks());

describe("runExportCommand", () => {
  it("writes session export JSON to stdout", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runExportCommand(["session-1", "--sanitize"], "/repo", {
      buildSessionExport: () => ({
        schemaVersion: 1,
        exportedAt: "now",
        source: { product: "dh", version: "test", repoRoot: "/repo" },
        sanitized: true,
        payload: {
          session: { sessionId: "session-1" } as never,
          runtimeEvents: [],
          summaries: [],
          checkpoints: [],
          reverts: [],
        },
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).sanitized).toBe(true);
  });
});
