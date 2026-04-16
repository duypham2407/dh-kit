import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

export type BridgeFailureCode =
  | "BRIDGE_STARTUP_FAILED"
  | "BRIDGE_UNREACHABLE"
  | "BRIDGE_TIMEOUT"
  | "METHOD_NOT_SUPPORTED"
  | "INVALID_REQUEST"
  | "REQUEST_FAILED"
  | "EMPTY_RESULT_TREATED_AS_FAILURE";

export type BridgeFailurePhase = "startup" | "request";

export type BridgeSearchItem = {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  reason: string;
  score: number;
};

export type BridgeAskQueryClass =
  | "search_file_discovery"
  | "graph_definition"
  | "graph_relationship_usage"
  | "graph_relationship_dependencies"
  | "graph_relationship_dependents";

export type BridgeAskRequest = {
  query: string;
  repoRoot: string;
  queryClass: BridgeAskQueryClass;
  limit?: number;
  symbol?: string;
  targetPath?: string;
};

export type BridgeAskResult = {
  method: "query.search" | "query.definition" | "query.relationship";
  requestId: number;
  engineName: string;
  engineVersion: string;
  protocolVersion: string;
  capabilities: {
    protocolVersion: string;
    methods: readonly ["dh.initialize", "query.search", "query.definition", "query.relationship"];
    queryRelationship: {
      supportedRelations: readonly ["usage", "dependencies", "dependents"];
    };
  };
  evidenceType: "search_match" | "definition" | "usage" | "dependencies" | "dependents";
  items: BridgeSearchItem[];
};

export type BridgeClient = {
  runAskQuery: (input: BridgeAskRequest) => Promise<BridgeAskResult>;
  close: () => Promise<void>;
};

export class DhBridgeError extends Error {
  readonly code: BridgeFailureCode;
  readonly phase: BridgeFailurePhase;
  readonly retryable: boolean;

  constructor(input: {
    code: BridgeFailureCode;
    phase: BridgeFailurePhase;
    message: string;
    retryable?: boolean;
  }) {
    super(input.message);
    this.name = "DhBridgeError";
    this.code = input.code;
    this.phase = input.phase;
    this.retryable = input.retryable ?? false;
  }
}

type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
};

type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

const DEFAULT_STARTUP_TIMEOUT_MS = 10_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const V2_PROTOCOL_VERSION = "1";
const V2_METHODS = ["dh.initialize", "query.search", "query.definition", "query.relationship"] as const;
const V2_RELATIONS = ["usage", "dependencies", "dependents"] as const;

