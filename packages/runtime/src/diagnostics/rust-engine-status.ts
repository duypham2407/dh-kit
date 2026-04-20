import { spawn } from "node:child_process";

export type RustCapabilityStateSummary = {
  source: "rust_bridge";
  supported: number;
  partial: number;
  bestEffort: number;
  unsupported: number;
  capabilityCount: number;
};

export type RustCapabilityProbeResult =
  | {
    ok: true;
    summary: RustCapabilityStateSummary;
  }
  | {
    ok: false;
    unavailableReason: string;
  };

export type RustParserFreshnessCondition =
  | "retained current"
  | "refreshed current"
  | "degraded partial"
  | "not current";

export type RustParserFreshnessSummary = {
  source: "rust_status";
  scope: "workspace";
  condition: RustParserFreshnessCondition;
  reason: string;
  refreshedCurrentFiles: number;
  retainedCurrentFiles: number;
  degradedPartialFiles: number;
  notCurrentFiles: number;
};

export type RustEngineStatusProbeResult = {
  ok: boolean;
  statusOutput?: string;
  freshness?: RustParserFreshnessSummary;
  unavailableReason?: string;
};

type ParsedStatusFields = {
  status?: string;
  totalFiles: number;
  indexedFiles: number;
  dirtyFiles: number;
  deletedFiles: number;
  lastError?: string;
  freshnessScope?: string;
  refreshedCurrentFiles?: number;
  retainedCurrentFiles?: number;
  degradedPartialFiles?: number;
  notCurrentFiles?: number;
  freshnessCondition?: string;
};

const STATUS_TIMEOUT_MS = 8_000;
const CAPABILITY_TIMEOUT_MS = 8_000;
const INITIALIZE_REQUEST_ID = 1;

export async function probeRustCapabilitySummary(repoRoot: string): Promise<RustCapabilityProbeResult> {
  try {
    const initializeProbe = await runRustBridgeInitialize(repoRoot);
    if (!initializeProbe.ok) {
      return {
        ok: false,
        unavailableReason: initializeProbe.error,
      };
    }

    const summary = summarizeCapabilityMatrix(initializeProbe.response);
    if (!summary.ok) {
      return {
        ok: false,
        unavailableReason: summary.error,
      };
    }

    return {
      ok: true,
      summary: summary.value,
    };
  } catch (error) {
    return {
      ok: false,
      unavailableReason: error instanceof Error ? error.message : "unknown rust capability probe failure",
    };
  }
}

export async function probeRustEngineStatus(repoRoot: string): Promise<RustEngineStatusProbeResult> {
  try {
    const run = await runRustEngineStatus(repoRoot);
    if (!run.ok) {
      return {
        ok: false,
        unavailableReason: run.error,
      };
    }

    const parsed = parseStatusOutput(run.stdout);
    const freshness = deriveFreshnessSummary(parsed);
    if (!freshness) {
      return {
        ok: true,
        statusOutput: run.stdout,
        unavailableReason: "rust status output did not include parser freshness summary fields",
      };
    }

    return {
      ok: true,
      statusOutput: run.stdout,
      freshness,
    };
  } catch (error) {
    return {
      ok: false,
      unavailableReason: error instanceof Error ? error.message : "unknown rust status probe failure",
    };
  }
}

function runRustEngineStatus(repoRoot: string): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "cargo",
      ["run", "-q", "-p", "dh-engine", "--", "status", "--workspace", repoRoot],
      {
        cwd: `${repoRoot}/rust-engine`,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, STATUS_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        error: `failed to start rust status probe: ${error.message}`,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        resolve({
          ok: false,
          error: `rust status probe timed out after ${STATUS_TIMEOUT_MS}ms`,
        });
        return;
      }

      if (code !== 0) {
        const stderrText = stderr.trim();
        resolve({
          ok: false,
          error: stderrText.length > 0
            ? `rust status probe failed (exit=${code}): ${stderrText}`
            : `rust status probe failed (exit=${code})`,
        });
        return;
      }

      resolve({ ok: true, stdout });
    });
  });
}

