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
import { z } from "zod";

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

const BridgeEvidenceConfidenceSchema = z.enum(["grounded", "partial"]);

const BridgeEvidenceEntrySchema = z.object({
  kind: z.string(),
  filePath: z.string().optional(),
  file_path: z.string().optional(),
  reason: z.string(),
  source: z.string(),
  confidence: BridgeEvidenceConfidenceSchema,
  symbol: z.string().optional(),
  lineStart: z.number().optional(),
  line_start: z.number().optional(),
  lineEnd: z.number().optional(),
  line_end: z.number().optional(),
  snippet: z.string().optional(),
}).transform((raw) => {
  const filePath = raw.filePath ?? raw.file_path;
  if (!filePath) {
    throw new Error("filePath or file_path is required");
  }
  return {
    kind: raw.kind,
    filePath,
    reason: raw.reason,
    source: raw.source,
    confidence: raw.confidence,
    symbol: raw.symbol,
    lineStart: raw.lineStart ?? raw.line_start,
    lineEnd: raw.lineEnd ?? raw.line_end,
    snippet: raw.snippet,
  };
});

const BridgeEvidencePacketSchema = z.object({
  answerState: z.enum(["grounded", "partial", "insufficient", "unsupported"]).optional(),
  answer_state: z.enum(["grounded", "partial", "insufficient", "unsupported"]).optional(),
  questionClass: z.string().optional(),
  question_class: z.string().optional(),
  subject: z.string(),
  summary: z.string(),
  conclusion: z.string(),
  evidence: z.array(BridgeEvidenceEntrySchema).default([]),
  gaps: z.array(z.string()).default([]),
  bounds: z.object({
    hopCount: z.number().optional(),
    hop_count: z.number().optional(),
    nodeLimit: z.number().optional(),
    node_limit: z.number().optional(),
    traversalScope: z.string().optional(),
    traversal_scope: z.string().optional(),
    stopReason: z.string().optional(),
    stop_reason: z.string().optional(),
  }).optional().default({}),
}).transform((raw) => {
  const answerState = raw.answerState ?? raw.answer_state;
  const questionClass = raw.questionClass ?? raw.question_class;
  if (!answerState || !questionClass) {
    throw new Error("Missing answerState or questionClass in EvidencePacket");
  }
  return {
    answerState,
    questionClass,
    subject: raw.subject,
    summary: raw.summary,
    conclusion: raw.conclusion,
    evidence: raw.evidence,
    gaps: raw.gaps,
    bounds: {
      hopCount: raw.bounds?.hopCount ?? raw.bounds?.hop_count,
      nodeLimit: raw.bounds?.nodeLimit ?? raw.bounds?.node_limit,
      traversalScope: raw.bounds?.traversalScope ?? raw.bounds?.traversal_scope,
      stopReason: raw.bounds?.stopReason ?? raw.bounds?.stop_reason,
    },
  };
});

function parseEvidencePacket(value: unknown): BridgeAskResult["evidence"] {
  if (value === null || value === undefined) {
    return null;
  }
  const result = BridgeEvidencePacketSchema.safeParse(value);
  if (!result.success) {
    return null; // Fallback to null if invalid, preserving previous manual parsing behaviour which also returned null
  }
  return result.data as BridgeAskResult["evidence"];
}

const BridgeLanguageCapabilityStateSchema = z.enum(["supported", "partial", "best-effort", "unsupported", "best_effort"]).transform((val) => val === "best_effort" ? "best-effort" : val);

const BridgeLanguageSummarySchema = z.object({
  language: z.string(),
  state: BridgeLanguageCapabilityStateSchema,
  reason: z.string(),
  parserBacked: z.boolean(),
});

const BridgeLanguageCapabilitySummarySchema = z.object({
  capability: z.string(),
  weakestState: BridgeLanguageCapabilityStateSchema,
  retrievalOnly: z.boolean(),
  languages: z.array(BridgeLanguageSummarySchema).default([]),
});

function parseLanguageCapabilitySummary(value: unknown): BridgeAskResult["languageCapabilitySummary"] {
  if (value === null || value === undefined) {
    return null;
  }
  const result = BridgeLanguageCapabilitySummarySchema.safeParse(value);
  if (!result.success) {
    return null;
  }
  return result.data as BridgeAskResult["languageCapabilitySummary"];
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

function asBridgeAnswerState(value: unknown): BridgeAskResult["answerState"] | null {
  if (value === "grounded" || value === "partial" || value === "insufficient" || value === "unsupported") {
    return value;
  }
  return null;
}

function isNotNull<T>(value: T | null): value is T {
  return value !== null;
}

function asUnknownArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}
