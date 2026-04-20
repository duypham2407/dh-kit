import { KnowledgeCommandSessionBridge } from "../../../runtime/src/session/knowledge-command-session-bridge.js";
import {
  type BridgeAnswerState,
  type BridgeAskResult,
  type BridgeClient,
  type BridgeAskQueryClass,
  type BridgeLanguageCapabilitySummary,
  type BridgeLanguageCapabilityState,
  type BridgeInitializeSnapshot,
  createDhJsonRpcStdioClient,
  DhBridgeError,
  type BridgeFailureCode,
  type BridgeFailurePhase,
} from "../bridge/dh-jsonrpc-stdio-client.js";

export type KnowledgeAskAnswerType =
  | "search_match"
  | "definition"
  | "usage"
  | "dependencies"
  | "dependents"
  | "partial"
  | "unsupported";

export type KnowledgeAskEvidenceEntry = {
  filePath: string;
  lineStart?: number;
  lineEnd?: number;
  reason: string;
  sourceMethod: string;
  source?: string;
  confidence?: "grounded" | "partial";
  kind?: string;
  snippet?: string;
  symbol?: string;
  relationship?: "usage" | "dependencies" | "dependents";
  score?: number;
};

export type KnowledgeCommandReport = {
  exitCode: number;
  command: "ask" | "explain" | "trace";
  repo: string;
  intent: string;
  tools: string[];
  seedTerms: string[];
  workspaceCount: number;
  resultCount: number;
  evidenceCount: number;
  evidencePreview: string[];
  sessionId?: string;
  resumed?: boolean;
  compaction?: {
    attempted: boolean;
    overflow: boolean;
    compacted: boolean;
    continuationSummaryGeneratedInMemory: boolean;
    continuationSummaryPersisted: boolean;
  };
  persistence?: {
    attempted: boolean;
    persisted: boolean;
    warning?: string;
    eventId?: string;
  };
  message?: string;
  guidance?: string[];
  answer?: string;
  answerType?: KnowledgeAskAnswerType;
  answerState?: BridgeAnswerState;
  evidence?: KnowledgeAskEvidenceEntry[];
  rustEvidence?: BridgeAskResult["evidence"];
  limitations?: string[];
  questionClass?: string;
  requestedQuestionClass?:
    | "search_file_discovery"
    | "graph_definition"
    | "graph_relationship_usage"
    | "graph_relationship_dependencies"
    | "graph_relationship_dependents"
    | "unsupported";
  languageCapabilitySummary?: BridgeLanguageCapabilitySummary | null;
  bridgeEvidence?: {
    enabled: boolean;
    startupSucceeded: boolean;
    method?: string;
    requestId?: number;
    rustBacked: boolean;
    protocolVersion?: string;
    engine?: {
      name: string;
      version: string;
    };
    capabilities?: {
      protocolVersion: string;
      methods: readonly ["dh.initialize", "query.search", "query.definition", "query.relationship"];
      queryRelationship: {
        supportedRelations: readonly ["usage", "dependencies", "dependents"];
      };
      languageCapabilityMatrix: Array<{
        language: string;
        capability: string;
        state: BridgeLanguageCapabilityState;
        reason: string;
        parserBacked: boolean;
      }>;
    };
    failure?: {
      code: BridgeFailureCode;
      phase: BridgeFailurePhase;
      message: string;
      retryable: boolean;
    };
  };
};