function runRustBridgeInitialize(repoRoot: string): Promise<{ ok: true; response: Record<string, unknown> } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const child = spawn(
      "cargo",
      ["run", "-q", "-p", "dh-engine", "--", "serve", "--workspace", repoRoot],
      {
        cwd: `${repoRoot}/rust-engine`,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    let stdoutBuffer: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr = "";
    let settled = false;

    const settle = (result: { ok: true; response: Record<string, unknown> } | { ok: false; error: string }) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (!child.killed) {
        child.kill("SIGTERM");
      }
      resolve(result);
    };

    const timer = setTimeout(() => {
      settle({
        ok: false,
        error: `rust capability probe timed out after ${CAPABILITY_TIMEOUT_MS}ms`,
      });
    }, CAPABILITY_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer | string) => {
      if (settled) {
        return;
      }

      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      stdoutBuffer = Buffer.concat([stdoutBuffer, bytes]);

      while (true) {
        const frameResult = tryReadJsonRpcFrame(stdoutBuffer);
        if (!frameResult.ok) {
          if (frameResult.error === "incomplete") {
            return;
          }
          settle({
            ok: false,
            error: `rust capability probe received invalid json-rpc frame: ${frameResult.error}`,
          });
          return;
        }

        stdoutBuffer = frameResult.remaining;
        const frame = frameResult.payload;
        const responseId = typeof frame.id === "number" ? frame.id : null;
        if (responseId !== INITIALIZE_REQUEST_ID) {
          continue;
        }

        const responseError = asRecord(frame.error);
        if (responseError) {
          const message = asString(responseError.message) ?? "unknown bridge initialize error";
          settle({
            ok: false,
            error: `rust bridge initialize failed: ${message}`,
          });
          return;
        }

        const resultRecord = asRecord(frame.result);
        if (!resultRecord) {
          settle({
            ok: false,
            error: "rust bridge initialize response did not contain a result object",
          });
          return;
        }

        settle({ ok: true, response: resultRecord });
        return;
      }
    });

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
    });

    child.on("error", (error) => {
      settle({
        ok: false,
        error: `failed to start rust capability probe: ${error.message}`,
      });
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      const stderrText = stderr.trim();
      settle({
        ok: false,
        error: stderrText.length > 0
          ? `rust capability probe failed (exit=${code}): ${stderrText}`
          : `rust capability probe failed (exit=${code})`,
      });
    });

    const initializeRequest = JSON.stringify({
      jsonrpc: "2.0",
      id: INITIALIZE_REQUEST_ID,
      method: "dh.initialize",
      params: {
        protocolVersion: "1",
        workspaceRoot: repoRoot,
        client: {
          name: "dh-doctor",
          version: "0.1.0",
        },
      },
    });
    const frame = `Content-Length: ${Buffer.byteLength(initializeRequest, "utf8")}\r\n\r\n${initializeRequest}`;
    child.stdin.write(frame, "utf8", (error) => {
      if (!error) {
        return;
      }
      settle({
        ok: false,
        error: `failed to write rust bridge initialize request: ${error.message}`,
      });
    });
  });
}

