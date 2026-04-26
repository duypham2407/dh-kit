import {
  DhBridgeError,
  type BridgeAskRequest,
  type BridgeAskResult,
  type BridgeClient,
  type BridgeDirectQueryMethod,
  type BridgeFailureCode,
  type BridgeFailurePhase,
  type BridgeInitializeCapabilities,
  type BridgeInitializeSnapshot,
  type BridgeSessionDelegatedMethod,
  type BridgeSessionRunCommandRequest,
} from "../bridge/dh-jsonrpc-stdio-client.js";
import { JsonRpcPeerError, type WorkerJsonRpcPeer } from "./worker-jsonrpc-stdio.js";

export const HOST_BACKED_BRIDGE_ENGINE_NAME = "dh-engine";
export const HOST_BACKED_BRIDGE_PROTOCOL_VERSION = "1";
export const HOST_BACKED_BRIDGE_SUPPORTED_METHODS = [
  "dh.initialize",
  "query.search",
  "query.definition",
  "query.relationship",
  "query.buildEvidence",
] as const;
export const HOST_BACKED_BRIDGE_SUPPORTED_RELATIONS = ["usage", "dependencies", "dependents"] as const;

type HostBridgeClientOptions = {
  protocolVersion?: string;
  engineName?: string;
  engineVersion?: string;
  capabilities?: BridgeInitializeCapabilities;
  requestTimeoutMs?: number;
};

type BridgeCall = {
  method: BridgeDirectQueryMethod;
  params: Record<string, unknown>;
};

type HostRpcSuccess = {
  result: unknown;
  requestId: number;
};

/**
 * Subordinate BridgeClient for the Rust-hosted worker path.
 *
 * This client never spawns Rust and never owns host lifecycle truth. It only asks
 * the already-running Rust host for bounded query operations over the worker
 * JSON-RPC channel that Rust supervises.
 */
export class HostBridgeClient implements BridgeClient {
  private readonly peer: WorkerJsonRpcPeer;
  private readonly requestTimeoutMs: number;
  private readonly engineName: string;
  private readonly engineVersion: string;
  private readonly protocolVersion: string;
  private readonly capabilities: BridgeInitializeCapabilities;
  private nextSyntheticRequestId = 1;

  constructor(peer: WorkerJsonRpcPeer, options?: HostBridgeClientOptions) {
    this.peer = peer;
    this.requestTimeoutMs = options?.requestTimeoutMs ?? 10_000;
    this.engineName = options?.engineName ?? HOST_BACKED_BRIDGE_ENGINE_NAME;
    this.engineVersion = options?.engineVersion ?? "host-managed";
    this.protocolVersion = options?.protocolVersion ?? HOST_BACKED_BRIDGE_PROTOCOL_VERSION;
    this.capabilities = options?.capabilities ?? defaultHostBridgeCapabilities(this.protocolVersion);
  }

  async runAskQuery(input: BridgeAskRequest): Promise<BridgeAskResult> {
    const call = buildBridgeCall(input);
    const response = await this.requestHost(call.method, call.params);
    const parsed = parseBridgeAskResult({ result: response.result, method: call.method, params: call.params });

    return {
      method: call.method,
      seamMethod: "direct.query",
      requestId: response.requestId,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      ...parsed,
    };
  }

  async runSessionCommand(input: BridgeSessionRunCommandRequest): Promise<BridgeAskResult> {
    const call = buildBridgeCall(input);
    const response = await this.requestHost(call.method, call.params);
    const parsed = parseBridgeAskResult({ result: response.result, method: call.method, params: call.params });

    return {
      method: call.method,
      seamMethod: "session.runCommand",
      delegatedMethod: call.method,
      requestId: response.requestId,
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
      ...parsed,
    };
  }

  async getInitializeSnapshot(): Promise<BridgeInitializeSnapshot> {
    return {
      engineName: this.engineName,
      engineVersion: this.engineVersion,
      protocolVersion: this.protocolVersion,
      capabilities: this.capabilities,
    };
  }

  async close(): Promise<void> {
    // No-op by design: this subordinate client does not own the Rust host or
    // the worker stdio transport. The Rust host remains lifecycle authority for
    // shutdown and cleanup.
  }

  private async requestHost(method: string, params: Record<string, unknown>): Promise<HostRpcSuccess> {
    const requestId = this.nextSyntheticRequestId;
    this.nextSyntheticRequestId += 1;

    try {
      const result = await this.peer.request(method, params, this.requestTimeoutMs);
      return { result, requestId };
    } catch (error) {
      throw mapHostRpcError(error, method);
    }
  }
}

export function createHostBridgeClient(
  peer: WorkerJsonRpcPeer,
  options?: HostBridgeClientOptions,
): BridgeClient {
  return new HostBridgeClient(peer, options);
}

