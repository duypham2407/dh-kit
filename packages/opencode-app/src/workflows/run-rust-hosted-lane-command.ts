import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { WorkflowLane } from "../../../shared/src/types/lane.js";
import type { RuntimeAuthorityFinalStatus } from "../../../shared/src/types/runtime-authority.js";
import type { LaneWorkflowReport } from "./run-lane-command.js";

type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SpawnEngine = (input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
}) => Promise<SpawnResult>;

export async function runRustHostedLaneWorkflow(input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
  spawnEngine?: SpawnEngine;
}): Promise<LaneWorkflowReport> {
  const spawnEngine = input.spawnEngine ?? spawnRustEngineLane;
  const result = await spawnEngine(input);
  try {
    return adaptRustLaneEnvelope(JSON.parse(result.stdout), result.exitCode);
  } catch (error) {
    return {
      exitCode: result.exitCode === 0 ? 1 : result.exitCode,
      lane: input.lane,
      sessionId: "",
      stage: "",
      agent: "",
      model: "",
      objective: input.objective,
      workflowSummary: [
        `Could not parse Rust-hosted lane JSON: ${(error as Error).message}`,
        result.stderr.trim() || result.stdout.trim() || "Rust engine produced no diagnostic output.",
      ],
      runtimeAuthority: "rust",
      finalStatus: "request_failed",
      degradedReason: `Could not parse Rust-hosted lane JSON: ${(error as Error).message}`,
    };
  }
}

async function spawnRustEngineLane(input: {
  lane: WorkflowLane;
  objective: string;
  repoRoot: string;
  resumeSessionId?: string;
}): Promise<SpawnResult> {
  const rustEngineDir = resolveRustEngineDir(input.repoRoot);
  const args = [
    "run",
    "-q",
    "-p",
    "dh-engine",
    "--",
    laneCommand(input.lane),
    input.objective,
    "--workspace",
    input.repoRoot,
    "--json",
  ];
  if (input.resumeSessionId) {
    args.push("--resume-session", input.resumeSessionId);
  }
  return runChild("cargo", args, rustEngineDir);
}

function adaptRustLaneEnvelope(envelope: Record<string, unknown>, fallbackExitCode: number): LaneWorkflowReport {
  const workerResult = (envelope.workerResult && typeof envelope.workerResult === "object"
    ? envelope.workerResult
    : {}) as Record<string, unknown>;
  const lifecycle = (envelope.rustLifecycle && typeof envelope.rustLifecycle === "object"
    ? envelope.rustLifecycle
    : {}) as Record<string, unknown>;

  return {
    exitCode: numberValue(workerResult.exitCode, numberValue(lifecycle.finalExitCode, fallbackExitCode)),
    lane: laneValue(workerResult.lane, envelope.command),
    sessionId: stringValue(envelope.sessionId, stringValue(workerResult.sessionId, "")),
    stage: stringValue(workerResult.stage, ""),
    agent: stringValue(workerResult.agent, ""),
    model: stringValue(workerResult.model, ""),
    objective: stringValue(workerResult.objective, ""),
    workflowSummary: stringArray(workerResult.workflowSummary),
    runtimeAuthority: "rust",
    finalStatus: finalStatusValue(envelope.finalStatus, lifecycle.finalStatus),
    degradedReason: nullableString(envelope.degradedReason),
    hostLifecycle: {
      topology: stringValue(lifecycle.topology, "rust_host_ts_worker"),
      supportBoundary: stringValue(lifecycle.supportBoundary, "runtime_authority_spine"),
      finalStatus: stringValue(lifecycle.finalStatus, stringValue(envelope.finalStatus, "request_failed")),
      finalExitCode: numberValue(lifecycle.finalExitCode, fallbackExitCode),
      workerState: optionalString(lifecycle.workerState),
      healthState: optionalString(lifecycle.healthState),
      failurePhase: optionalString(lifecycle.failurePhase),
      timeoutClass: optionalString(lifecycle.timeoutClass),
      recoveryOutcome: optionalString(lifecycle.recoveryOutcome),
      cleanupOutcome: optionalString(lifecycle.cleanupOutcome),
    },
  };
}

function laneCommand(lane: WorkflowLane): "quick" | "delivery" | "migrate" {
  return lane === "migration" ? "migrate" : lane;
}

function laneValue(...values: unknown[]): WorkflowLane {
  for (const value of values) {
    if (value === "quick" || value === "delivery" || value === "migration") return value;
    if (value === "migrate") return "migration";
  }
  return "quick";
}

function finalStatusValue(...values: unknown[]): RuntimeAuthorityFinalStatus {
  for (const value of values) {
    if (
      value === "clean_success" ||
      value === "recovered_degraded_success" ||
      value === "degraded_success" ||
      value === "startup_failed" ||
      value === "request_failed" ||
      value === "cancelled" ||
      value === "cleanup_incomplete"
    ) {
      return value;
    }
  }
  return "request_failed";
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function runChild(command: string, args: string[], cwd: string): Promise<SpawnResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      resolve({ exitCode: 1, stdout, stderr: `${stderr}${stderr ? "\n" : ""}${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function resolveRustEngineDir(repoRoot: string): string {
  const fromRepoRoot = path.join(repoRoot, "rust-engine");
  if (fs.existsSync(fromRepoRoot)) return fromRepoRoot;
  return fileURLToPath(new URL("../../../../rust-engine", import.meta.url));
}
