import { spawn, type ChildProcessWithoutNullStreams, type SpawnOptionsWithoutStdio } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_BRIDGE_MAX_FRAME_BYTES,
  decodeRpcBody,
  encodeRpcFrame,
  findFrameHeaderEnd,
  JSON_RPC_CODEC,
  MIN_BRIDGE_MAX_FRAME_BYTES,
  MSGPACK_RPC_CODEC,
  normalizeBridgeCodecModeOverride,
  parseFrameHeaders,
  validateBridgeMaxFrameBytes,
  type BridgeRpcCodec,
} from "./stdio-codec.js";

export type BridgeFailureCode =
  | "BRIDGE_STARTUP_FAILED"
  | "BRIDGE_UNREACHABLE"
  | "BRIDGE_TIMEOUT"
  | "METHOD_NOT_SUPPORTED"
  | "INVALID_REQUEST"
  | "ACCESS_DENIED"
  | "NOT_FOUND"
  | "TIMEOUT"
  | "EXECUTION_FAILED"
  | "RUNTIME_UNAVAILABLE"
  | "BINARY_FILE_UNSUPPORTED"
  | "BRIDGE_CODEC_UNSUPPORTED"
  | "BRIDGE_CODEC_DECODE_FAILED"
  | "BRIDGE_FRAME_TOO_LARGE"
  | "BRIDGE_CODEC_NEGOTIATION_FAILED"
  | "CAPABILITY_UNSUPPORTED"
  | "REQUEST_FAILED";

export type BridgeFailurePhase = "startup" | "request";

export type BridgeSearchItem = {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  snippet: string;
  reason: string;
  score: number;
};

export type BridgeAnswerState = "grounded" | "partial" | "insufficient" | "unsupported";

export type BridgeEvidenceConfidence = "grounded" | "partial";

export type BridgeEvidenceEntry = {
  kind: string;
  filePath: string;
  reason: string;
  source: string;
  confidence: BridgeEvidenceConfidence;
  symbol?: string;
  lineStart?: number;
  lineEnd?: number;
  snippet?: string;
};

export type BridgeEvidencePacket = {
  answerState: BridgeAnswerState;
  questionClass: string;
  subject: string;
  summary: string;
  conclusion: string;
  evidence: BridgeEvidenceEntry[];
  gaps: string[];
  bounds: {
    hopCount?: number;
    nodeLimit?: number;
    traversalScope?: string;
    stopReason?: string;
  };
};

export type BridgeLanguageCapabilityState = "supported" | "partial" | "best-effort" | "unsupported";

export type BridgeLanguageCapabilityLanguageSummary = {
  language: string;
  state: BridgeLanguageCapabilityState;
  reason: string;
  parserBacked: boolean;
};

export type BridgeLanguageCapabilitySummary = {
  capability: string;
  weakestState: BridgeLanguageCapabilityState;
  languages: BridgeLanguageCapabilityLanguageSummary[];
  retrievalOnly: boolean;
};

export type BridgeLanguageCapabilityEntry = {
  language: string;
  capability: string;
  state: BridgeLanguageCapabilityState;
  reason: string;
  parserBacked: boolean;
};

export type BridgeTransportSelectedMode = "json" | "msgpack-rpc-v1" | "json-fallback";

export type BridgeTransportSnapshot = {
  selectedCodec: BridgeRpcCodec;
  selectedMode: BridgeTransportSelectedMode;
  fallbackReason?: string;
  maxFrameBytes: number;
  codecVersion: number;
};

export type BridgeInitializeCapabilities = {
  protocolVersion: string;
  methods: readonly string[];
  queryRelationship: {
    supportedRelations: readonly string[];
  };
  languageCapabilityMatrix: BridgeLanguageCapabilityEntry[];
  transport?: BridgeTransportSnapshot;
};

export type BridgeInitializeSnapshot = {
  engineName: string;
  engineVersion: string;
  protocolVersion: string;
  capabilities: BridgeInitializeCapabilities;
  transport: BridgeTransportSnapshot;
};

