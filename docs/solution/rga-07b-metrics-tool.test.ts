import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance, monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const describeMetricsTool = process.env.RGA_07B_MEASURE_METRICS === "1" ? describe : describe.skip;

const QUERY_SAMPLE_REPETITIONS = 5;
const INCREMENTAL_SAMPLE_REPETITIONS = 3;
const PROCESS_OUTPUT_LIMIT_BYTES = 200_000;
const RSS_SAMPLE_INTERVAL_MS = 100;

type JsonObject = Record<string, unknown>;

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
  rss: RssSummary;
  eventLoop: EventLoopSummary;
};

type RssSummary = {
  status: "measured" | "measurement_failed" | "not_available";
  method: string;
  pid: number | null;
  sampleCount: number;
  peakRssBytes: number | null;
  p50RssBytes: number | null;
  p95RssBytes: number | null;
  maxRssBytes: number | null;
  failures: string[];
};

type EventLoopSummary = {
  status: "measured" | "not_available";
  method: string;
  resolutionMs: number;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  meanMs: number | null;
};

type JsonRpcMeasurement = {
  label: string;
  method: string;
  success: boolean;
  latencyMs: number;
  requestPayloadBytes: number;
  responsePayloadBytes: number;
  answerState?: string;
  questionClass?: string;
  itemCount?: number;
  errorCode?: number;
  errorMessage?: string;
};

describeMetricsTool("RGA-07B payload/event-loop/memory measurement tooling", () => {
  it("writes honest RGA-07B measurement artifacts", async () => {
    const repoRoot = repositoryRoot();
    const solutionDir = docsSolutionDir();
    const engineBinary = engineBinaryPath(repoRoot);
    const artifactsWritten: string[] = [];

    const toolingInspection = await inspectTooling(repoRoot, engineBinary);
    artifactsWritten.push(await writeArtifact("rga-07b-tooling-inspection.json", toolingInspection));

    const officialIndexMemory = await measureOfficialWarmIndex(repoRoot, engineBinary, solutionDir);
    artifactsWritten.push(await writeArtifact("rga-07b-official-index-memory.json", officialIndexMemory));
    if (officialIndexMemory.outputArtifactPath && await fileExists(officialIndexMemory.outputArtifactPath)) {
      artifactsWritten.push(repoRelative(repoRoot, officialIndexMemory.outputArtifactPath));
    }

    const bridgeMetrics = await measureBridgeQueryPayloads(repoRoot, engineBinary);
    artifactsWritten.push(await writeArtifact("rga-07b-bridge-query-metrics.json", bridgeMetrics));

    const incrementalMetrics = await measureIncrementalMutations(repoRoot, engineBinary);
    artifactsWritten.push(await writeArtifact("rga-07b-incremental-metrics.json", incrementalMetrics));

    const summaryArtifactPath = "docs/solution/rga-07b-measurement-summary.json";
    const summary = buildSummary({
      repoRoot,
      toolingInspection,
      officialIndexMemory,
      bridgeMetrics,
      incrementalMetrics,
      artifactsWritten: [...artifactsWritten, summaryArtifactPath],
    });
    artifactsWritten.push(await writeArtifact("rga-07b-measurement-summary.json", {
      ...summary,
      artifactsWritten: [...artifactsWritten, summaryArtifactPath],
    }));

    expect(artifactsWritten.length).toBeGreaterThan(0);
  }, 600_000);
});

function docsSolutionDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

function repositoryRoot(): string {
  return path.resolve(docsSolutionDir(), "../..");
}

function engineBinaryPath(repoRoot: string): string {
  return path.join(repoRoot, "rust-engine", "target", "debug", "dh-engine");
}