function summarizeCapabilityMatrix(
  initializeResult: Record<string, unknown>,
): { ok: true; value: RustCapabilityStateSummary } | { ok: false; error: string } {
  const capabilities = asRecord(initializeResult.capabilities);
  if (!capabilities) {
    return {
      ok: false,
      error: "rust bridge initialize response omitted capabilities",
    };
  }

  const matrix = capabilities.languageCapabilityMatrix;
  if (!Array.isArray(matrix)) {
    return {
      ok: false,
      error: "rust bridge capabilities omitted languageCapabilityMatrix",
    };
  }

  const summary: RustCapabilityStateSummary = {
    source: "rust_bridge",
    supported: 0,
    partial: 0,
    bestEffort: 0,
    unsupported: 0,
    capabilityCount: 0,
  };

  for (const rawEntry of matrix) {
    const entry = asRecord(rawEntry);
    if (!entry) {
      return {
        ok: false,
        error: "rust capability matrix entry was not an object",
      };
    }

    const state = asString(entry.state);
    if (!state) {
      return {
        ok: false,
        error: "rust capability matrix entry omitted state",
      };
    }

    if (state === "supported") {
      summary.supported += 1;
    } else if (state === "partial") {
      summary.partial += 1;
    } else if (state === "best-effort" || state === "best_effort") {
      summary.bestEffort += 1;
    } else if (state === "unsupported") {
      summary.unsupported += 1;
    } else {
      return {
        ok: false,
        error: `rust capability matrix returned unknown state '${state}'`,
      };
    }

    summary.capabilityCount += 1;
  }

  if (summary.capabilityCount === 0) {
    return {
      ok: false,
      error: "rust capability matrix returned no entries",
    };
  }

  return {
    ok: true,
    value: summary,
  };
}

function tryReadJsonRpcFrame(
  buffer: Buffer<ArrayBufferLike>,
):
  | { ok: true; payload: Record<string, unknown>; remaining: Buffer<ArrayBufferLike> }
  | { ok: false; error: "incomplete" | string } {
  const headerEnd = findHeaderEnd(buffer);
  if (headerEnd === null) {
    return { ok: false, error: "incomplete" };
  }

  const header = buffer.subarray(0, headerEnd).toString("ascii");
  const contentLength = parseContentLength(header);
  if (contentLength === null || contentLength < 0) {
    return { ok: false, error: "missing valid Content-Length header" };
  }

  const bodyStart = headerEnd + 4;
  const frameLength = bodyStart + contentLength;
  if (buffer.length < frameLength) {
    return { ok: false, error: "incomplete" };
  }

  const body = buffer.subarray(bodyStart, frameLength).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    return {
      ok: false,
      error: `invalid json payload: ${error instanceof Error ? error.message : "unknown parse failure"}`,
    };
  }

  const payload = asRecord(parsed);
  if (!payload) {
    return { ok: false, error: "json-rpc payload was not an object" };
  }

  return {
    ok: true,
    payload,
    remaining: buffer.subarray(frameLength),
  };
}

function findHeaderEnd(buffer: Buffer<ArrayBufferLike>): number | null {
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (
      buffer[index] === 13
      && buffer[index + 1] === 10
      && buffer[index + 2] === 13
      && buffer[index + 3] === 10
    ) {
      return index;
    }
  }
  return null;
}

