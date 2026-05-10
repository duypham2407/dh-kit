import { describe, expect, it } from "vitest";
import { runRustHostedLaneWorkflow } from "./run-rust-hosted-lane-command.js";

describe("runRustHostedLaneWorkflow", () => {
  it("adapts Rust-hosted lane JSON into LaneWorkflowReport", async () => {
    const report = await runRustHostedLaneWorkflow({
      lane: "quick",
      objective: "inspect runtime authority",
      repoRoot: "/repo",
      spawnEngine: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({
          command: "quick",
          commandFamily: "lane",
          runtimeAuthority: "rust",
          sessionId: "session-rust-1",
          finalStatus: "clean_success",
          degradedReason: null,
          rustLifecycle: {
            topology: "rust_host_ts_worker",
            supportBoundary: "runtime_authority_spine",
            workerState: "ready",
            healthState: "healthy",
            failurePhase: "none",
            timeoutClass: "none",
            recoveryOutcome: "not_attempted",
            cleanupOutcome: "graceful",
            finalStatus: "clean_success",
            finalExitCode: 0,
          },
          workerResult: {
            exitCode: 0,
            lane: "quick",
            sessionId: "session-rust-1",
            stage: "quick_execute",
            agent: "Quick Agent",
            model: "openai/gpt-5/default",
            objective: "inspect runtime authority",
            workflowSummary: ["ran through rust host"],
          },
        }),
        stderr: "",
      }),
    });

    expect(report.exitCode).toBe(0);
    expect(report.lane).toBe("quick");
    expect(report.runtimeAuthority).toBe("rust");
    expect(report.sessionId).toBe("session-rust-1");
    expect(report.finalStatus).toBe("clean_success");
    expect(report.degradedReason).toBeNull();
    expect(report.workflowSummary).toEqual(["ran through rust host"]);
  });

  it("returns a degraded report when Rust engine output is not valid JSON", async () => {
    const report = await runRustHostedLaneWorkflow({
      lane: "delivery",
      objective: "bad output",
      repoRoot: "/repo",
      spawnEngine: async () => ({
        exitCode: 1,
        stdout: "not-json",
        stderr: "engine failed",
      }),
    });

    expect(report.exitCode).toBe(1);
    expect(report.runtimeAuthority).toBe("rust");
    expect(report.finalStatus).toBe("request_failed");
    expect(report.degradedReason).toContain("Could not parse Rust-hosted lane JSON");
    expect(report.workflowSummary.join("\n")).toContain("engine failed");
  });
});
