import { spawn, type SpawnOptionsWithoutStdio } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const describeIncrementalTool = process.env.RGA_07F_MEASURE_INCREMENTAL === "1" ? describe : describe.skip;
const INCREMENTAL_SAMPLE_REPETITIONS = 3;
const PROCESS_OUTPUT_LIMIT_BYTES = 200_000;

type ProcessRunResult = {
  command: string;
  args: string[];
  cwd?: string;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  durationMs: number;
  stdout: string;
  stderr: string;
};

describeIncrementalTool("RGA-07F incremental performance measurement tooling", () => {
  it("writes focused RGA-07F before/after incremental artifacts", async () => {
    const repoRoot = repositoryRoot();
    const engineBinary = path.join(repoRoot, "rust-engine", "target", "debug", "dh-engine");
    const after = await measureIncrementalMutations(repoRoot, engineBinary);
    const afterPath = await writeArtifact("rga-07f-after-incremental-metrics.json", after);
    const summary = buildSummary(repoRoot, afterPath, after);
    await writeArtifact("rga-07f-performance-summary.json", summary);
    expect(afterPath).toBe("docs/solution/rga-07f-after-incremental-metrics.json");
  }, 600_000);
});

function docsSolutionDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function repositoryRoot(): string {
  return path.resolve(docsSolutionDir(), "../..");
}

async function measureIncrementalMutations(repoRoot: string, engineBinary: string) {
  const startedAt = new Date().toISOString();
  if (!await fileExists(engineBinary)) {
    return failedAttempt("changed_incremental_temp_copy", startedAt, `Engine binary is missing at ${engineBinary}; run cargo build -p dh-engine first.`);
  }

  let tempRoot: string | null = null;
  try {
    tempRoot = await createTempCorpusCopy(repoRoot);
    const mutableFiles = await listMutableSourceFiles(tempRoot);
    if (mutableFiles.length < 10) {
      return failedAttempt("changed_incremental_temp_copy", startedAt, `Only ${mutableFiles.length} mutable source files were found in temp corpus copy; 10-file benchmark cannot run honestly.`, {
        tempRoot,
      });
    }

    const baseline = await runProcess(engineBinary, ["index", "--workspace", tempRoot, "--force-full"], {
      cwd: path.join(repoRoot, "rust-engine"),
      timeoutMs: 300_000,
    });

    const oneFileSamples = [];
    for (let sampleIndex = 0; sampleIndex < INCREMENTAL_SAMPLE_REPETITIONS; sampleIndex += 1) {
      const changed = [mutableFiles[0]];
      await mutateFiles(changed, sampleIndex, "one_file");
      const run = await runProcess(engineBinary, ["index", "--workspace", tempRoot], {
        cwd: path.join(repoRoot, "rust-engine"),
        timeoutMs: 180_000,
      });
      oneFileSamples.push(incrementalSample("changed_1_file", sampleIndex + 1, tempRoot, changed, run));
    }

    const tenFileSamples = [];
    for (let sampleIndex = 0; sampleIndex < INCREMENTAL_SAMPLE_REPETITIONS; sampleIndex += 1) {
      const changed = mutableFiles.slice(0, 10);
      await mutateFiles(changed, sampleIndex, "ten_file");
      const run = await runProcess(engineBinary, ["index", "--workspace", tempRoot], {
        cwd: path.join(repoRoot, "rust-engine"),
        timeoutMs: 180_000,
      });
      tenFileSamples.push(incrementalSample("changed_10_file", sampleIndex + 1, tempRoot, changed, run));
    }

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      taskId: "RGA-07F",
      measurement: "changed_incremental_temp_copy_after_optimization",
      corpus: {
        ...officialCorpus(repoRoot),
        tempCopyRoot: tempRoot,
        tempCopyPolicy: "Copied from the official DH/OpenKit working tree while excluding generated dependency/build/database artifacts.",
      },
      baseline: {
        status: baseline.exitCode === 0 ? "measured" : "attempt_failed",
        command: baseline,
        parsedStdout: parseKeyValueOutput(baseline.stdout),
      },
      changedOneFile: summarizeIncrementalSamples(oneFileSamples, 500),
      changedTenFiles: summarizeIncrementalSamples(tenFileSamples, 2000),
      rawSamples: {
        oneFileSamples,
        tenFileSamples,
      },
      limitations: [
        "Mutation benchmarks ran in a temporary copy to avoid destructive repository mutation.",
        "The temporary copy excludes generated dependency/build/database artifacts, so this is source-corpus evidence rather than an exact byte-for-byte working tree benchmark.",
        "p95 is computed from three samples per mutation set to match the RGA-07B attempt artifact shape; this is weaker than a statistically rigorous benchmark run.",
        "Benchmarks use the debug dh-engine binary because RGA-07B used the debug binary; results are comparable to RGA-07B but are not release-profile SLA proof.",
      ],
    };
  } catch (error) {
    return failedAttempt("changed_incremental_temp_copy", startedAt, error instanceof Error ? error.message : String(error), {
      tempRoot,
    });
  } finally {
    if (tempRoot) {
      await fs.rm(tempRoot, { recursive: true, force: true });
    }
  }
}