function defaultHostBridgeCapabilities(protocolVersion: string): BridgeInitializeCapabilities {
  return {
    protocolVersion,
    methods: HOST_BACKED_BRIDGE_SUPPORTED_METHODS,
    queryRelationship: {
      supportedRelations: HOST_BACKED_BRIDGE_SUPPORTED_RELATIONS,
    },
    languageCapabilityMatrix: [
      {
        language: "typescript",
        capability: "trace_flow",
        state: "unsupported",
        reason: "Trace flow remains outside the bounded first-wave Rust host query contract.",
        parserBacked: false,
      },
      {
        language: "rust",
        capability: "trace_flow",
        state: "unsupported",
        reason: "Trace flow remains outside the bounded first-wave Rust host query contract.",
        parserBacked: false,
      },
    ],
  };
}

function buildBridgeCall(input: BridgeAskRequest | BridgeSessionRunCommandRequest): BridgeCall {
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
      };
    case "graph_definition":
      return {
        method: "query.definition",
        params: {
          symbol: input.symbol ?? input.query,
          workspaceRoot: input.repoRoot,
          limit,
        },
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
      };
    case "graph_build_evidence":
      return {
        method: "query.buildEvidence",
        params: {
          query: input.query,
          workspaceRoot: input.repoRoot,
          intent: input.intent ?? "explain",
          targets: input.targets ?? [],
          budget: input.budget ?? boundedBuildEvidenceBudgetFromLimit(input.limit),
          freshness: input.freshness ?? "indexed",
        },
      };
    default: {
      const exhaustive: never = input.queryClass;
      throw new DhBridgeError({
        code: "INVALID_REQUEST",
        phase: "request",
        message: `Unsupported query class for host-backed bridge: ${String(exhaustive)}`,
      });
    }
  }
}

function parseBridgeAskResult(input: {
  result: unknown;
  method: BridgeDirectQueryMethod;
  params: Record<string, unknown>;
}): Pick<BridgeAskResult, "answerState" | "questionClass" | "items" | "evidence" | "languageCapabilitySummary"> {
  const resultObj = asRecord(input.result);
  const answerState = asBridgeAnswerState(resultObj.answerState);
  const evidence = parseEvidencePacket(resultObj.evidence);
  const resolvedAnswerState = answerState ?? evidence?.answerState ?? null;
  if (!resolvedAnswerState) {
    throw invalidHostPayload(input.method, "query answer state");
  }

  const questionClass = asString(resultObj.questionClass)
    ?? evidence?.questionClass
    ?? inferQuestionClassFromCall(input);
  const items = asUnknownArray(resultObj.items)
    ?.map(toSearchItem)
    .filter(isNotNull)
    ?? [];

  return {
    answerState: resolvedAnswerState,
    questionClass,
    items,
    evidence,
    languageCapabilitySummary: parseLanguageCapabilitySummary(resultObj.languageCapabilitySummary),
  };
}

function mapHostRpcError(error: unknown, method: string): DhBridgeError {
  if (error instanceof DhBridgeError) {
    return error;
  }
  if (error instanceof JsonRpcPeerError) {
    if (error.kind === "timeout") {
      return new DhBridgeError({
        code: "BRIDGE_TIMEOUT",
        phase: "request",
        message: error.message,
        retryable: true,
      });
    }
    if (error.kind === "closed" || error.kind === "protocol") {
      return new DhBridgeError({
        code: "BRIDGE_UNREACHABLE",
        phase: "request",
        message: error.message,
      });
    }
    return new DhBridgeError({
      code: mapJsonRpcCode(error.rpcCode, error.rpcData),
      phase: "request",
      message: error.message,
      retryable: error.rpcCode === -32012,
    });
  }

  return new DhBridgeError({
    code: "REQUEST_FAILED",
    phase: "request",
    message: error instanceof Error ? error.message : `Host RPC '${method}' failed.`,
  });
}

function mapJsonRpcCode(code?: number, data?: unknown): BridgeFailureCode {
  const symbolicCode = asString(asRecord(data).code);
  if (symbolicCode === "CAPABILITY_UNSUPPORTED") {
    return "CAPABILITY_UNSUPPORTED";
  }
  if (symbolicCode === "ACCESS_DENIED") {
    return "ACCESS_DENIED";
  }
  if (symbolicCode === "NOT_FOUND") {
    return "NOT_FOUND";
  }
  if (symbolicCode === "TIMEOUT") {
    return "TIMEOUT";
  }
  if (symbolicCode === "EXECUTION_FAILED") {
    return "EXECUTION_FAILED";
  }
  if (symbolicCode === "RUNTIME_UNAVAILABLE") {
    return "RUNTIME_UNAVAILABLE";
  }
  if (symbolicCode === "BINARY_FILE_UNSUPPORTED") {
    return "BINARY_FILE_UNSUPPORTED";
  }
  if (code === -32601) {
    return "METHOD_NOT_SUPPORTED";
  }
  if (code === -32600 || code === -32602) {
    return "INVALID_REQUEST";
  }
  if (code === -32012) {
    return "TIMEOUT";
  }
  return "REQUEST_FAILED";
}