async function inspectTooling(repoRoot: string, engineBinary: string) {
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8")) as {
    scripts?: Record<string, string>;
  };

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskId: "RGA-07B",
    corpus: officialCorpus(repoRoot),
    inspectedSurfaces: {
      packageJson: {
        path: repoRelative(repoRoot, packageJsonPath),
        scripts: packageJson.scripts ?? {},
        benchmarkScriptPresent: Boolean(packageJson.scripts?.benchmark),
        parityScriptPresent: Boolean(packageJson.scripts?.parity),
      },
      rustEngine: {
        cargoManifest: "rust-engine/Cargo.toml",
        binaryPath: engineBinary,
        binaryExists: await fileExists(engineBinary),
        currentCliClasses: [
          "cold-full-index",
          "warm-no-change-index",
          "incremental-reindex",
          "cold-query",
          "warm-query",
          "parity-benchmark",
        ],
        currentCliLimitations: [
          "Benchmark JSON has index/query timings but does not expose payload byte distribution.",
          "Benchmark JSON memory fields are currently not_measured.",
          "Hydrate timing exists in the Rust IndexReport but is not printed by the dh-engine index CLI or serialized in benchmark JSON.",
          "The built-in incremental benchmark class is labeled no-mutation; changed-file mutation samples need external temp-copy orchestration.",
        ],
      },
      rga07aInputs: {
        parityReport: "docs/solution/2026-04-30-rust-graph-ast-migration-rga-07a-parity-report.md",
        rustIndexCounts: "docs/solution/rga-07a-rust-index-counts.json",
        normalizedParity: "docs/solution/rga-07a-normalized-parity.json",
      },
    },
    blockerClassification: {
      missingNativeNpmBenchmarkScript: !Boolean(packageJson.scripts?.benchmark),
      nativeRustBenchmarkCliAvailable: await fileExists(engineBinary),
      measurementToolingAddedAsNonProductionArtifact: true,
      productionCodeModified: false,
    },
  };
}