export async function runKnowledgeCommand(input: {
  kind: "ask" | "explain" | "trace";
  input: string;
  repoRoot: string;
  resumeSessionId?: string;
  bridgeClientFactory?: (repoRoot: string) => BridgeClient;
}): Promise<KnowledgeCommandReport> {
  if (!input.input) {
    return {
      exitCode: 1,
      command: input.kind,
      repo: input.repoRoot,
      intent: "",
      tools: [],
      seedTerms: [],
      workspaceCount: 0,
      resultCount: 0,
      evidenceCount: 0,
      evidencePreview: [],
      message: `Missing input for '${input.kind}' command.`,
      guidance: [`Example: dh ${input.kind} "how does authentication work?"`],
    };
  }

  const bridge = new KnowledgeCommandSessionBridge(input.repoRoot);
  const resolved = bridge.resolveSession({
    kind: input.kind,
    prompt: input.input,
    resumeSessionId: input.resumeSessionId,
  });

  if (!resolved.ok) {
    return {
      exitCode: 1,
      command: input.kind,
      repo: input.repoRoot,
      intent: "",
      tools: [],
      seedTerms: [],
      workspaceCount: 0,
      resultCount: 0,
      evidenceCount: 0,
      evidencePreview: [],
      message: resolved.reason,
    };
  }

  const guidance: string[] = [];

  if (input.kind === "ask" || input.kind === "explain") {
    const requestedQuestionClass =
      input.kind === "ask"
        ? classifyAskQuestion(input.input)
        : classifyExplainQuestion(input.input);

    if (requestedQuestionClass.queryClass === "unsupported") {
      const unsupportedLimitations = [
        "Phase 3 supports only: search-aware file discovery, graph-aware definition/location, and graph-aware one-hop usage/dependency/import relationships.",
        "This question appears adjacent but outside the bounded Phase 3 guaranteed classes.",
      ];
      return {
        exitCode: 0,
        command: input.kind,
        repo: input.repoRoot,
        intent: "unsupported_question_class",
        tools: [],
        seedTerms: input.input.split(/\s+/).filter((value) => value.length > 0).slice(0, 6),
        workspaceCount: 1,
        resultCount: 0,
        evidenceCount: 0,
        evidencePreview: [],
        sessionId: resolved.session.sessionId,
        resumed: resolved.resumed,
        compaction: resolved.compaction,
        persistence: resolved.persistence,
        guidance,
        answer: "Unsupported for Phase 3: this question falls outside the bounded ask classes.",
        answerType: "unsupported",
        answerState: "unsupported",
        evidence: [],
        limitations: unsupportedLimitations,
        questionClass: "unsupported",
        requestedQuestionClass: "unsupported",
        languageCapabilitySummary: null,
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: false,
          rustBacked: false,
        },
      };
    }

    const bridgeClient = input.bridgeClientFactory
      ? input.bridgeClientFactory(input.repoRoot)
      : createDhJsonRpcStdioClient(input.repoRoot);
    try {
      const bridgeResult = await bridgeClient.runAskQuery({
        query: input.input,
        repoRoot: input.repoRoot,
        queryClass: requestedQuestionClass.queryClass,
        symbol: requestedQuestionClass.symbol,
        targetPath: requestedQuestionClass.targetPath,
        limit: 5,
      });

      const assembled = assembleAskAnswer({
        query: input.input,
        requestedQuestionClass: requestedQuestionClass.queryClass,
        bridgeResult,
      });

      const evidencePreview = assembled.evidence.slice(0, 3).map((item, index) => {
        const lineRange =
          typeof item.lineStart === "number" && typeof item.lineEnd === "number"
            ? `[${item.lineStart}-${item.lineEnd}]`
            : "[line unknown]";
        return `evidence ${index + 1}: ${item.filePath} ${lineRange} via=${item.sourceMethod} reason=${item.reason}`;
      });

      return {
        exitCode: 0,
        command: input.kind,
        repo: input.repoRoot,
        intent: mapBridgeMethodToIntent(bridgeResult.method),
        tools: ["rust_bridge_jsonrpc"],
        seedTerms: input.input.split(/\s+/).filter((value) => value.length > 0).slice(0, 6),
        workspaceCount: 1,
        resultCount: bridgeResult.items.length,
        evidenceCount: assembled.evidence.length,
        evidencePreview,
        sessionId: resolved.session.sessionId,
        resumed: resolved.resumed,
        compaction: resolved.compaction,
        persistence: resolved.persistence,
        guidance,
        answer: assembled.answer,
        answerType: assembled.answerType,
        answerState: assembled.answerState,
        evidence: assembled.evidence,
        rustEvidence: assembled.rustEvidence,
        limitations: assembled.limitations,
        questionClass: assembled.questionClass,
        requestedQuestionClass: requestedQuestionClass.queryClass,
        languageCapabilitySummary: assembled.languageCapabilitySummary,
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: true,
          method: bridgeResult.method,
          requestId: bridgeResult.requestId,
          rustBacked: true,
          protocolVersion: bridgeResult.protocolVersion,
          engine: {
            name: bridgeResult.engineName,
            version: bridgeResult.engineVersion,
          },
          capabilities: bridgeResult.capabilities,
        },
      };
    } catch (error) {
      const failure = toBridgeFailure(error);
      const message = `Knowledge command failed: ${failure.code} (${failure.phase}) — ${failure.message}`;
      guidance.push("Check bridge diagnostics and ensure rust-engine can run locally.");
      guidance.push("Run: cargo test --workspace (from rust-engine) to verify engine health.");
      guidance.push("Run: dh doctor to check workspace prerequisites.");

      return {
        exitCode: 1,
        command: input.kind,
        repo: input.repoRoot,
        intent: "",
        tools: [],
        seedTerms: [],
        workspaceCount: 0,
        resultCount: 0,
        evidenceCount: 0,
        evidencePreview: [],
        sessionId: resolved.session.sessionId,
        resumed: resolved.resumed,
        compaction: resolved.compaction,
        persistence: resolved.persistence,
        message,
        guidance,
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: failure.phase === "request",
          rustBacked: false,
          failure,
        },
      };
    } finally {
      await bridgeClient.close();
    }
  }

  if (input.kind === "trace") {
    const traceSeedTerms = input.input.split(/\s+/).filter((value) => value.length > 0).slice(0, 6);
    const bridgeClient = input.bridgeClientFactory
      ? input.bridgeClientFactory(input.repoRoot)
      : createDhJsonRpcStdioClient(input.repoRoot);
    try {
      const initializeSnapshot = await bridgeClient.getInitializeSnapshot?.();
      if (!initializeSnapshot) {
        throw new DhBridgeError({
          code: "METHOD_NOT_SUPPORTED",
          phase: "startup",
          message: "Rust bridge client does not expose initialize capability snapshot for trace introspection.",
        });
      }

      const languageCapabilitySummary = summarizeTraceCapabilityFromInitialize(initializeSnapshot);
      if (!languageCapabilitySummary) {
        throw new DhBridgeError({
          code: "INVALID_REQUEST",
          phase: "startup",
          message: "Rust bridge initialize snapshot omitted trace_flow capability entries.",
        });
      }

      const traceTruth = deriveTraceUnsupportedTruth({
        subject: input.input,
        initializeSnapshot,
        languageCapabilitySummary,
      });

      return {
        exitCode: 0,
        command: input.kind,
        repo: input.repoRoot,
        intent: "trace_flow_unsupported",
        tools: ["rust_bridge_jsonrpc"],
        seedTerms: traceSeedTerms,
        workspaceCount: 1,
        resultCount: 0,
        evidenceCount: 0,
        evidencePreview: [
          traceTruth.summary,
        ],
        sessionId: resolved.session.sessionId,
        resumed: resolved.resumed,
        compaction: resolved.compaction,
        persistence: resolved.persistence,
        guidance: [
          "Use dh ask for bounded definition/usage/dependency/dependent questions.",
          "Use dh explain for bounded symbol-definition lookup.",
        ],
        answer: traceTruth.answer,
        answerType: "unsupported",
        answerState: "unsupported",
        evidence: [],
        rustEvidence: {
          answerState: "unsupported",
          questionClass: "trace_flow",
          subject: input.input,
          summary: traceTruth.summary,
          conclusion: traceTruth.conclusion,
          evidence: [],
          gaps: traceTruth.gaps,
          bounds: {
            hopCount: 0,
            traversalScope: "trace_flow",
            stopReason: traceTruth.stopReason,
          },
        },
        limitations: traceTruth.limitations,
        questionClass: "trace_flow",
        languageCapabilitySummary,
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: true,
          method: "dh.initialize",
          rustBacked: true,
          protocolVersion: initializeSnapshot.protocolVersion,
          engine: {
            name: initializeSnapshot.engineName,
            version: initializeSnapshot.engineVersion,
          },
          capabilities: initializeSnapshot.capabilities,
        },
      };
    } catch (error) {
      const failure = toBridgeFailure(error);
      const message = `Knowledge command failed: ${failure.code} (${failure.phase}) — ${failure.message}`;
      guidance.push("Check bridge diagnostics and ensure rust-engine can run locally.");
      guidance.push("Run: cargo test --workspace (from rust-engine) to verify engine health.");
      guidance.push("Run: dh doctor to check workspace prerequisites.");

      return {
        exitCode: 1,
        command: input.kind,
        repo: input.repoRoot,
        intent: "",
        tools: [],
        seedTerms: [],
        workspaceCount: 0,
        resultCount: 0,
        evidenceCount: 0,
        evidencePreview: [],
        sessionId: resolved.session.sessionId,
        resumed: resolved.resumed,
        compaction: resolved.compaction,
        persistence: resolved.persistence,
        message,
        guidance,
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: failure.phase === "request",
          rustBacked: false,
          failure,
        },
      };
    } finally {
      await bridgeClient.close();
    }
  }

  return assertNeverKnowledgeKind(input.kind);
}