export type BridgeAskQueryClass =
  | "search_file_discovery"
  | "graph_definition"
  | "graph_relationship_usage"
  | "graph_relationship_dependencies"
  | "graph_relationship_dependents"
  | "graph_call_hierarchy"
  | "graph_entry_points"
  | "graph_build_evidence";

export type BridgeBuildEvidenceIntent = "explain";

export type BridgeBuildEvidenceFreshness = "indexed" | "requireFresh" | "require_fresh";

export type BridgeBuildEvidenceBudget = {
  maxFiles?: number;
  maxSymbols?: number;
  maxSnippets?: number;
};

export type BridgeDelegatedSessionQueryClass = BridgeAskQueryClass;

export type BridgeSessionDelegatedMethod =
  | "query.search"
  | "query.definition"
  | "query.relationship"
  | "query.buildEvidence"
  | "query.callHierarchy"
  | "query.entryPoints";

export type BridgeSessionRunCommandRequest = {
  query: string;
  repoRoot: string;
  queryClass: BridgeDelegatedSessionQueryClass;
  limit?: number;
  maxDepth?: number;
  symbol?: string;
  targetPath?: string;
  intent?: BridgeBuildEvidenceIntent;
  targets?: string[];
  budget?: BridgeBuildEvidenceBudget;
  freshness?: BridgeBuildEvidenceFreshness;
};

export type BridgeDirectQueryMethod =
  | "query.search"
  | "query.definition"
  | "query.relationship"
  | "query.buildEvidence"
  | "query.callHierarchy"
  | "query.entryPoints";

type BridgeQueryMethod = BridgeDirectQueryMethod;

export type BridgeAskRequest = {
  query: string;
  repoRoot: string;
  queryClass: BridgeAskQueryClass;
  limit?: number;
  maxDepth?: number;
  symbol?: string;
  targetPath?: string;
  intent?: BridgeBuildEvidenceIntent;
  targets?: string[];
  budget?: BridgeBuildEvidenceBudget;
  freshness?: BridgeBuildEvidenceFreshness;
};

export type BridgeAskResult = {
  method: BridgeQueryMethod;
  seamMethod?: "direct.query" | "session.runCommand";
  delegatedMethod?: BridgeSessionDelegatedMethod;
  requestId: number;
  engineName: string;
  engineVersion: string;
  protocolVersion: string;
  capabilities: BridgeInitializeCapabilities;
  answerState: BridgeAnswerState;
  questionClass: string;
  items: BridgeSearchItem[];
  evidence: BridgeEvidencePacket | null;
  languageCapabilitySummary: BridgeLanguageCapabilitySummary | null;
};

type BridgeDirectQueryClass = BridgeDelegatedSessionQueryClass;

function isDelegatedSessionQueryClass(
  queryClass: BridgeAskQueryClass,
): queryClass is BridgeDelegatedSessionQueryClass {
  return queryClass === "search_file_discovery"
    || queryClass === "graph_definition"
    || queryClass === "graph_relationship_usage"
    || queryClass === "graph_relationship_dependencies"
    || queryClass === "graph_relationship_dependents"
    || queryClass === "graph_call_hierarchy"
    || queryClass === "graph_entry_points"
    || queryClass === "graph_build_evidence";
}

type BridgeAskResultDerivedFields = Pick<
  BridgeAskResult,
  | "answerState"
  | "questionClass"
  | "items"
  | "evidence"
  | "languageCapabilitySummary"
>;