async function measureOfficialWarmIndex(repoRoot: string, engineBinary: string, solutionDir: string) {
  const outputArtifactPath = path.join(solutionDir, "rga-07b-official-warm-index-benchmark.json");
  const startedAt = new Date().toISOString();
  if (!await fileExists(engineBinary)) {
    return failedAttempt("official_warm_index_memory", startedAt, `Engine binary is missing at ${engineBinary}; run cargo build -p dh-engine first.`, {
      outputArtifactPath,
    });
  }

  const command = await runProcess(engineBinary, [
    "benchmark",
    "--class",
    "warm-no-change-index",
    "--workspace",
    repoRoot,
    "--output",
    outputArtifactPath,
  ], {
    cwd: path.join(repoRoot, "rust-engine"),
    timeoutMs: 240_000,
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskId: "RGA-07B",
    measurement: "official_warm_index_memory",
    corpus: officialCorpus(repoRoot),
    command,
    outputArtifactPath,
    outputArtifactRepoPath: repoRelative(repoRoot, outputArtifactPath),
    status: command.exitCode === 0 ? "measured" : "attempt_failed",
    memory: command.rss,
    limitations: [
      "This wraps the Rust CLI process from TypeScript and samples OS RSS externally; it is not an internal Rust allocator profile.",
      "The benchmark class is warm-no-change-index; it may become degraded if local index state detects newly changed files.",
      "This does not provide hydrate p95 because current benchmark JSON does not serialize graph_hydration_ms.",
    ],
  };
}

async function measureBridgeQueryPayloads(repoRoot: string, engineBinary: string) {
  const startedAt = new Date().toISOString();
  if (!await fileExists(engineBinary)) {
    return failedAttempt("bridge_query_payload_event_loop_memory", startedAt, `Engine binary is missing at ${engineBinary}; run cargo build -p dh-engine first.`);
  }

  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  const client = new JsonRpcBridgeClient(engineBinary, repoRoot);
  const measurements: JsonRpcMeasurement[] = [];
  let rssSampler: ReturnType<typeof startRssSampler> | null = null;
  let bridgePid: number | null = null;

  try {
    await client.start();
    bridgePid = client.pid;
    if (bridgePid !== null) {
      rssSampler = startRssSampler(bridgePid, RSS_SAMPLE_INTERVAL_MS);
    }
    eventLoop.enable();

    measurements.push(await client.request("initialize", "dh.initialize", {
      protocolVersion: "1",
      workspaceRoot: repoRoot,
      client: {
        name: "rga-07b-metrics-tool",
        version: "0.1.0",
      },
    }));

    for (let repetition = 0; repetition < QUERY_SAMPLE_REPETITIONS; repetition += 1) {
      for (const query of defaultBoundedQueries(repoRoot)) {
        measurements.push(await client.request(query.label, query.method, query.params));
      }
    }
  } catch (error) {
    measurements.push({
      label: "bridge_measurement_error",
      method: "<measurement>",
      success: false,
      latencyMs: 0,
      requestPayloadBytes: 0,
      responsePayloadBytes: 0,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  } finally {
    eventLoop.disable();
    await client.close();
  }

  const rss = rssSampler ? await rssSampler.stop() : emptyRssSummary(null, "sampled via ps -o rss= -p <pid>");
  const eventLoopSummary = summarizeEventLoop(eventLoop, 10);
  const successfulQueries = measurements.filter((entry) => entry.success && entry.method !== "dh.initialize");
  const payloadBytes = successfulQueries.map((entry) => entry.responsePayloadBytes);
  const latencyByMethod = groupMethodSummaries(successfulQueries);
  const buildEvidenceLatencies = successfulQueries
    .filter((entry) => entry.method === "query.buildEvidence")
    .map((entry) => entry.latencyMs);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskId: "RGA-07B",
    measurement: "bridge_query_payload_event_loop_memory",
    corpus: officialCorpus(repoRoot),
    process: {
      executable: engineBinary,
      mode: "serve",
      pid: bridgePid,
    },
    samplePlan: {
      repetitions: QUERY_SAMPLE_REPETITIONS,
      defaultBoundedQueryCount: defaultBoundedQueries(repoRoot).length,
      includesInitialize: true,
    },
    payload: {
      status: payloadBytes.length > 0 ? "measured" : "not_available",
      unit: "bytes",
      sampleCount: payloadBytes.length,
      p50: percentile(payloadBytes, 50),
      p95: percentile(payloadBytes, 95),
      max: maxOrNull(payloadBytes),
      threshold: {
        p95Bytes: 256 * 1024,
        maxBytes: 1024 * 1024,
      },
      thresholdResult: thresholdResultForPayload(payloadBytes),
    },
    latency: {
      unit: "ms",
      byMethod: latencyByMethod,
      buildEvidence: {
        status: buildEvidenceLatencies.length > 0 ? "measured" : "not_available",
        sampleCount: buildEvidenceLatencies.length,
        p50Ms: percentile(buildEvidenceLatencies, 50),
        p95Ms: percentile(buildEvidenceLatencies, 95),
        maxMs: maxOrNull(buildEvidenceLatencies),
        thresholdP95Ms: 1000,
        thresholdResult: thresholdResultForLatency(buildEvidenceLatencies, 1000),
      },
    },
    eventLoop: {
      ...eventLoopSummary,
      threshold: {
        p95Ms: 20,
        maxMs: 100,
      },
      thresholdResult: thresholdResultForEventLoop(eventLoopSummary),
    },
    memory: rss,
    rawSamples: measurements,
    limitations: [
      "This measures direct JSON-RPC bridge responses from a TypeScript harness, not every higher-level UI/retrieval call site.",
      "Payload size is response JSON body bytes after Rust serialization and before Content-Length framing overhead.",
      "Node event-loop delay is measured in the TypeScript harness process while awaiting Rust stdio responses; it does not profile every OpenCode app runtime path.",
      "Peak RSS is sampled externally for the child dh-engine serve process; short spikes between polling intervals may be missed.",
    ],
  };
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
      taskId: "RGA-07B",
      measurement: "changed_incremental_temp_copy",
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
        "p95 is computed from three samples per mutation set; this is enough for an attempt artifact but weaker than a statistically rigorous benchmark run.",
        "Peak RSS is externally sampled for each dh-engine index process via ps and may miss short spikes between samples.",
      ],
    };
  } catch (error) {
    return failedAttempt("changed_incremental_temp_copy", startedAt, error instanceof Error ? error.message : String(error), {
      tempRoot,
    });
  } finally {
    if (tempRoot) {
      try {
        await fs.rm(tempRoot, { recursive: true, force: true });
      } catch (error) {
        const cleanupFailure = error instanceof Error ? error.message : String(error);
        process.stderr.write(`[rga-07b] failed to remove temp corpus copy ${tempRoot}: ${cleanupFailure}\n`);
      }
    }
  }
}