function parseContentLength(header: string): number | null {
  const lines = header.split("\r\n");
  for (const line of lines) {
    const [name, ...rest] = line.split(":");
    if (!name || rest.length === 0) {
      continue;
    }
    if (name.trim().toLowerCase() !== "content-length") {
      continue;
    }
    const parsed = Number.parseInt(rest.join(":").trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseStatusOutput(raw: string): ParsedStatusFields {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const result: ParsedStatusFields = {
    totalFiles: 0,
    indexedFiles: 0,
    dirtyFiles: 0,
    deletedFiles: 0,
  };

  for (const line of lines) {
    const [key, ...rest] = line.split(":");
    if (!key || rest.length === 0) {
      continue;
    }
    const value = rest.join(":").trim();
    switch (key.trim()) {
      case "status":
        result.status = value;
        break;
      case "total_files":
        result.totalFiles = asNonNegativeInteger(value);
        break;
      case "indexed_files":
        result.indexedFiles = asNonNegativeInteger(value);
        break;
      case "dirty_files":
        result.dirtyFiles = asNonNegativeInteger(value);
        break;
      case "deleted_files":
        result.deletedFiles = asNonNegativeInteger(value);
        break;
      case "last_error":
        result.lastError = value;
        break;
      case "freshness_scope":
        result.freshnessScope = value;
        break;
      case "freshness_counts": {
        const counts = parseFreshnessCounts(value);
        if (typeof counts.refreshedCurrentFiles === "number") {
          result.refreshedCurrentFiles = counts.refreshedCurrentFiles;
        }
        if (typeof counts.retainedCurrentFiles === "number") {
          result.retainedCurrentFiles = counts.retainedCurrentFiles;
        }
        if (typeof counts.degradedPartialFiles === "number") {
          result.degradedPartialFiles = counts.degradedPartialFiles;
        }
        if (typeof counts.notCurrentFiles === "number") {
          result.notCurrentFiles = counts.notCurrentFiles;
        }
        break;
      }
      case "freshness_condition":
        result.freshnessCondition = value;
        break;
      default:
        break;
    }
  }

  return result;
}

function deriveFreshnessSummary(fields: ParsedStatusFields): RustParserFreshnessSummary | null {
  if (fields.freshnessScope !== "workspace") {
    return null;
  }

  const refreshedCurrentFiles = fields.refreshedCurrentFiles;
  const retainedCurrentFiles = fields.retainedCurrentFiles;
  const degradedPartialFiles = fields.degradedPartialFiles;
  const notCurrentFiles = fields.notCurrentFiles;

  if (
    refreshedCurrentFiles === undefined
    || retainedCurrentFiles === undefined
    || degradedPartialFiles === undefined
    || notCurrentFiles === undefined
  ) {
    return null;
  }

  const condition = mapRustFreshnessCondition(fields.freshnessCondition);
  if (!condition) {
    return null;
  }

  const hasFatalError = Boolean(fields.lastError && fields.lastError !== "<none>");
  const reason = hasFatalError
    ? `Rust status reported last_error: ${fields.lastError}`
    : condition === "not current"
      ? "Rust parser freshness status is not current for the workspace"
      : condition === "degraded partial"
        ? "Rust parser freshness status is partially degraded for the workspace"
        : condition === "refreshed current"
          ? "Rust parser freshness status indicates newly refreshed current facts"
          : "Rust parser freshness status indicates retained current facts";

  return {
    source: "rust_status",
    scope: "workspace",
    condition,
    reason,
    refreshedCurrentFiles,
    retainedCurrentFiles,
    degradedPartialFiles,
    notCurrentFiles,
  };
}

function asNonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
    return 0;
  }
  return Math.max(parsed, 0);
}

function parseFreshnessCounts(value: string): {
  refreshedCurrentFiles?: number;
  retainedCurrentFiles?: number;
  degradedPartialFiles?: number;
  notCurrentFiles?: number;
} {
  const pairs = value.split(/\s+/).filter((token) => token.includes("="));
  const result: {
    refreshedCurrentFiles?: number;
    retainedCurrentFiles?: number;
    degradedPartialFiles?: number;
    notCurrentFiles?: number;
  } = {};

  for (const pair of pairs) {
    const [rawKey, rawValue] = pair.split("=");
    if (!rawKey || rawValue === undefined) {
      continue;
    }
    const parsedValue = asNonNegativeInteger(rawValue);
    if (rawKey === "refreshed_current") {
      result.refreshedCurrentFiles = parsedValue;
    } else if (rawKey === "retained_current") {
      result.retainedCurrentFiles = parsedValue;
    } else if (rawKey === "degraded_partial") {
      result.degradedPartialFiles = parsedValue;
    } else if (rawKey === "not_current") {
      result.notCurrentFiles = parsedValue;
    }
  }

  return result;
}

function mapRustFreshnessCondition(value: string | undefined): RustParserFreshnessCondition | null {
  if (value === "retained_current") {
    return "retained current";
  }
  if (value === "refreshed_current") {
    return "refreshed current";
  }
  if (value === "degraded_partial") {
    return "degraded partial";
  }
  if (value === "not_current") {
    return "not current";
  }
  return null;
}
