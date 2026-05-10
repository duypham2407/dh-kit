import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionCommand } from "./session.js";

afterEach(() => vi.restoreAllMocks());

describe("runSessionCommand", () => {
  it("renders list JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runSessionCommand(["list", "--json", "--limit", "1"], "/repo", {
      listSessions: () => ({ sessions: [] }),
      showSession: () => {
        throw new Error("unused");
      },
      deleteSession: () => {
        throw new Error("unused");
      },
      forkSession: () => {
        throw new Error("unused");
      },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({ sessions: [] });
  });

  it("guards delete without yes", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitCode = await runSessionCommand(["delete", "session-1"], "/repo");

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("Refusing to delete session 'session-1' without --yes.");
  });

  it("renders fork JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runSessionCommand(["fork", "session-1", "--title", "Branch", "--json"], "/repo", {
      listSessions: () => ({ sessions: [] }),
      showSession: () => {
        throw new Error("unused");
      },
      deleteSession: () => {
        throw new Error("unused");
      },
      forkSession: () => ({
        sourceSessionId: "session-1",
        sessionId: "session-2",
        copied: { runtimeEvents: 0, summaries: 0, checkpoints: 0, reverts: 0 },
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).sessionId).toBe("session-2");
  });
});