function defaultBoundedQueries(repoRoot: string): Array<{ label: string; method: string; params: JsonObject }> {
  const bridgePath = "rust-engine/crates/dh-engine/src/bridge.rs";
  return [
    {
      label: "search_symbol_indexer",
      method: "query.search",
      params: { query: "Indexer", workspaceRoot: repoRoot, mode: "symbol", limit: 5 },
    },
    {
      label: "search_file_bridge",
      method: "query.search",
      params: { query: "bridge", workspaceRoot: repoRoot, mode: "file_path", limit: 5 },
    },
    {
      label: "definition_indexer",
      method: "query.definition",
      params: { symbol: "Indexer", workspaceRoot: repoRoot, limit: 5 },
    },
    {
      label: "relationship_usage_indexer",
      method: "query.relationship",
      params: { relation: "usage", symbol: "Indexer", workspaceRoot: repoRoot, limit: 5 },
    },
    {
      label: "relationship_dependencies_bridge",
      method: "query.relationship",
      params: { relation: "dependencies", filePath: bridgePath, workspaceRoot: repoRoot, limit: 5 },
    },
    {
      label: "relationship_dependents_bridge",
      method: "query.relationship",
      params: { relation: "dependents", target: bridgePath, workspaceRoot: repoRoot, limit: 5 },
    },
    {
      label: "call_hierarchy_run_benchmark",
      method: "query.callHierarchy",
      params: { symbol: "run_benchmark", workspaceRoot: repoRoot, filePath: "rust-engine/crates/dh-engine/src/benchmark.rs", limit: 10, maxDepth: 3 },
    },
    {
      label: "entry_points_run_benchmark",
      method: "query.entryPoints",
      params: { symbol: "run_benchmark", workspaceRoot: repoRoot, filePath: "rust-engine/crates/dh-engine/src/benchmark.rs", limit: 10, maxDepth: 3 },
    },
    {
      label: "build_evidence_rust_graph",
      method: "query.buildEvidence",
      params: {
        query: "Rust graph indexer evidence",
        workspaceRoot: repoRoot,
        intent: "explain",
        targets: ["Indexer", "run_benchmark"],
        budget: { maxFiles: 5, maxSymbols: 8, maxSnippets: 8 },
        freshness: "indexed",
      },
    },
  ];
}

class JsonRpcBridgeClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private stderr = "";
  private pending = new Map<number, {
    label: string;
    method: string;
    requestPayloadBytes: number;
    startedAt: number;
    resolve: (value: JsonRpcMeasurement) => void;
  }>();

  constructor(
    private readonly engineBinary: string,
    private readonly repoRoot: string,
  ) {}

  get pid(): number | null {
    return this.child?.pid ?? null;
  }

  async start(): Promise<void> {
    const child = spawn(this.engineBinary, ["serve", "--workspace", this.repoRoot], {
      cwd: path.join(this.repoRoot, "rust-engine"),
      stdio: "pipe",
    });
    this.child = child;

    child.stdout.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      this.buffer = Buffer.concat([this.buffer, bytes]);
      this.drainFrames();
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      this.stderr = truncateOutput(this.stderr + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk));
    });

    await waitForProcessStart(child);
  }

  async request(label: string, method: string, params: JsonObject = {}): Promise<JsonRpcMeasurement> {
    const child = this.child;
    if (!child) {
      return {
        label,
        method,
        success: false,
        latencyMs: 0,
        requestPayloadBytes: 0,
        responsePayloadBytes: 0,
        errorMessage: "bridge process was not started",
      };
    }

    const id = this.nextId++;
    const payload = JSON.stringify({ jsonrpc: "2.0", id, method, params });
    const requestPayloadBytes = Buffer.byteLength(payload, "utf8");
    const frame = `Content-Length: ${requestPayloadBytes}\r\n\r\n${payload}`;

    return await new Promise<JsonRpcMeasurement>((resolve) => {
      const startedAt = performance.now();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        resolve({
          label,
          method,
          success: false,
          latencyMs: performance.now() - startedAt,
          requestPayloadBytes,
          responsePayloadBytes: 0,
          errorMessage: `timed out waiting for ${method}; stderr=${this.stderr}`,
        });
      }, 30_000);

      this.pending.set(id, {
        label,
        method,
        requestPayloadBytes,
        startedAt,
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
      });

      child.stdin.write(frame, "utf8", (error) => {
        if (!error) {
          return;
        }
        this.pending.delete(id);
        clearTimeout(timer);
        resolve({
          label,
          method,
          success: false,
          latencyMs: performance.now() - startedAt,
          requestPayloadBytes,
          responsePayloadBytes: 0,
          errorMessage: error.message,
        });
      });
    });
  }

  async close(): Promise<void> {
    if (!this.child) {
      return;
    }
    try {
      await this.request("shutdown", "dh.shutdown", {});
    } catch {
      // Best-effort shutdown only.
    }
    if (!this.child.killed) {
      this.child.kill("SIGTERM");
    }
    this.child = null;
  }

  private drainFrames(): void {
    while (true) {
      const headerEnd = findHeaderEnd(this.buffer);
      if (headerEnd === null) {
        return;
      }
      const header = this.buffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(header);
      if (contentLength === null) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      const bodyStart = headerEnd + 4;
      const frameLength = bodyStart + contentLength;
      if (this.buffer.length < frameLength) {
        return;
      }
      const body = this.buffer.subarray(bodyStart, frameLength).toString("utf8");
      this.buffer = this.buffer.subarray(frameLength);

      let parsed: JsonObject;
      try {
        parsed = JSON.parse(body) as JsonObject;
      } catch {
        continue;
      }
      const id = typeof parsed.id === "number" ? parsed.id : null;
      if (id === null) {
        continue;
      }
      const pending = this.pending.get(id);
      if (!pending) {
        continue;
      }
      this.pending.delete(id);
      pending.resolve(toJsonRpcMeasurement(pending, parsed, Buffer.byteLength(body, "utf8")));
    }
  }
}

function toJsonRpcMeasurement(
  pending: {
    label: string;
    method: string;
    requestPayloadBytes: number;
    startedAt: number;
  },
  response: JsonObject,
  responsePayloadBytes: number,
): JsonRpcMeasurement {
  const latencyMs = performance.now() - pending.startedAt;
  const error = asRecord(response.error);
  if (Object.keys(error).length > 0) {
    return {
      label: pending.label,
      method: pending.method,
      success: false,
      latencyMs,
      requestPayloadBytes: pending.requestPayloadBytes,
      responsePayloadBytes,
      errorCode: typeof error.code === "number" ? error.code : undefined,
      errorMessage: typeof error.message === "string" ? error.message : undefined,
    };
  }

  const result = asRecord(response.result);
  const items = Array.isArray(result.items) ? result.items : [];
  return {
    label: pending.label,
    method: pending.method,
    success: true,
    latencyMs,
    requestPayloadBytes: pending.requestPayloadBytes,
    responsePayloadBytes,
    answerState: typeof result.answerState === "string" ? result.answerState : undefined,
    questionClass: typeof result.questionClass === "string" ? result.questionClass : undefined,
    itemCount: items.length,
  };
}

async function runProcess(
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs: number },
): Promise<ProcessRunResult> {
  const startedAt = performance.now();
  const eventLoop = monitorEventLoopDelay({ resolution: 10 });
  eventLoop.enable();
  const child = spawn(command, args, {
    cwd: options.cwd,
    stdio: "pipe",
  } satisfies SpawnOptionsWithoutStdio);
  const rssSampler = child.pid ? startRssSampler(child.pid, RSS_SAMPLE_INTERVAL_MS) : null;
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

  eventLoop.disable();
  const rss = rssSampler ? await rssSampler.stop() : emptyRssSummary(null, "sampled via ps -o rss= -p <pid>");
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
    rss,
    eventLoop: summarizeEventLoop(eventLoop, 10),
  };
}