export function createDhJsonRpcStdioClient(
  repoRoot: string,
  options?: {
    startupTimeoutMs?: number;
    requestTimeoutMs?: number;
    spawnChild?: (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  },
): BridgeClient {
  return new DhJsonRpcStdioClient(repoRoot, options);
}

class DhJsonRpcStdioClient implements BridgeClient {
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly spawnChild: (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
  private readonly repoRoot: string;

  private child?: ChildProcessWithoutNullStreams;
  private closed = false;
  private nextRequestId = 1;
  private readBuffer = Buffer.alloc(0);
  private pending = new Map<number, {
    resolve: (value: JsonRpcResponse) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
    phase: BridgeFailurePhase;
  }>();

  private initialized = false;
  private engineName = "dh-engine";
  private engineVersion = "unknown";
  private protocolVersion = V2_PROTOCOL_VERSION;
  private capabilities: BridgeAskResult["capabilities"] = {
    protocolVersion: V2_PROTOCOL_VERSION,
    methods: V2_METHODS,
    queryRelationship: {
      supportedRelations: V2_RELATIONS,
    },
  };

  constructor(
    repoRoot: string,
    options?: {
      startupTimeoutMs?: number;
      requestTimeoutMs?: number;
      spawnChild?: (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams;
    },
  ) {
    this.repoRoot = repoRoot;
    this.startupTimeoutMs = options?.startupTimeoutMs ?? DEFAULT_STARTUP_TIMEOUT_MS;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.spawnChild = options?.spawnChild ?? spawn;
  }

  async runAskQuery(input: BridgeAskRequest): Promise<BridgeAskResult> {
    await this.ensureInitialized(input.repoRoot);

    const requestId = this.nextRequestId++;
    const call = this.buildAskCall(input, requestId);
    const response = await this.request(
      {
        jsonrpc: "2.0",
        id: requestId,
        method: call.method,
        params: call.params,
      },
      "request",
      this.requestTimeoutMs,
    );

    if ("error" in response) {
      throw this.mapRpcError(response.error.code, response.error.message, "request");
    }

    const resultObj = asRecord(response.result);
    const resultItems = Array.isArray(resultObj.items) ? resultObj.items : [];
    const items: BridgeSearchItem[] = resultItems
      .map((raw) => toBridgeSearchItem(raw))
      .filter((item): item is BridgeSearchItem => item !== null);

    if (items.length === 0) {
      throw new DhBridgeError({
        code: "EMPTY_RESULT_TREATED_AS_FAILURE",
        phase: "request",
        message: `Rust bridge returned an empty result set for '${call.method}'.`,
      });
    }

    return {
      method: call.method,
      requestId,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      evidenceType: call.evidenceType,
      items,
    };
  }

  private buildAskCall(input: BridgeAskRequest, requestId: number): {
    method: "query.search" | "query.definition" | "query.relationship";
    params: Record<string, unknown>;
    evidenceType: "search_match" | "definition" | "usage" | "dependencies" | "dependents";
    requestId: number;
  } {
    const limit = input.limit ?? 5;

    switch (input.queryClass) {
      case "search_file_discovery":
        return {
          method: "query.search",
          params: {
            query: input.query,
            workspaceRoot: input.repoRoot,
            limit,
          },
          evidenceType: "search_match",
          requestId,
        };
      case "graph_definition":
        return {
          method: "query.definition",
          params: {
            symbol: input.symbol ?? input.query,
            workspaceRoot: input.repoRoot,
            limit,
          },
          evidenceType: "definition",
          requestId,
        };
      case "graph_relationship_usage":
        return {
          method: "query.relationship",
          params: {
            relation: "usage",
            symbol: input.symbol ?? input.query,
            workspaceRoot: input.repoRoot,
            limit,
          },
          evidenceType: "usage",
          requestId,
        };
      case "graph_relationship_dependencies":
        return {
          method: "query.relationship",
          params: {
            relation: "dependencies",
            filePath: input.targetPath ?? input.query,
            workspaceRoot: input.repoRoot,
            limit,
          },
          evidenceType: "dependencies",
          requestId,
        };
      case "graph_relationship_dependents":
        return {
          method: "query.relationship",
          params: {
            relation: "dependents",
            target: input.targetPath ?? input.query,
            workspaceRoot: input.repoRoot,
            limit,
          },
          evidenceType: "dependents",
          requestId,
        };
      default: {
        const _exhaustive: never = input.queryClass;
        throw new DhBridgeError({
          code: "INVALID_REQUEST",
          phase: "request",
          message: `Unsupported query class for bridge contract v2: ${String(_exhaustive)}`,
        });
      }
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    const child = this.child;
    this.child = undefined;

    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(new DhBridgeError({
        code: "BRIDGE_UNREACHABLE",
        phase: entry.phase,
        message: `Bridge connection closed while request ${id} was pending.`,
      }));
      this.pending.delete(id);
    }

    if (!child) {
      return;
    }

    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }

  private async ensureInitialized(repoRoot: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    const rustEngineRoot = resolveRustEngineRoot(repoRoot);
    const child = this.spawnChild(
      "cargo",
      ["run", "-q", "-p", "dh-engine", "--", "serve", "--workspace", repoRoot],
      {
        cwd: rustEngineRoot,
        stdio: "pipe",
      },
    );

    this.child = child;

    child.stderr.on("data", (chunk: Buffer | string) => {
      const text = Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk;
      if (text.trim().length > 0) {
        process.stderr.write(`[dh-bridge] ${text}`);
      }
    });

    child.on("error", (err) => {
      this.failAllPending((phase) => {
        return new DhBridgeError({
          code: phase === "startup" ? "BRIDGE_STARTUP_FAILED" : "BRIDGE_UNREACHABLE",
          phase,
          message: `Failed to start rust bridge process: ${err.message}`,
        });
      });
    });

    child.on("exit", (code, signal) => {
      if (!this.closed) {
        this.failAllPending((phase) => {
          return new DhBridgeError({
            code: phase === "startup" ? "BRIDGE_STARTUP_FAILED" : "BRIDGE_UNREACHABLE",
            phase,
            message: `Rust bridge process exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
          });
        });
      }
    });

    child.stdout.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      this.readBuffer = Buffer.concat([this.readBuffer, bytes]);
      this.drainFrames();
    });

    const initializeResponse = await this.request(
      {
        jsonrpc: "2.0",
        id: this.nextRequestId++,
        method: "dh.initialize",
        params: {
          protocolVersion: "1",
          workspaceRoot: repoRoot,
          client: {
            name: "dh-cli",
            version: "0.1.0",
          },
        },
      },
      "startup",
      this.startupTimeoutMs,
    );

    if ("error" in initializeResponse) {
      throw this.mapRpcError(initializeResponse.error.code, initializeResponse.error.message, "startup");
    }

    const resultObj = asRecord(initializeResponse.result);
    this.engineName = asString(resultObj.serverName) ?? "dh-engine";
    this.engineVersion = asString(resultObj.serverVersion) ?? "unknown";
    const protocolVersion = asString(resultObj.protocolVersion);
    if (protocolVersion !== V2_PROTOCOL_VERSION) {
      throw new DhBridgeError({
        code: "INVALID_REQUEST",
        phase: "startup",
        message: `Bridge initialize returned unsupported protocolVersion '${protocolVersion ?? "missing"}'.`,
      });
    }

    const capabilities = parseV2Capabilities(resultObj.capabilities);
    if (!capabilities) {
      throw new DhBridgeError({
        code: "INVALID_REQUEST",
        phase: "startup",
        message: "Bridge initialize did not advertise required V2 capabilities.",
      });
    }

    this.protocolVersion = protocolVersion;
    this.capabilities = capabilities;
    this.initialized = true;
  }

  private request(
    message: JsonRpcRequest,
    phase: BridgeFailurePhase,
    timeoutMs: number,
  ): Promise<JsonRpcResponse> {
    if (this.closed) {
      return Promise.reject(new DhBridgeError({
        code: "BRIDGE_UNREACHABLE",
        phase,
        message: "Bridge client is already closed.",
      }));
    }

    const child = this.child;
    if (!child) {
      return Promise.reject(new DhBridgeError({
        code: "BRIDGE_UNREACHABLE",
        phase,
        message: "Bridge process is not available.",
      }));
    }

    return new Promise<JsonRpcResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(message.id);
        reject(new DhBridgeError({
          code: "BRIDGE_TIMEOUT",
          phase,
          message: `Bridge request timed out after ${timeoutMs}ms for method '${message.method}'.`,
          retryable: true,
        }));
      }, timeoutMs);

      this.pending.set(message.id, { resolve, reject, timer, phase });

      const body = JSON.stringify(message);
      const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;

      child.stdin.write(frame, "utf8", (err) => {
        if (!err) {
          return;
        }
        const entry = this.pending.get(message.id);
        if (!entry) {
          return;
        }
        clearTimeout(entry.timer);
        this.pending.delete(message.id);
        entry.reject(new DhBridgeError({
          code: "BRIDGE_UNREACHABLE",
          phase,
          message: `Failed to send bridge request: ${err.message}`,
        }));
      });
    });
  }

  private drainFrames(): void {
    while (true) {
      const headerEnd = findHeaderEnd(this.readBuffer);
      if (headerEnd === null) {
        return;
      }

      const header = this.readBuffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(header);
      if (contentLength === null || contentLength < 0) {
        this.failAllPending((phase) => {
          return new DhBridgeError({
            code: "INVALID_REQUEST",
            phase,
            message: "Bridge response is missing a valid Content-Length header.",
          });
        });
        this.readBuffer = Buffer.alloc(0);
        return;
      }

      const bodyStart = headerEnd + 4;
      const frameLength = bodyStart + contentLength;
      if (this.readBuffer.length < frameLength) {
        return;
      }

      const body = this.readBuffer.subarray(bodyStart, frameLength).toString("utf8");
      this.readBuffer = this.readBuffer.subarray(frameLength);

      let parsed: JsonRpcResponse;
      try {
        parsed = JSON.parse(body) as JsonRpcResponse;
      } catch (error) {
        this.failAllPending((phase) => {
          return new DhBridgeError({
            code: "INVALID_REQUEST",
            phase,
            message: `Bridge response payload is not valid JSON: ${(error as Error).message}`,
          });
        });
        return;
      }

      const requestId = typeof parsed.id === "number" ? parsed.id : null;
      if (requestId === null) {
        continue;
      }

      const entry = this.pending.get(requestId);
      if (!entry) {
        continue;
      }

      clearTimeout(entry.timer);
      this.pending.delete(requestId);
      entry.resolve(parsed);
    }
  }

  private mapRpcError(code: number, message: string, phase: BridgeFailurePhase): DhBridgeError {
    if (code === -32601) {
      return new DhBridgeError({
        code: "METHOD_NOT_SUPPORTED",
        phase,
        message,
      });
    }
    if (code === -32600 || code === -32602) {
      return new DhBridgeError({
        code: "INVALID_REQUEST",
        phase,
        message,
      });
    }
    return new DhBridgeError({
      code: "REQUEST_FAILED",
      phase,
      message,
    });
  }

  private failAllPending(createError: (phase: BridgeFailurePhase) => Error): void {
    for (const [id, entry] of this.pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(createError(entry.phase));
      this.pending.delete(id);
    }
  }
}

function findHeaderEnd(buffer: Buffer): number | null {
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

function toBridgeSearchItem(raw: unknown): BridgeSearchItem | null {
  const value = asRecord(raw);
  const filePath = asString(value.filePath) ?? asString(value.file_path);
  const lineStart = asNumber(value.lineStart) ?? asNumber(value.line_start);
  const lineEnd = asNumber(value.lineEnd) ?? asNumber(value.line_end);
  const snippet = asString(value.snippet);
  const reason = asString(value.reason) ?? "rust query match";
  const score = asNumber(value.score) ?? 0.5;

  if (!filePath || lineStart === null || lineEnd === null || !snippet) {
    return null;
  }

  return {
    filePath,
    lineStart,
    lineEnd,
    snippet,
    reason,
    score,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseV2Capabilities(value: unknown): BridgeAskResult["capabilities"] | null {
  const capabilities = asRecord(value);
  const protocolVersion = asString(capabilities.protocolVersion);
  if (protocolVersion !== V2_PROTOCOL_VERSION) {
    return null;
  }

  const methods = asStringArray(capabilities.methods);
  if (!methods || methods.length !== V2_METHODS.length || !V2_METHODS.every((method) => methods.includes(method))) {
    return null;
  }

  const relationship = asRecord(capabilities.queryRelationship);
  const supportedRelations = asStringArray(relationship.supportedRelations);
  if (!supportedRelations || supportedRelations.length !== V2_RELATIONS.length || !V2_RELATIONS.every((relation) => supportedRelations.includes(relation))) {
    return null;
  }

  return {
    protocolVersion,
    methods: V2_METHODS,
    queryRelationship: {
      supportedRelations: V2_RELATIONS,
    },
  };
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

function resolveRustEngineRoot(repoRoot: string): string {
  const fromRepoRoot = path.join(repoRoot, "rust-engine");
  if (fs.existsSync(fromRepoRoot)) {
    return fromRepoRoot;
  }

  const fromSourceLayout = fileURLToPath(new URL("../../../../rust-engine", import.meta.url));
  if (fs.existsSync(fromSourceLayout)) {
    return fromSourceLayout;
  }

  return fromRepoRoot;
}
