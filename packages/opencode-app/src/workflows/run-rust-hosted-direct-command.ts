import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RunDirectInput, RunDirectReport, RunEvent } from "../../../shared/src/types/run.js";
import type { RuntimeAuthorityFinalStatus } from "../../../shared/src/types/runtime-authority.js";

type SpawnResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

type SpawnEngine = (input: RunDirectInput) => Promise<SpawnResult>;

export async function runRustHostedDirectCommand(
  input: RunDirectInput & { spawnEngine?: SpawnEngine },
): Promise<RunDirectReport> {
  const spawnEngine = input.spawnEngine ?? spawnRustEngineRun;
  const result = await spawnEngine(input);
  try {
    return adaptRustRunEnvelope(JSON.parse(result.stdout), result.exitCode);
  } catch (error) {
    return {
      exitCode: result.exitCode === 0 ? 1 : result.exitCode,
      command: "run",
      sessionId: "",
      model: "",
      agentId: "",
      text: result.stderr.trim() || result.stdout.trim() || "Rust engine produced no diagnostic output.",
      events: [],
      files: [],
      runtimeAuthority: "rust",
      finalStatus: "request_failed",
      degradedReason: `Could not parse Rust-hosted run JSON: ${(error as Error).message}`,
    };
  }
}

async function spawnRustEngineRun(input: RunDirectInput): Promise<SpawnResult> {
  const rustEngineDir = resolveRustEngineDir(input.repoRoot);
  const args = [
    "run",
    "-q",
    "-p",
    "dh-engine",
    "--",
    "run",
    input.message,
    "--workspace",
    input.repoRoot,
    "--json",
  ];
  if (input.continueLatest) args.push("--continue");
  if (input.sessionId) args.push("--session", input.sessionId);
  if (input.fork) args.push("--fork");
  if (input.model) args.push("--model", input.model);
  if (input.agentId) args.push("--agent", input.agentId);
  if (input.variant) args.push("--variant", input.variant);
  if (input.title) args.push("--title", input.title);
  if (input.autoApprove) args.push("--auto-approve");
  for (const file of input.files ?? []) args.push("--file", file);
  return runChild("cargo", args, rustEngineDir);
}

function adaptRustRunEnvelope(envelope: Record<string, unknown>, fallbackExitCode: number): RunDirectReport {
  const workerResult = objectValue(envelope.workerResult);
  const workerReport = objectValue(workerResult.report);
  const lifecycle = objectValue(envelope.rustLifecycle);

  return {
    exitCode: numberValue(workerReport.exitCode, numberValue(lifecycle.finalExitCode, fallbackExitCode)),
    command: "run",
    sessionId: stringValue(envelope.sessionId, stringValue(workerReport.sessionId, "")),
    model: stringValue(workerReport.model, ""),
    agentId: stringValue(workerReport.agentId, ""),
    title: optionalString(workerReport.title),
    text: stringValue(workerReport.text, ""),
    events: runEventsValue(workerReport.events),
    files: filesValue(workerReport.files),
    runtimeAuthority: "rust",
    finalStatus: finalStatusValue(envelope.finalStatus, lifecycle.finalStatus, workerReport.finalStatus),
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function runEventsValue(value: unknown): RunEvent[] {
  return Array.isArray(value) ? value.filter(isRunEvent) : [];
}

function isRunEvent(value: unknown): value is RunEvent {
  const candidate = objectValue(value);
  return typeof candidate.type === "string"
    && typeof candidate.sessionId === "string"
    && typeof candidate.sequence === "number"
    && typeof candidate.timestamp === "string"
    && Boolean(candidate.payload && typeof candidate.payload === "object");
}

function filesValue(value: unknown): RunDirectReport["files"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const file = objectValue(item);
    return typeof file.path === "string" && typeof file.byteLength === "number"
      ? [{ path: file.path, byteLength: file.byteLength }]
      : [];
  });
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
      value === "cleanup_incomplete" ||
      value === "typescript_compatibility"
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