function startRssSampler(pid: number, intervalMs: number) {
  const samples: number[] = [];
  const failures: string[] = [];
  let stopped = false;
  let inFlight = false;

  const sample = async () => {
    if (stopped || inFlight) {
      return;
    }
    inFlight = true;
    try {
      const rss = await readRssBytes(pid);
      if (rss !== null) {
        samples.push(rss);
      }
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    } finally {
      inFlight = false;
    }
  };

  void sample();
  const timer = setInterval(() => {
    void sample();
  }, intervalMs);

  return {
    stop: async (): Promise<RssSummary> => {
      stopped = true;
      clearInterval(timer);
      await sample();
      return summarizeRss(pid, samples, failures);
    },
  };
}

async function readRssBytes(pid: number): Promise<number | null> {
  const result = await spawnCapture("ps", ["-o", "rss=", "-p", String(pid)], 1_500);
  if (result.exitCode !== 0) {
    return null;
  }
  const value = Number(result.stdout.trim());
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.round(value * 1024);
}

async function spawnCapture(command: string, args: string[], timeoutMs: number): Promise<{
  exitCode: number | null;
  stdout: string;
  stderr: string;
}> {
  const child = spawn(command, args, { stdio: "pipe" });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout = truncateOutput(stdout + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk));
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr = truncateOutput(stderr + (Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk));
  });
  return await new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.on("exit", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ exitCode: null, stdout, stderr: truncateOutput(`${stderr}\n${error.message}`) });
    });
  });
}

async function createTempCorpusCopy(repoRoot: string): Promise<string> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rga-07b-corpus-"));
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
    const marker = `rga-07b ${label} sample ${sampleIndex + 1} ${new Date().toISOString()}`;
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
  return {
    mutationSet,
    sampleNumber,
    changedFileCount: changedFiles.length,
    changedFiles: changedFiles.map((file) => repoRelative(tempRoot, file)),
    wallMs: run.durationMs,
    engineDurationMs,
    parsedStdout,
    command: run,
    status: run.exitCode === 0 ? "measured" : "attempt_failed",
  };
}

function summarizeIncrementalSamples(samples: ReturnType<typeof incrementalSample>[], thresholdP95Ms: number) {
  const wallMs = samples.filter((sample) => sample.status === "measured").map((sample) => sample.wallMs);
  const engineMs = samples
    .filter((sample) => sample.status === "measured" && sample.engineDurationMs !== null)
    .map((sample) => sample.engineDurationMs as number);
  return {
    status: wallMs.length > 0 ? "measured" : "not_available",
    sampleCount: wallMs.length,
    thresholdP95Ms,
    wallMs: {
      p50: percentile(wallMs, 50),
      p95: percentile(wallMs, 95),
      max: maxOrNull(wallMs),
      thresholdResult: thresholdResultForLatency(wallMs, thresholdP95Ms),
    },
    engineDurationMs: {
      p50: percentile(engineMs, 50),
      p95: percentile(engineMs, 95),
      max: maxOrNull(engineMs),
      thresholdResult: thresholdResultForLatency(engineMs, thresholdP95Ms),
    },
    peakRssBytes: {
      max: maxOrNull(samples.map((sample) => sample.command.rss.peakRssBytes).filter(isNumber)),
      method: "max of externally sampled per-process peak RSS values",
    },
  };
}

function parseKeyValueOutput(stdout: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const line of stdout.split(/\r?\n/u)) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/u.exec(line.trim());
    if (match) {
      parsed[match[1]] = match[2];
    }
  }
  return parsed;
}

