import { afterEach, describe, expect, it, vi } from "vitest";
import { runServeCommand } from "./serve.js";

afterEach(() => vi.restoreAllMocks());

describe("runServeCommand", () => {
  it("starts server and renders JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const calls: unknown[] = [];

    const exitCode = await runServeCommand(["--host", "127.0.0.1", "--port", "4096", "--json"], "/repo", {
      startServer: async (input) => {
        calls.push(input);
        return { url: "http://127.0.0.1:4096" };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls[0]).toMatchObject({ repoRoot: "/repo", host: "127.0.0.1", port: 4096 });
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toMatchObject({ url: "http://127.0.0.1:4096" });
  });

  it("passes password for non-localhost binds", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const calls: unknown[] = [];

    const exitCode = await runServeCommand(["--host", "0.0.0.0", "--password", "secret"], "/repo", {
      startServer: async (input) => {
        calls.push(input);
        return { url: "http://0.0.0.0:0" };
      },
    });

    expect(exitCode).toBe(0);
    expect(calls[0]).toMatchObject({ host: "0.0.0.0", password: "secret" });
    expect(String(stdout.mock.calls[0]?.[0])).toContain("server: http://0.0.0.0:0");
  });
});
