import { describe, expect, it } from "vitest";
import { runRustHostedDirectCommand } from "./run-rust-hosted-direct-command.js";

describe("runRustHostedDirectCommand", () => {
  it("adapts Rust run envelope into RunDirectReport", async () => {
    const report = await runRustHostedDirectCommand({
      message: "inspect",
      repoRoot: "/repo",
      spawnEngine: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          command: "run",
          commandFamily: "run",
          runtimeAuthority: "rust",
          sessionId: "session-run-1",
          finalStatus: "clean_success",
          degradedReason: null,
          rustLifecycle: { finalStatus: "clean_success", finalExitCode: 0 },
          workerResult: {
            report: {
              exitCode: 0,
              command: "run",
              sessionId: "session-run-1",
              model: "openai/gpt-5",
              agentId: "quick-agent",
              text: "answer",
              files: [],
              events: [
                {
                  type: "text.delta",
                  sessionId: "session-run-1",
                  sequence: 1,
                  timestamp: "2026-05-10T00:00:00.000Z",
                  payload: { text: "answer" },
                },
              ],
            },
          },
        }),
        stderr: "",
      }),
    });

    expect(report.runtimeAuthority).toBe("rust");
    expect(report.sessionId).toBe("session-run-1");
    expect(report.text).toBe("answer");
    expect(report.events[0]?.type).toBe("text.delta");
  });

  it("returns request_failed when Rust output is not valid JSON", async () => {
    const report = await runRustHostedDirectCommand({
      message: "bad",
      repoRoot: "/repo",
      spawnEngine: async () => ({ exitCode: 1, stdout: "not-json", stderr: "failed" }),
    });

    expect(report.exitCode).toBe(1);
    expect(report.runtimeAuthority).toBe("rust");
    expect(report.finalStatus).toBe("request_failed");
    expect(report.degradedReason).toContain("Could not parse Rust-hosted run JSON");
  });
});