function numberFromParsed(value: string | undefined): number | null {
  if (value === undefined) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function groupMethodSummaries(samples: JsonRpcMeasurement[]) {
  const methods = new Map<string, JsonRpcMeasurement[]>();
  for (const sample of samples) {
    const existing = methods.get(sample.method) ?? [];
    existing.push(sample);
    methods.set(sample.method, existing);
  }
  return Array.from(methods.entries()).map(([method, entries]) => {
    const latencies = entries.map((entry) => entry.latencyMs);
    const payloads = entries.map((entry) => entry.responsePayloadBytes);
    return {
      method,
      sampleCount: entries.length,
      latencyMs: {
        p50: percentile(latencies, 50),
        p95: percentile(latencies, 95),
        max: maxOrNull(latencies),
      },
      responsePayloadBytes: {
        p50: percentile(payloads, 50),
        p95: percentile(payloads, 95),
        max: maxOrNull(payloads),
      },
    };
  });
}

function buildSummary(input: {
  repoRoot: string;
  toolingInspection: JsonObject;
  officialIndexMemory: JsonObject;
  bridgeMetrics: JsonObject;
  incrementalMetrics: JsonObject;
  artifactsWritten: string[];
}) {
  const bridge = asRecord(input.bridgeMetrics);
  const payload = asRecord(bridge.payload);
  const eventLoop = asRecord(bridge.eventLoop);
  const latency = asRecord(bridge.latency);
  const buildEvidence = asRecord(latency.buildEvidence);
  const incremental = asRecord(input.incrementalMetrics);
  const oneFile = asRecord(incremental.changedOneFile);
  const tenFiles = asRecord(incremental.changedTenFiles);
  const officialIndex = asRecord(input.officialIndexMemory);
  const officialMemory = asRecord(officialIndex.memory);
  const officialCommand = asRecord(officialIndex.command);
  const bridgeMemory = asRecord(bridge.memory);

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskId: "RGA-07B",
    corpus: officialCorpus(input.repoRoot),
    status: "measured_subset_delete_gate_blocked",
    gateResults: {
      payload: payload.thresholdResult ?? "not_available",
      nodeEventLoop: eventLoop.thresholdResult ?? "not_available",
      bridgeQueryPeakRss: bridgeMemory.status ?? "not_available",
      officialWarmIndexPeakRss: officialMemory.status ?? "not_available",
      changedOneFileIncremental: asRecord(oneFile.engineDurationMs).thresholdResult ?? "not_available",
      changedTenFileIncremental: asRecord(tenFiles.engineDurationMs).thresholdResult ?? "not_available",
      buildEvidenceP95: buildEvidence.thresholdResult ?? "not_available",
      hydrateP95: "blocked_not_instrumented",
      tsBaselineComparison: "blocked_by_rga_07a_partial_baseline",
      rollbackRehearsal: "blocked_out_of_scope_for_rga_07b_pending_rga_07c",
    },
    measuredSubset: {
      payload,
      eventLoop,
      buildEvidence,
      bridgeQueryMemory: bridgeMemory,
      officialWarmIndexMemory: officialMemory,
      officialWarmIndexEventLoop: asRecord(officialCommand.eventLoop),
      changedOneFileIncremental: oneFile,
      changedTenFileIncremental: tenFiles,
    },
    deletionGateDecision: {
      rga08MayProceed: false,
      reason: "RGA-07B measured a useful subset, but hydrate p95 remains uninstrumented, RGA-07A parity remains delete-gate blocked, TS baseline comparison remains unavailable, and rollback rehearsal belongs to pending RGA-07C.",
    },
    limitations: [
      "No production TypeScript graph code was deleted or modified.",
      "No production Rust code was modified; measurements are captured by this env-gated docs test/tool artifact.",
      "Hydrate p95 remains unavailable because current CLI/benchmark JSON does not expose graph_hydration_ms distributions.",
      "Official-corpus memory is external RSS sampling, not allocator-level profiling.",
      "Changed incremental benchmarks mutate a temporary copy, not the repository working tree.",
    ],
  };
}

function failedAttempt(measurement: string, startedAt: string, reason: string, extra: JsonObject = {}) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    taskId: "RGA-07B",
    measurement,
    status: "attempt_failed",
    startedAt,
    reason,
    ...extra,
  };
}