function classifyAskQuestion(query: string): {
  queryClass:
    | "search_file_discovery"
    | "graph_definition"
    | "graph_relationship_usage"
    | "graph_relationship_dependencies"
    | "graph_relationship_dependents"
    | "unsupported";
  symbol?: string;
  targetPath?: string;
} {
  const q = query.trim();
  const lowered = q.toLowerCase();

  if (
    lowered.includes("multi-hop")
    || lowered.includes("call hierarchy")
    || lowered.includes("impact analysis")
    || lowered.includes("trace flow")
    || lowered.includes("entire subsystem")
  ) {
    return { queryClass: "unsupported" };
  }

  const definitionMatch = q.match(/(?:where\s+is|where\s+are|definition\s+of|defined\s+in|implemented\s+in)\s+[`"']?([A-Za-z0-9_.$/-]+)/i);
  if (definitionMatch) {
    return {
      queryClass: "graph_definition",
      symbol: sanitizeToken(definitionMatch[1]),
    };
  }

  if (/(where\s+is|who\s+uses|usages?\s+of|references?\s+to).*/i.test(q) && /\b(use|used|usage|reference|references)\b/i.test(q)) {
    const symbol = extractSymbolCandidate(q);
    return {
      queryClass: "graph_relationship_usage",
      symbol: symbol ?? q,
    };
  }

  if (/\b(what\s+does|dependencies\s+of|depends\s+on|imports\s+for)\b/i.test(q) && /\b(file|path|\.ts|\.js|\.tsx|\.jsx|\.rs|import|depend)\b/i.test(q)) {
    return {
      queryClass: "graph_relationship_dependencies",
      targetPath: extractPathCandidate(q) ?? q,
    };
  }

  if (/\b(who\s+imports|what\s+imports|what\s+files\s+import|which\s+files\s+import|dependents\s+of|who\s+depends\s+on)\b/i.test(q)) {
    const target = extractPathCandidate(q) ?? extractSymbolCandidate(q) ?? q;
    return {
      queryClass: "graph_relationship_dependents",
      targetPath: target,
    };
  }

  if (/\b(where|find|which\s+files|locate)\b/i.test(q)) {
    return { queryClass: "search_file_discovery" };
  }

  return { queryClass: "unsupported" };
}

function classifyExplainQuestion(query: string): {
  queryClass: "graph_definition";
  symbol?: string;
  targetPath?: string;
} {
  const q = query.trim();
  return {
    queryClass: "graph_definition",
    symbol: extractSymbolCandidate(q) ?? sanitizeToken(q) ?? q,
  };
}

function mapBridgeMethodToIntent(method: BridgeAskResult["method"]):
  | "bridge_query_search"
  | "bridge_query_definition"
  | "bridge_query_relationship" {
  if (method === "query.definition") {
    return "bridge_query_definition";
  }
  if (method === "query.relationship") {
    return "bridge_query_relationship";
  }
  return "bridge_query_search";
}

function summarizeTraceCapabilityFromInitialize(
  initializeSnapshot: BridgeInitializeSnapshot,
): BridgeLanguageCapabilitySummary | null {
  const entries = initializeSnapshot.capabilities.languageCapabilityMatrix
    .filter((entry) => entry.capability === "trace_flow")
    .map((entry) => {
      return {
        language: entry.language,
        state: entry.state,
        reason: entry.reason,
        parserBacked: entry.parserBacked,
      };
    });

  if (entries.length === 0) {
    return null;
  }

  const weakestState = entries
    .map((entry) => entry.state)
    .reduce<BridgeLanguageCapabilityState>((currentWeakest, candidate) => {
      return capabilityStateRank(candidate) < capabilityStateRank(currentWeakest)
        ? candidate
        : currentWeakest;
    }, entries[0].state);

  return {
    capability: "trace_flow",
    weakestState,
    languages: entries,
    retrievalOnly: false,
  };
}

function deriveTraceUnsupportedTruth(input: {
  subject: string;
  initializeSnapshot: BridgeInitializeSnapshot;
  languageCapabilitySummary: BridgeLanguageCapabilitySummary;
}): {
  answer: string;
  summary: string;
  conclusion: string;
  gaps: string[];
  limitations: string[];
  stopReason: string;
} {
  const advertisedMethods = [...input.initializeSnapshot.capabilities.methods] as string[];
  const supportsTraceMethod = advertisedMethods.includes("query.trace");
  const unsupportedByCapability = input.languageCapabilitySummary.weakestState === "unsupported";

  const gaps: string[] = [];
  if (!supportsTraceMethod) {
    gaps.push("Rust bridge methods do not advertise query.trace in the current bounded protocol.");
  }

  const unsupportedLanguages = input.languageCapabilitySummary.languages
    .filter((entry) => entry.state === "unsupported")
    .map((entry) => `${entry.language}: ${entry.reason}`);
  if (unsupportedLanguages.length > 0) {
    gaps.push(...unsupportedLanguages);
  }

  if (!unsupportedByCapability && !supportsTraceMethod) {
    gaps.push("Trace routing remains unavailable even though capability matrix did not report unsupported as the weakest state.");
  }

  if (gaps.length === 0) {
    gaps.push("Trace flow is outside the current bounded Rust query routing contract.");
  }

  const summary = unsupportedByCapability
    ? "Trace flow is unsupported in the Rust capability matrix for the current bounded contract."
    : "Trace flow routing is not advertised by the Rust bridge in the current bounded contract.";

  const conclusion = unsupportedByCapability
    ? "Unsupported trace result: Rust capability truth reports trace_flow as unsupported for the bounded language set."
    : "Unsupported trace result: Rust bridge capability routing does not expose trace_flow execution in this bounded contract.";

  return {
    answer: `Unsupported: ${conclusion}`,
    summary,
    conclusion,
    gaps,
    limitations: [conclusion],
    stopReason: !supportsTraceMethod ? "method_not_advertised" : "unsupported_language_capability",
  };
}

function capabilityStateRank(state: BridgeLanguageCapabilityState): number {
  if (state === "supported") {
    return 3;
  }
  if (state === "partial") {
    return 2;
  }
  if (state === "best-effort") {
    return 1;
  }
  return 0;
}

function assembleAskAnswer(input: {
  query: string;
  requestedQuestionClass: BridgeAskQueryClass;
  bridgeResult: BridgeAskResult;
}): {
  answer: string;
  answerType: KnowledgeAskAnswerType;
  answerState: BridgeAnswerState;
  evidence: KnowledgeAskEvidenceEntry[];
  rustEvidence: BridgeAskResult["evidence"];
  limitations: string[];
  questionClass: string;
  languageCapabilitySummary: BridgeLanguageCapabilitySummary | null;
} {
  const envelopeEvidence = input.bridgeResult.evidence?.evidence ?? [];
  const evidence: KnowledgeAskEvidenceEntry[] = envelopeEvidence.map((entry) => {
    return {
      filePath: entry.filePath,
      lineStart: entry.lineStart,
      lineEnd: entry.lineEnd,
      reason: entry.reason,
      sourceMethod: input.bridgeResult.method,
      source: entry.source,
      confidence: entry.confidence,
      kind: entry.kind,
      snippet: entry.snippet,
      symbol: entry.symbol,
      relationship:
        input.requestedQuestionClass === "graph_relationship_usage"
          ? "usage"
          : input.requestedQuestionClass === "graph_relationship_dependencies"
            ? "dependencies"
            : input.requestedQuestionClass === "graph_relationship_dependents"
              ? "dependents"
              : undefined,
    };
  });

  const limitations = [...(input.bridgeResult.evidence?.gaps ?? [])];
  if (!input.bridgeResult.evidence && input.bridgeResult.items.length > 0) {
    limitations.push(
      "Rust bridge returned preview items without a canonical evidence packet; preview rows are non-authoritative and cannot be used as proof.",
    );
  }
  if (input.bridgeResult.answerState === "grounded" && evidence.length === 0) {
    limitations.push("Rust answer state is grounded but no inspectable evidence entries were returned.");
  }
  if (input.bridgeResult.languageCapabilitySummary?.retrievalOnly) {
    limitations.push(
      "Result is retrieval-backed for this class and does not imply parser-backed relation proof.",
    );
  }

  const top = evidence[0];
  const topLocation = top
    ? typeof top.lineStart === "number" && typeof top.lineEnd === "number"
      ? `${top.filePath} [${top.lineStart}-${top.lineEnd}]`
      : top.filePath
    : "no location";

  const answerType = mapQuestionClassToAnswerType(
    input.bridgeResult.questionClass,
    input.bridgeResult.answerState,
  );
  const answerState = input.bridgeResult.answerState;

  let answer = "";
  if (input.bridgeResult.evidence?.conclusion) {
    answer = input.bridgeResult.evidence.conclusion;
  } else if (input.requestedQuestionClass === "search_file_discovery") {
    answer = top
      ? `Best file-discovery match: ${topLocation}.`
      : "Partial file-discovery answer: no concrete match returned.";
  } else if (input.requestedQuestionClass === "graph_definition") {
    answer = top
      ? `Best definition location: ${topLocation}.`
      : "Partial definition answer: no concrete definition location returned.";
  } else if (input.requestedQuestionClass === "graph_relationship_usage") {
    answer = top
      ? `Best one-hop usage match: ${topLocation}.`
      : "Partial usage answer: no concrete usage location returned.";
  } else if (input.requestedQuestionClass === "graph_relationship_dependencies") {
    answer = top
      ? `Best one-hop dependency match: ${topLocation}.`
      : "Partial dependencies answer: no concrete dependency edge returned.";
  } else {
    answer = top
      ? `Best one-hop dependent/importer match: ${topLocation}.`
      : "Partial dependents answer: no concrete dependent/import edge returned.";
  }

  if (answerState !== "grounded") {
    answer = `${capitalizeAnswerState(answerState)} answer: ${answer}`;
  }

  return {
    answer,
    answerType,
    answerState,
    evidence,
    rustEvidence: input.bridgeResult.evidence,
    limitations,
    questionClass: input.bridgeResult.questionClass,
    languageCapabilitySummary: input.bridgeResult.languageCapabilitySummary,
  };
}

function mapQuestionClassToAnswerType(
  questionClass: string,
  answerState: BridgeAnswerState,
): KnowledgeAskAnswerType {
  if (answerState === "unsupported") {
    return "unsupported";
  }
  if (answerState === "partial" || answerState === "insufficient") {
    return "partial";
  }

  if (questionClass === "definition") {
    return "definition";
  }
  if (questionClass === "references") {
    return "usage";
  }
  if (questionClass === "dependencies") {
    return "dependencies";
  }
  if (questionClass === "dependents") {
    return "dependents";
  }
  if (
    questionClass === "search_symbol"
    || questionClass === "search_file_discovery"
    || questionClass === "search_structural"
    || questionClass === "search_concept_relevance"
  ) {
    return "search_match";
  }

  return "search_match";
}

function capitalizeAnswerState(state: BridgeAnswerState): string {
  return `${state.charAt(0).toUpperCase()}${state.slice(1)}`;
}

function sanitizeToken(token?: string): string | undefined {
  if (!token) {
    return undefined;
  }
  return token.replace(/[.,;:!?]+$/g, "").trim();
}

function extractSymbolCandidate(query: string): string | undefined {
  const match = query.match(/[`"']([A-Za-z0-9_.$/-]+)[`"']/);
  if (match?.[1]) {
    return sanitizeToken(match[1]);
  }
  const fallback = query.match(/\b([A-Za-z_][A-Za-z0-9_.$]{2,})\b/g);
  if (!fallback || fallback.length === 0) {
    return undefined;
  }
  return sanitizeToken(fallback[fallback.length - 1]);
}

function extractPathCandidate(query: string): string | undefined {
  const quoted = query.match(/[`"']([^`"']+)[`"']/);
  if (quoted?.[1] && /\.[A-Za-z0-9]+$/.test(quoted[1])) {
    return sanitizeToken(quoted[1]);
  }

  const match = query.match(/([A-Za-z0-9_./-]+\.(?:ts|tsx|js|jsx|rs|json|md))/);
  if (match?.[1]) {
    return sanitizeToken(match[1]);
  }
  return undefined;
}

function toBridgeFailure(error: unknown): {
  code: BridgeFailureCode;
  phase: BridgeFailurePhase;
  message: string;
  retryable: boolean;
} {
  if (error instanceof DhBridgeError) {
    return {
      code: error.code,
      phase: error.phase,
      message: error.message,
      retryable: error.retryable,
    };
  }

  return {
    code: "REQUEST_FAILED",
    phase: "request",
    message: error instanceof Error ? error.message : "Unknown bridge error.",
    retryable: false,
  };
}

function assertNeverKnowledgeKind(value: never): never {
  throw new Error(`Unsupported knowledge command kind: ${String(value)}`);
}
