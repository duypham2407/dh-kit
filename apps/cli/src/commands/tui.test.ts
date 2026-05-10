import { afterEach, describe, expect, it, vi } from "vitest";
import type { TuiAppClient } from "../../../tui/src/app.js";
import { runTuiCommand } from "./tui.js";

afterEach(() => vi.restoreAllMocks());

function makeClient(): TuiAppClient {
  return {
    health: async () => ({ ok: true, product: "dh" }),
    sessions: async () => ({ sessions: [] }),
    run: async () => {
      throw new Error("unused");
    },
  };
}

describe("runTuiCommand", () => {
  it("attaches to an existing server", async () => {
    const calls: unknown[] = [];

    const exitCode = await runTuiCommand(["--server", "http://127.0.0.1:3000", "--password", "secret"], "/repo", {
      startServer: async () => {
        throw new Error("unused");
      },
      createClient: (options) => {
        calls.push({ createClient: options });
        return makeClient();
      },
      runTui: async (options) => {
        calls.push({ runTui: options.serverUrl });
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { createClient: { baseUrl: "http://127.0.0.1:3000", password: "secret" } },
      { runTui: "http://127.0.0.1:3000" },
    ]);
  });

  it("starts a local server when no server URL is provided", async () => {
    const calls: unknown[] = [];

    const exitCode = await runTuiCommand([], "/repo", {
      startServer: async (input) => {
        calls.push({ startServer: input });
        return { url: "http://127.0.0.1:4567" };
      },
      createClient: (options) => {
        calls.push({ createClient: options });
        return makeClient();
      },
      runTui: async (options) => {
        calls.push({ runTui: options.serverUrl });
      },
    });

    expect(exitCode).toBe(0);
    expect(calls).toEqual([
      { startServer: { repoRoot: "/repo", host: "127.0.0.1", port: 0, password: undefined } },
      { createClient: { baseUrl: "http://127.0.0.1:4567", password: undefined } },
      { runTui: "http://127.0.0.1:4567" },
    ]);
  });

  it("rejects flags missing values", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    const exitCode = await runTuiCommand(["--server"], "/repo");

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("--server requires a value.");
  });
});
