import { afterEach, describe, expect, it, vi } from "vitest";
import { runStatsCommand } from "./stats.js";

afterEach(() => vi.restoreAllMocks());

describe("runStatsCommand", () => {
  it("renders stats JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runStatsCommand(["--json", "--days", "7"], "/repo", {
      buildSessionStats: () => ({
        generatedAt: "now",
        days: 7,
        totalSessions: 1,
        sessionsByLane: [{ key: "quick", count: 1 }],
        sessionsByStatus: [{ key: "in_progress", count: 1 }],
        runtimeEventsByType: [],
        topModels: [],
        topTools: [],
        tokenUsage: "unavailable",
        costUsd: "unavailable",
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).totalSessions).toBe(1);
  });
});