async function writeArtifact(fileName: string, value: unknown): Promise<string> {
  const repoRoot = repositoryRoot();
  const artifactPath = path.join(docsSolutionDir(), fileName);
  await fs.writeFile(artifactPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return repoRelative(repoRoot, artifactPath);
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

function summarizeRss(pid: number, samples: number[], failures: string[]): RssSummary {
  if (samples.length === 0) {
    return {
      status: failures.length > 0 ? "measurement_failed" : "not_available",
      method: "sampled via ps -o rss= -p <pid>",
      pid,
      sampleCount: 0,
      peakRssBytes: null,
      p50RssBytes: null,
      p95RssBytes: null,
      maxRssBytes: null,
      failures,
    };
  }
  return {
    status: "measured",
    method: "sampled via ps -o rss= -p <pid>",
    pid,
    sampleCount: samples.length,
    peakRssBytes: maxOrNull(samples),
    p50RssBytes: percentile(samples, 50),
    p95RssBytes: percentile(samples, 95),
    maxRssBytes: maxOrNull(samples),
    failures,
  };
}

function emptyRssSummary(pid: number | null, method: string): RssSummary {
  return {
    status: "not_available",
    method,
    pid,
    sampleCount: 0,
    peakRssBytes: null,
    p50RssBytes: null,
    p95RssBytes: null,
    maxRssBytes: null,
    failures: [],
  };
}

function summarizeEventLoop(histogram: IntervalHistogram, resolutionMs: number): EventLoopSummary {
  const maxNs = Number(histogram.max);
  if (!Number.isFinite(maxNs) || maxNs <= 0) {
    return {
      status: "not_available",
      method: "node:perf_hooks monitorEventLoopDelay",
      resolutionMs,
      p50Ms: null,
      p95Ms: null,
      maxMs: null,
      meanMs: null,
    };
  }
  return {
    status: "measured",
    method: "node:perf_hooks monitorEventLoopDelay",
    resolutionMs,
    p50Ms: nsToMs(histogram.percentile(50)),
    p95Ms: nsToMs(histogram.percentile(95)),
    maxMs: nsToMs(histogram.max),
    meanMs: nsToMs(histogram.mean),
  };
}

function thresholdResultForPayload(values: number[]): string {
  if (values.length === 0) {
    return "not_available";
  }
  const p95 = percentile(values, 95);
  const max = maxOrNull(values);
  if (p95 !== null && p95 <= 256 * 1024 && max !== null && max <= 1024 * 1024) {
    return "measured_subset_pass";
  }
  return "measured_subset_fail";
}

function thresholdResultForLatency(values: number[], thresholdP95Ms: number): string {
  if (values.length === 0) {
    return "not_available";
  }
  const p95 = percentile(values, 95);
  return p95 !== null && p95 <= thresholdP95Ms ? "measured_subset_pass" : "measured_subset_fail";
}

function thresholdResultForEventLoop(summary: EventLoopSummary): string {
  if (summary.p95Ms === null || summary.maxMs === null) {
    return "not_available";
  }
  return summary.p95Ms <= 20 && summary.maxMs <= 100 ? "measured_subset_pass" : "measured_subset_fail";
}

function percentile(values: number[], pct: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.round((pct / 100) * (sorted.length - 1));
  return roundNumber(sorted[Math.min(rank, sorted.length - 1)]);
}

function maxOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  return roundNumber(Math.max(...values));
}

function nsToMs(value: number): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  return roundNumber(value / 1_000_000);
}

function roundNumber(value: number): number {
  return Number(value.toFixed(3));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

async function waitForProcessStart(child: ChildProcessWithoutNullStreams): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 250);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timer);
      reject(new Error(`bridge process exited during startup code=${code ?? "null"} signal=${signal ?? "null"}`));
    });
  });
}

function findHeaderEnd(buffer: Buffer): number | null {
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (buffer[index] === 13 && buffer[index + 1] === 10 && buffer[index + 2] === 13 && buffer[index + 3] === 10) {
      return index;
    }
  }
  return null;
}

function parseContentLength(header: string): number | null {
  for (const line of header.split("\r\n")) {
    const [name, ...rest] = line.split(":");
    if (name?.trim().toLowerCase() !== "content-length") {
      continue;
    }
    const value = Number(rest.join(":").trim());
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function repoRelative(root: string, filePath: string): string {
  return normalizePath(path.relative(root, filePath));
}

function normalizePath(value: string): string {
  return value.split(path.sep).join("/");
}

function truncateOutput(value: string): string {
  if (Buffer.byteLength(value, "utf8") <= PROCESS_OUTPUT_LIMIT_BYTES) {
    return value;
  }
  return value.slice(-PROCESS_OUTPUT_LIMIT_BYTES);
}

function asRecord(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as JsonObject;
}