function invalidHostPayload(method: string, shape: string): DhBridgeError {
  return new DhBridgeError({
    code: "INVALID_REQUEST",
    phase: "request",
    message: `Rust host response for '${method}' is missing or invalid ${shape} payload.`,
  });
}

function inferQuestionClassFromCall(call: { method: BridgeDirectQueryMethod; params: Record<string, unknown> }): string {
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

function toSearchItem(value: unknown): BridgeAskResult["items"][number] | null {
  const raw = asRecord(value);
  const filePath = asString(raw.filePath) ?? asString(raw.file_path);
  const lineStart = asNumber(raw.lineStart) ?? asNumber(raw.line_start);
  const lineEnd = asNumber(raw.lineEnd) ?? asNumber(raw.line_end);
  if (!filePath || lineStart === null || lineEnd === null) {
    return null;
  }
  return {
    filePath,
    lineStart,
    lineEnd,
    snippet: asString(raw.snippet) ?? "",
    reason: asString(raw.reason) ?? "rust host query match",
    score: asNumber(raw.score) ?? 0.5,
  };
}

function boundedBuildEvidenceBudgetFromLimit(limit?: number): { maxFiles: number; maxSymbols: number; maxSnippets: number } {
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

function parseEvidencePacket(value: unknown): BridgeAskResult["evidence"] {
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

  const bounds = asRecord(raw.bounds);
  const hopCount = asNumber(bounds.hopCount) ?? asNumber(bounds.hop_count);
  const nodeLimit = asNumber(bounds.nodeLimit) ?? asNumber(bounds.node_limit);

  return {
    answerState,
    questionClass,
    subject,
    summary,
    conclusion,
    evidence: asUnknownArray(raw.evidence)?.map(parseEvidenceEntry).filter(isNotNull) ?? [],
    gaps: asStringArray(raw.gaps) ?? [],
    bounds: {
      hopCount: hopCount ?? undefined,
      nodeLimit: nodeLimit ?? undefined,
      traversalScope: asString(bounds.traversalScope) ?? asString(bounds.traversal_scope) ?? undefined,
      stopReason: asString(bounds.stopReason) ?? asString(bounds.stop_reason) ?? undefined,
    },
  };
}

function parseEvidenceEntry(value: unknown): BridgeAskResult["evidence"] extends infer E
  ? E extends { evidence: Array<infer Entry> }
    ? Entry | null
    : never
  : never {
  const raw = asRecord(value);
  const kind = asString(raw.kind);
  const filePath = asString(raw.filePath) ?? asString(raw.file_path);
  const reason = asString(raw.reason);
  const source = asString(raw.source);
  const confidence = asEvidenceConfidence(raw.confidence);
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
    lineStart: lineStart ?? undefined,
    lineEnd: lineEnd ?? undefined,
    snippet: asString(raw.snippet) ?? undefined,
  };
}

function parseLanguageCapabilitySummary(value: unknown): BridgeAskResult["languageCapabilitySummary"] {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = asRecord(value);
  const capability = asString(raw.capability);
  const weakestState = asCapabilityState(raw.weakestState);
  const retrievalOnly = asBoolean(raw.retrievalOnly);
  if (!capability || !weakestState || retrievalOnly === null) {
    return null;
  }
  return {
    capability,
    weakestState,
    retrievalOnly,
    languages: asUnknownArray(raw.languages)?.map(parseLanguageSummary).filter(isNotNull) ?? [],
  };
}

function parseLanguageSummary(value: unknown): BridgeAskResult["languageCapabilitySummary"] extends infer S
  ? S extends { languages: Array<infer Entry> }
    ? Entry | null
    : never
  : never {
  const raw = asRecord(value);
  const language = asString(raw.language);
  const state = asCapabilityState(raw.state);
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

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function asUnknownArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    return null;
  }
  return value as string[];
}

function asBridgeAnswerState(value: unknown): BridgeAskResult["answerState"] | null {
  if (value === "grounded" || value === "partial" || value === "insufficient" || value === "unsupported") {
    return value;
  }
  return null;
}

function asEvidenceConfidence(value: unknown): "grounded" | "partial" | null {
  if (value === "grounded" || value === "partial") {
    return value;
  }
  return null;
}

function asCapabilityState(value: unknown): "supported" | "partial" | "best-effort" | "unsupported" | null {
  if (value === "supported" || value === "partial" || value === "best-effort" || value === "unsupported") {
    return value;
  }
  if (value === "best_effort") {
    return "best-effort";
  }
  return null;
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}