export type BridgeClient = {
  runAskQuery: (input: BridgeAskRequest) => Promise<BridgeAskResult>;
  runSessionCommand?: (input: BridgeSessionRunCommandRequest) => Promise<BridgeAskResult>;
  getInitializeSnapshot?: () => Promise<BridgeInitializeSnapshot>;
  getRuntimePing?: () => Promise<{ ok: boolean; workerState: string; healthState: string; phase: string; }>;
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
const V2_METHODS = ["dh.initialize", "query.search", "query.definition", "query.relationship", "query.buildEvidence", "query.callHierarchy", "query.entryPoints", "runtime.ping"] as const;
const V2_RELATIONS = ["usage", "dependencies", "dependents"] as const;
const SUPPORTED_BRIDGE_CODECS = [JSON_RPC_CODEC, MSGPACK_RPC_CODEC] as const;

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
  private activeCodec: BridgeRpcCodec = JSON_RPC_CODEC;
  private negotiatedCodec: BridgeRpcCodec = JSON_RPC_CODEC;
  private selectedMode: BridgeTransportSelectedMode = "json";
  private fallbackReason: string | undefined;
  private maxFrameBytes = DEFAULT_BRIDGE_MAX_FRAME_BYTES;
  private codecVersion = 1;
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
    languageCapabilityMatrix: [],
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

    if (!isDelegatedSessionQueryClass(input.queryClass)) {
      throw new DhBridgeError({
        code: "CAPABILITY_UNSUPPORTED",
        phase: "request",
        message: `Direct bridge ask does not support query class '${input.queryClass}' in this bounded path.`,
      });
    }

    const requestId = this.nextRequestId++;
    const call = this.buildAskCall({
      query: input.query,
      repoRoot: input.repoRoot,
      queryClass: input.queryClass,
      limit: input.limit,
      maxDepth: input.maxDepth,
      symbol: input.symbol,
      targetPath: input.targetPath,
      intent: input.intent,
      targets: input.targets,
      budget: input.budget,
      freshness: input.freshness,
    }, requestId);
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
      throw this.mapRpcError(response.error.code, response.error.message, "request", response.error.data);
    }

    const parsed = this.parseBridgeAskResult({
      result: response.result,
      method: call.method,
      params: call.params,
    });

    return {
      method: call.method,
      requestId,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      ...parsed,
    };
  }

  async runSessionCommand(input: BridgeSessionRunCommandRequest): Promise<BridgeAskResult> {
    await this.ensureInitialized(input.repoRoot);

    const requestId = this.nextRequestId++;
    const call = this.buildAskCall(input, requestId);
    const response = await this.request(
      {
        jsonrpc: "2.0",
        id: requestId,
        method: "session.runCommand",
        params: {
          query: {
            method: call.method,
            params: call.params,
          },
        },
      },
      "request",
      this.requestTimeoutMs,
    );

    if ("error" in response) {
      throw this.mapRpcError(response.error.code, response.error.message, "request", response.error.data);
    }

    const parsed = this.parseBridgeAskResult({
      result: response.result,
      method: call.method,
      params: call.params,
    });

    return {
      method: call.method,
      seamMethod: "session.runCommand",
      delegatedMethod: call.method,
      requestId,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      ...parsed,
    };
  }

  private parseBridgeAskResult(input: {
    result: unknown;
    method: BridgeDirectQueryMethod;
    params: Record<string, unknown>;
  }): BridgeAskResultDerivedFields {
    const resultObj = asRecord(input.result);
    const answerState = asBridgeAnswerState(resultObj.answerState);
    const questionClass = asString(resultObj.questionClass);
    const evidence = parseBridgeEvidencePacket(resultObj.evidence);
    const languageCapabilitySummary = parseBridgeLanguageCapabilitySummary(resultObj.languageCapabilitySummary);

    const resolvedAnswerState = answerState ?? evidence?.answerState ?? null;
    if (!resolvedAnswerState) {
      throw new DhBridgeError({
        code: "INVALID_REQUEST",
        phase: "request",
        message: `Rust bridge response for '${input.method}' is missing answerState.`,
      });
    }

    const resolvedQuestionClass = questionClass
      ?? evidence?.questionClass
      ?? inferQuestionClassFromCall({ method: input.method, params: input.params });

    const resultItems = Array.isArray(resultObj.items) ? resultObj.items : [];
    const items: BridgeSearchItem[] = resultItems
      .map((raw) => toBridgeSearchItem(raw))
      .filter((item): item is BridgeSearchItem => item !== null);

    return {
      answerState: resolvedAnswerState,
      questionClass: resolvedQuestionClass,
      items,
      evidence,
      languageCapabilitySummary,
    };
  }

  async getInitializeSnapshot(): Promise<BridgeInitializeSnapshot> {
    await this.ensureInitialized(this.repoRoot);
    return {
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      transport: this.transportSnapshot(),
    };
  }

  async getRuntimePing(): Promise<{ ok: boolean; workerState: string; healthState: string; phase: string; }> {
    await this.ensureInitialized(this.repoRoot);

    const response = await this.request(
      {
        jsonrpc: "2.0",
        id: this.nextRequestId++,
        method: "runtime.ping",
      },
      "request",
      this.requestTimeoutMs,
    );

    if ("error" in response) {
      throw this.mapRpcError(response.error.code, response.error.message, "request", response.error.data);
    }

    const resultObj = asRecord(response.result);
    return {
      ok: Boolean(resultObj.ok),
      workerState: String(resultObj.workerState ?? "unknown"),
      healthState: String(resultObj.healthState ?? "unknown"),
      phase: String(resultObj.phase ?? "unknown"),
    };
  }

  private buildAskCall(input: {
    query: string;
    repoRoot: string;
    queryClass: BridgeDirectQueryClass;
    limit?: number;
    maxDepth?: number;
    symbol?: string;
    targetPath?: string;
    intent?: BridgeBuildEvidenceIntent;
    targets?: string[];
    budget?: BridgeBuildEvidenceBudget;
    freshness?: BridgeBuildEvidenceFreshness;
  }, requestId: number): {
    method: BridgeDirectQueryMethod;
    params: Record<string, unknown>;
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
            mode: "file_path",
            limit,
          },
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
          requestId,
        };
      case "graph_call_hierarchy":
        return {
          method: "query.callHierarchy",
          params: {
            symbol: input.symbol ?? input.query,
            workspaceRoot: input.repoRoot,
            filePath: input.targetPath,
            limit,
            maxDepth: input.maxDepth ?? 3,
          },
          requestId,
        };
      case "graph_entry_points":
        return {
          method: "query.entryPoints",
          params: {
            symbol: input.symbol ?? input.query,
            workspaceRoot: input.repoRoot,
            filePath: input.targetPath,
            limit,
            maxDepth: input.maxDepth ?? 3,
          },
          requestId,
        };
      case "graph_build_evidence": {
        const params: Record<string, unknown> = {
          query: input.query,
          workspaceRoot: input.repoRoot,
          intent: input.intent ?? "explain",
          targets: input.targets ?? [],
          budget: input.budget ?? boundedBuildEvidenceBudgetFromLimit(input.limit),
          freshness: input.freshness ?? "indexed",
        };
        return {
          method: "query.buildEvidence",
          params,
          requestId,
        };
      }
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
          transport: this.initializeTransportParams(),
        },
      },
      "startup",
      this.startupTimeoutMs,
    );

    if ("error" in initializeResponse) {
      throw this.mapRpcError(initializeResponse.error.code, initializeResponse.error.message, "startup", initializeResponse.error.data);
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
    this.applyNegotiatedTransport(resultObj.transport, capabilities.transport);
    this.initialized = true;
  }

  private initializeTransportParams(): Record<string, unknown> {
    const override = normalizeBridgeCodecModeOverride(process.env.DH_BRIDGE_CODEC);
    const supportedCodecs = override === "json" ? [JSON_RPC_CODEC] : [...SUPPORTED_BRIDGE_CODECS];
    return {
      supportedCodecs,
      preferredCodec: override === "json" ? JSON_RPC_CODEC : MSGPACK_RPC_CODEC,
      maxFrameBytes: this.maxFrameBytes,
      binaryBridge: {
        enabled: override !== "json",
        minPayloadBytes: 0,
      },
      codecOverride: override,
    };
  }

  private applyNegotiatedTransport(resultTransport: unknown, capabilitiesTransport: BridgeTransportSnapshot | undefined): void {
    const transport = asRecord(resultTransport);
    const selectedCodec = asBridgeRpcCodec(transport.selectedCodec) ?? capabilitiesTransport?.selectedCodec ?? JSON_RPC_CODEC;
    const fallbackReason = asString(transport.fallbackReason) ?? capabilitiesTransport?.fallbackReason;
    const maxFrameBytes = asNumber(transport.maxFrameBytes) ?? capabilitiesTransport?.maxFrameBytes ?? DEFAULT_BRIDGE_MAX_FRAME_BYTES;
    const codecVersion = asNumber(transport.codecVersion) ?? capabilitiesTransport?.codecVersion ?? 1;
    const override = normalizeBridgeCodecModeOverride(process.env.DH_BRIDGE_CODEC);

    try {
      validateBridgeMaxFrameBytes(maxFrameBytes);
    } catch (error) {
      throw new DhBridgeError({
        code: "BRIDGE_CODEC_NEGOTIATION_FAILED",
        phase: "startup",
        message: `Bridge selected invalid maxFrameBytes: ${(error as Error).message}`,
      });
    }

    if (override === "msgpack" && selectedCodec !== MSGPACK_RPC_CODEC) {
      throw new DhBridgeError({
        code: "BRIDGE_CODEC_NEGOTIATION_FAILED",
        phase: "startup",
        message: `DH_BRIDGE_CODEC=msgpack required ${MSGPACK_RPC_CODEC}, but bridge selected ${selectedCodec}.`,
      });
    }

    if (selectedCodec === MSGPACK_RPC_CODEC && codecVersion !== 1) {
      throw new DhBridgeError({
        code: "BRIDGE_CODEC_UNSUPPORTED",
        phase: "startup",
        message: `Bridge selected unsupported MessagePack codecVersion '${codecVersion}'.`,
      });
    }

    this.negotiatedCodec = selectedCodec;
    this.activeCodec = selectedCodec;
    this.maxFrameBytes = maxFrameBytes;
    this.codecVersion = codecVersion;
    this.fallbackReason = fallbackReason;
    this.selectedMode = selectedCodec === MSGPACK_RPC_CODEC ? "msgpack-rpc-v1" : fallbackReason ? "json-fallback" : "json";

    this.capabilities = {
      ...this.capabilities,
      transport: this.transportSnapshot(),
    };

    process.stderr.write(`[dh-bridge] selected codec: ${this.selectedMode}${fallbackReason ? ` (${fallbackReason})` : ""}\n`);
  }

  private transportSnapshot(): BridgeTransportSnapshot {
    return {
      selectedCodec: this.negotiatedCodec,
      selectedMode: this.selectedMode,
      fallbackReason: this.fallbackReason,
      maxFrameBytes: this.maxFrameBytes,
      codecVersion: this.codecVersion,
    };
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

      let frame: Buffer;
      try {
        frame = encodeRpcFrame(this.activeCodec, message, this.maxFrameBytes);
      } catch (error) {
        this.pending.delete(message.id);
        clearTimeout(timer);
        reject(new DhBridgeError({
          code: "BRIDGE_FRAME_TOO_LARGE",
          phase,
          message: `Failed to encode bridge request '${message.method}': ${(error as Error).message}`,
        }));
        return;
      }

      child.stdin.write(frame, (err) => {
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
      const headerEnd = findFrameHeaderEnd(this.readBuffer);
      if (headerEnd === null) {
        return;
      }

      const header = this.readBuffer.subarray(0, headerEnd).toString("ascii");
      const { contentLength, malformedContentLength } = parseFrameHeaders(header);
      if (contentLength === null || contentLength < 0 || malformedContentLength) {
        this.failAllPending((phase) => {
          return new DhBridgeError({
            code: "INVALID_REQUEST",
            phase,
            message: malformedContentLength
              ? "Bridge response has a malformed Content-Length header."
              : "Bridge response is missing a valid Content-Length header.",
          });
        });
        this.readBuffer = Buffer.alloc(0);
        return;
      }
      if (contentLength > this.maxFrameBytes) {
        this.failAllPending((phase) => {
          return new DhBridgeError({
            code: "BRIDGE_FRAME_TOO_LARGE",
            phase,
            message: `Bridge response frame is ${contentLength} bytes, exceeding maxFrameBytes=${this.maxFrameBytes}.`,
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

      const body = this.readBuffer.subarray(bodyStart, frameLength);
      this.readBuffer = this.readBuffer.subarray(frameLength);

      let parsed: JsonRpcResponse;
      try {
        parsed = decodeRpcBody(this.activeCodec, body, this.maxFrameBytes) as JsonRpcResponse;
      } catch (error) {
        this.failAllPending((phase) => {
          return new DhBridgeError({
            code: this.activeCodec === MSGPACK_RPC_CODEC ? "BRIDGE_CODEC_DECODE_FAILED" : "INVALID_REQUEST",
            phase,
            message: `Bridge response payload could not be decoded as ${this.activeCodec}: ${(error as Error).message}`,
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

  private mapRpcError(code: number, message: string, phase: BridgeFailurePhase, data?: unknown): DhBridgeError {
    const symbolicCode = asString(asRecord(data).code);
    if (symbolicCode === "CAPABILITY_UNSUPPORTED") {
      return new DhBridgeError({
        code: "CAPABILITY_UNSUPPORTED",
        phase,
        message,
      });
    }
    if (symbolicCode === "ACCESS_DENIED") {
      return new DhBridgeError({
        code: "ACCESS_DENIED",
        phase,
        message,
      });
    }
    if (symbolicCode === "NOT_FOUND") {
      return new DhBridgeError({
        code: "NOT_FOUND",
        phase,
        message,
      });
    }
    if (symbolicCode === "TIMEOUT") {
      return new DhBridgeError({
        code: "TIMEOUT",
        phase,
        message,
        retryable: true,
      });
    }
    if (symbolicCode === "EXECUTION_FAILED") {
      return new DhBridgeError({
        code: "EXECUTION_FAILED",
        phase,
        message,
      });
    }
    if (symbolicCode === "RUNTIME_UNAVAILABLE") {
      return new DhBridgeError({
        code: "RUNTIME_UNAVAILABLE",
        phase,
        message,
      });
    }
    if (symbolicCode === "BINARY_FILE_UNSUPPORTED") {
      return new DhBridgeError({
        code: "BINARY_FILE_UNSUPPORTED",
        phase,
        message,
      });
    }
    if (symbolicCode === "BRIDGE_CODEC_UNSUPPORTED") {
      return new DhBridgeError({
        code: "BRIDGE_CODEC_UNSUPPORTED",
        phase,
        message,
      });
    }
    if (symbolicCode === "BRIDGE_CODEC_DECODE_FAILED") {
      return new DhBridgeError({
        code: "BRIDGE_CODEC_DECODE_FAILED",
        phase,
        message,
      });
    }
    if (symbolicCode === "BRIDGE_FRAME_TOO_LARGE") {
      return new DhBridgeError({
        code: "BRIDGE_FRAME_TOO_LARGE",
        phase,
        message,
      });
    }
    if (symbolicCode === "BRIDGE_CODEC_NEGOTIATION_FAILED") {
      return new DhBridgeError({
        code: "BRIDGE_CODEC_NEGOTIATION_FAILED",
        phase,
        message,
      });
    }
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

function toBridgeSearchItem(raw: unknown): BridgeSearchItem | null {
  const value = asRecord(raw);
  const filePath = asString(value.filePath) ?? asString(value.file_path);
  const lineStart = asNumber(value.lineStart) ?? asNumber(value.line_start);
  const lineEnd = asNumber(value.lineEnd) ?? asNumber(value.line_end);
  const snippet = asString(value.snippet) ?? "";
  const reason = asString(value.reason) ?? "rust query match";
  const score = asNumber(value.score) ?? 0.5;

  if (!filePath || lineStart === null || lineEnd === null) {
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

function asBridgeRpcCodec(value: unknown): BridgeRpcCodec | null {
  if (value === JSON_RPC_CODEC || value === MSGPACK_RPC_CODEC) {
    return value;
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asBridgeAnswerState(value: unknown): BridgeAnswerState | null {
  if (value === "grounded" || value === "partial" || value === "insufficient" || value === "unsupported") {
    return value;
  }
  return null;
}

function asBridgeLanguageCapabilityState(value: unknown): BridgeLanguageCapabilityState | null {
  if (value === "supported" || value === "partial" || value === "best-effort" || value === "unsupported") {
    return value;
  }
  if (value === "best_effort") {
    return "best-effort";
  }
  return null;
}

function boundedBuildEvidenceBudgetFromLimit(limit?: number): BridgeBuildEvidenceBudget {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) {
    return {
      maxFiles: 5,
      maxSymbols: 8,
      maxSnippets: 8,
    };
  }

  const bounded = Math.max(1, Math.floor(limit));
  return {
    maxFiles: Math.min(bounded, 5),
    maxSymbols: 8,
    maxSnippets: 8,
  };
}

function parseBridgeEvidencePacket(value: unknown): BridgeEvidencePacket | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = asRecord(value);
  const answerState = asBridgeAnswerState(raw.answerState ?? raw.answer_state);
  const questionClass = asString(raw.questionClass) ?? asString(raw.question_class);
  const subject = asString(raw.subject);
  const summary = asString(raw.summary);
  const conclusion = asString(raw.conclusion);
  if (!answerState || !questionClass || !subject || !summary || !conclusion) {
    return null;
  }

  const evidence = Array.isArray(raw.evidence)
    ? raw.evidence.map(parseBridgeEvidenceEntry).filter((entry): entry is BridgeEvidenceEntry => entry !== null)
    : [];

  const gaps = Array.isArray(raw.gaps) ? raw.gaps.filter((gap): gap is string => typeof gap === "string") : [];

  const boundsRaw = asRecord(raw.bounds);
  const hopCount = asNumber(boundsRaw.hopCount) ?? asNumber(boundsRaw.hop_count);
  const nodeLimit = asNumber(boundsRaw.nodeLimit) ?? asNumber(boundsRaw.node_limit);

  return {
    answerState,
    questionClass,
    subject,
    summary,
    conclusion,
    evidence,
    gaps,
    bounds: {
      hopCount: hopCount === null ? undefined : hopCount,
      nodeLimit: nodeLimit === null ? undefined : nodeLimit,
      traversalScope: asString(boundsRaw.traversalScope) ?? asString(boundsRaw.traversal_scope) ?? undefined,
      stopReason: asString(boundsRaw.stopReason) ?? asString(boundsRaw.stop_reason) ?? undefined,
    },
  };
}

function parseBridgeEvidenceEntry(value: unknown): BridgeEvidenceEntry | null {
  const raw = asRecord(value);
  const kind = asString(raw.kind);
  const filePath = asString(raw.filePath) ?? asString(raw.file_path);
  const reason = asString(raw.reason);
  const source = asString(raw.source);
  const confidence = asBridgeEvidenceConfidence(raw.confidence);
  if (!kind || !filePath || !reason || !source || !confidence) {
    return null;
  }

  const lineStart = asNumber(raw.lineStart) ?? asNumber(raw.line_start);
  const lineEnd = asNumber(raw.lineEnd) ?? asNumber(raw.line_end);
  return {
    kind,
    filePath,
    reason,
    source,
    confidence,
    symbol: asString(raw.symbol) ?? undefined,
    lineStart: lineStart === null ? undefined : lineStart,
    lineEnd: lineEnd === null ? undefined : lineEnd,
    snippet: asString(raw.snippet) ?? undefined,
  };
}

function asBridgeEvidenceConfidence(value: unknown): BridgeEvidenceConfidence | null {
  if (value === "grounded" || value === "partial") {
    return value;
  }
  return null;
}

function parseBridgeLanguageCapabilitySummary(value: unknown): BridgeLanguageCapabilitySummary | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = asRecord(value);
  const capability = asString(raw.capability);
  const weakestState = asBridgeLanguageCapabilityState(raw.weakestState);
  const retrievalOnly = asBoolean(raw.retrievalOnly);
  if (!capability || !weakestState || retrievalOnly === null) {
    return null;
  }

  const languages = Array.isArray(raw.languages)
    ? raw.languages
      .map(parseBridgeLanguageCapabilityLanguageSummary)
      .filter((entry): entry is BridgeLanguageCapabilityLanguageSummary => entry !== null)
    : [];

  return {
    capability,
    weakestState,
    languages,
    retrievalOnly,
  };
}

function parseBridgeLanguageCapabilityLanguageSummary(value: unknown): BridgeLanguageCapabilityLanguageSummary | null {
  const raw = asRecord(value);
  const language = asString(raw.language);
  const state = asBridgeLanguageCapabilityState(raw.state);
  const reason = asString(raw.reason);
  const parserBacked = asBoolean(raw.parserBacked);
  if (!language || !state || !reason || parserBacked === null) {
    return null;
  }

  return {
    language,
    state,
    reason,
    parserBacked,
  };
}

function parseBridgeLanguageCapabilityEntry(value: unknown): BridgeLanguageCapabilityEntry | null {
  const raw = asRecord(value);
  const language = asString(raw.language);
  const capability = asString(raw.capability);
  const state = asBridgeLanguageCapabilityState(raw.state);
  const reason = asString(raw.reason);
  const parserBacked = asBoolean(raw.parserBacked);
  if (!language || !capability || !state || !reason || parserBacked === null) {
    return null;
  }

  return {
    language,
    capability,
    state,
    reason,
    parserBacked,
  };
}

function inferQuestionClassFromCall(call: {
  method: BridgeDirectQueryMethod;
  params: Record<string, unknown>;
}): string {
  if (call.method === "query.search") {
    const mode = asString(call.params.mode) ?? "symbol";
    if (mode === "file_path") {
      return "search_file_discovery";
    }
    if (mode === "structural") {
      return "search_structural";
    }
    if (mode === "concept") {
      return "search_concept_relevance";
    }
    return "search_symbol";
  }
  if (call.method === "query.definition") {
    return "definition";
  }
  if (call.method === "query.buildEvidence") {
    return "build_evidence";
  }
  if (call.method === "query.callHierarchy") {
    return "call_hierarchy";
  }
  if (call.method === "query.entryPoints") {
    return "entry_points";
  }

  const relation = asString(call.params.relation);
  if (relation === "usage") {
    return "references";
  }
  if (relation === "dependencies") {
    return "dependencies";
  }
  if (relation === "dependents") {
    return "dependents";
  }
  return "unknown";
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

  if (!Array.isArray(capabilities.languageCapabilityMatrix) || capabilities.languageCapabilityMatrix.length === 0) {
    return null;
  }

  const languageCapabilityMatrix = capabilities.languageCapabilityMatrix
    .map(parseBridgeLanguageCapabilityEntry)
    .filter((entry): entry is BridgeLanguageCapabilityEntry => entry !== null);
  if (languageCapabilityMatrix.length !== capabilities.languageCapabilityMatrix.length) {
    return null;
  }

  const transport = parseBridgeTransportSnapshot(capabilities.transport);

  return {
    protocolVersion,
    methods: V2_METHODS,
    queryRelationship: {
      supportedRelations: V2_RELATIONS,
    },
    languageCapabilityMatrix,
    transport,
  };
}

function parseBridgeTransportSnapshot(value: unknown): BridgeTransportSnapshot | undefined {
  const raw = asRecord(value);
  const selectedCodec = asBridgeRpcCodec(raw.selectedCodec);
  if (!selectedCodec) {
    return undefined;
  }

  const rawMaxFrameBytes = asNumber(raw.maxFrameBytes) ?? DEFAULT_BRIDGE_MAX_FRAME_BYTES;
  const maxFrameBytes = rawMaxFrameBytes >= MIN_BRIDGE_MAX_FRAME_BYTES && rawMaxFrameBytes <= DEFAULT_BRIDGE_MAX_FRAME_BYTES
    ? rawMaxFrameBytes
    : DEFAULT_BRIDGE_MAX_FRAME_BYTES;

  const selectedMode = raw.selectedMode === "json" || raw.selectedMode === "json-fallback" || raw.selectedMode === "msgpack-rpc-v1"
    ? raw.selectedMode
    : selectedCodec === MSGPACK_RPC_CODEC ? "msgpack-rpc-v1" : "json";
  return {
    selectedCodec,
    selectedMode,
    fallbackReason: asString(raw.fallbackReason) ?? undefined,
    maxFrameBytes,
    codecVersion: asNumber(raw.codecVersion) ?? 1,
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