function buildSummary(repoRoot: string, afterArtifactPath: string, after: Record<string, unknown>) {
  const changedOneFile = after.changedOneFile as { engineDurationMs?: { p95?: number; thresholdResult?: string } } | undefined;
  const changedTenFiles = after.changedTenFiles as { engineDurationMs?: { p95?: number; thresholdResult?: string } } | undefined;
  const oneFileP95 = changedOneFile?.engineDurationMs?.p95 ?? null;
  const tenFileP95 = changedTenFiles?.engineDurationMs?.p95 ?? null;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskId: "RGA-07F",
    sourceRga07bArtifact: "docs/solution/rga-07b-incremental-metrics.json",
    afterArtifact: afterArtifactPath,
    corpus: officialCorpus(repoRoot),
    gateResults: {
      changedOneFileIncremental: changedOneFile?.engineDurationMs?.thresholdResult ?? "not_measured",
      changedTenFileIncremental: changedTenFiles?.engineDurationMs?.thresholdResult ?? "not_measured",
      rga08DeleteGate: oneFileP95 !== null && oneFileP95 <= 500 && tenFileP95 !== null && tenFileP95 <= 2000 ? "incremental_gate_unblocked_by_rga_07f" : "blocked_by_incremental_gate_or_other_rga07_gates",
    },
    beforeRga07b: {
      changedOneFileEngineP95Ms: 3098,
      changedTenFileEngineP95Ms: 4935,
      artifact: "docs/solution/rga-07b-incremental-metrics.json",
    },
    afterMeasuredSubset: {
      changedOneFileEngineP95Ms: oneFileP95,
      changedTenFileEngineP95Ms: tenFileP95,
      changedOneFileThresholdP95Ms: 500,
      changedTenFileThresholdP95Ms: 2000,
    },
    artifactsWritten: [afterArtifactPath, "docs/solution/rga-07f-performance-summary.json"],
    limitations: [
      "RGA-07F is scoped only to incremental indexing/link/hydration performance remediation.",
      "RGA-07G parity remains out of scope and may still block RGA-08.",
      "RGA-08 deletion was not started.",
    ],
  };
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<ProcessRunResult> {
  const startedAt = performance.now();
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: "pipe",
  } satisfies SpawnOptionsWithoutStdio);
  let stdout = "";
  let stderr = "";
  let timedOut = false;

  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout = truncateOutput(stdout + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk));
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr = truncateOutput(stderr + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk));
  });

  const exit = await new Promise<{ exitCode: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs);
    child.on("exit", (exitCode, signal) => {
      clearTimeout(timer);
      resolve({ exitCode, signal });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      stderr = truncateOutput(`${stderr}\n${error.message}`);
      resolve({ exitCode: null, signal: null });
    });
  });

  return {
    command,
    args,
    cwd: options.cwd,
    exitCode: exit.exitCode,
    signal: exit.signal,
    timedOut,
    durationMs: performance.now() - startedAt,
    stdout,
    stderr,
  };
}

async function createTempCorpusCopy(repoRoot: string): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rga-07f-corpus-"));
  await fs.cp(repoRoot, tempRoot, {
    recursive: true,
    filter: (source) => {
      const rel = normalizePath(path.relative(repoRoot, source));
      if (rel === "") {
        return true;
      }
      if (rel === ".git" || rel.startsWith(".git/")) {
        return false;
      }
      if (rel === "node_modules" || rel.startsWith("node_modules/")) {
        return false;
      }
      if (rel === "dist" || rel.startsWith("dist/")) {
        return false;
      }
      if (rel === "rust-engine/target" || rel.startsWith("rust-engine/target/")) {
        return false;
      }
      if (rel.endsWith(".db") || rel.endsWith(".db-shm") || rel.endsWith(".db-wal")) {
        return false;
      }
      return true;
    },
  });
  return tempRoot;
}

async function listMutableSourceFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  const allowed = new Set([".ts", ".tsx", ".js", ".jsx", ".rs", ".go", ".py"]);
  const roots = [path.join(root, "packages"), path.join(root, "rust-engine", "crates")];

  for (const start of roots) {
    if (!await fileExists(start)) {
      continue;
    }
    await walk(start, async (entry) => {
      const rel = normalizePath(path.relative(root, entry));
      if (rel.includes("/target/") || rel.includes("/node_modules/") || rel.includes("/dist/")) {
        return;
      }
      const ext = path.extname(entry);
      if (!allowed.has(ext)) {
        return;
      }
      const stat = await fs.stat(entry);
      if (stat.size > 500_000) {
        return;
      }
      out.push(entry);
    });
  }

  return out.sort((a, b) => normalizePath(a).localeCompare(normalizePath(b)));
}

async function walk(current: string, visitFile: (filePath: string) => Promise<void>): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(current, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "target" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      await walk(fullPath, visitFile);
      continue;
    }
    if (entry.isFile()) {
      await visitFile(fullPath);
    }
  }
}

async function mutateFiles(files: string[], sampleIndex: number, label: string): Promise<void> {
  for (const file of files) {
    const ext = path.extname(file);
    const marker = `rga-07f ${label} sample ${sampleIndex + 1} ${new Date().toISOString()}`;
    const comment = ext === ".py" ? `\n# ${marker}\n` : `\n// ${marker}\n`;
    await fs.appendFile(file, comment, "utf8");
  }
}

function incrementalSample(
  mutationSet: "changed_1_file" | "changed_10_file",
  sampleNumber: number,
  tempRoot: string,
  changedFiles: string[],
  run: ProcessRunResult,
) {
  const parsedStdout = parseKeyValueOutput(run.stdout);
  const engineDurationMs = numberFromParsed(parsedStdout.duration_ms);
  const linkMs = numberFromParsed(parsedStdout.link_ms);
  const graphHydrationMs = numberFromParsed(parsedStdout.graph_hydration_ms);
  return {
    mutationSet,
    sampleNumber,
    changedFileCount: changedFiles.length,
    changedFiles: changedFiles.map((file) => repoRelative(tempRoot, file)),
    wallMs: run.durationMs,
    engineDurationMs,
    linkMs,
    graphHydrationMs,
    parsedStdout,
    command: run,
    status: run.exitCode === 0 ? "measured" : "attempt_failed",
  };
}

function summarizeIncrementalSamples(samples: ReturnType<typeof incrementalSample>[], thresholdP95Ms: number) {
  const wall = samples.map((sample) => sample.wallMs).filter(Number.isFinite);
  const engine = samples.map((sample) => sample.engineDurationMs).filter((value): value is number => value !== null && Number.isFinite(value));
  const link = samples.map((sample) => sample.linkMs).filter((value): value is number => value !== null && Number.isFinite(value));
  const hydration = samples.map((sample) => sample.graphHydrationMs).filter((value): value is number => value !== null && Number.isFinite(value));
  const engineP95 = percentile(engine, 0.95);

  return {
    status: samples.every((sample) => sample.status === "measured") ? "measured" : "attempt_failed",
    sampleCount: samples.length,
    thresholdP95Ms,
    wallMs: metricSummary(wall, thresholdP95Ms),
    engineDurationMs: {
      ...metricSummary(engine, thresholdP95Ms),
      thresholdResult: engineP95 !== null && engineP95 <= thresholdP95Ms ? "measured_subset_pass" : "measured_subset_fail",
    },
    linkMs: metricSummary(link, null),
    graphHydrationMs: metricSummary(hydration, null),
  };
}

function metricSummary(values: number[], thresholdP95Ms: number | null) {
  const p50 = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const max = values.length > 0 ? Math.max(...values) : null;
  return {
    p50,
    p95,
    max,
    ...(thresholdP95Ms === null ? {} : { thresholdResult: p95 !== null && p95 <= thresholdP95Ms ? "measured_subset_pass" : "measured_subset_fail" }),
  };
}

function percentile(values: number[], percentileValue: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * percentileValue) - 1;
  return Number(sorted[Math.max(0, Math.min(sorted.length - 1, index))].toFixed(3));
}

function officialCorpus(repoRoot: string) {
  return {
    label: "DH/OpenKit official corpus",
    rootPath: repoRoot,
    snapshot: "local-working-tree",
    largeCorpusTargetFiles: 3000,
    limitation: "Current official corpus is smaller than the 3,000-file target recorded in the approved solution; measurements remain official-corpus evidence, not large-corpus proof.",
  };
}

function parseKeyValueOutput(stdout: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^(?<key>[a-zA-Z0-9_]+):\s*(?<value>.*)$/.exec(line.trim());
    if (match?.groups) {
      out[match.groups.key] = match.groups.value;
    }
  }
  return out;
}

function numberFromParsed(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function repoRelative(repoRoot: string, filePath: string): string {
  return normalizePath(path.relative(repoRoot, filePath));
}

async function writeArtifact(fileName: string, value: unknown): Promise<string> {
  const filePath = path.join(docsSolutionDir(), fileName);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return `docs/solution/${fileName}`;
}

function failedAttempt(measurement: string, startedAt: string, reason: string, extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    startedAt,
    taskId: "RGA-07F",
    measurement,
    status: "attempt_failed",
    reason,
    ...extra,
  };
}

function truncateOutput(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= PROCESS_OUTPUT_LIMIT_BYTES) {
    return value;
  }
  return `${value.slice(0, PROCESS_OUTPUT_LIMIT_BYTES)}\n[truncated]`;
}
