import { KnowledgeCommandSessionBridge } from "../../../runtime/src/session/knowledge-command-session-bridge.js";
import {
  type BridgeAnswerState,
  type BridgeAskRequest,
  type BridgeAskResult,
  type BridgeClient,
  type BridgeAskQueryClass,
  type BridgeInitializeCapabilities,
  type BridgeSessionDelegatedMethod,
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
  | "build_evidence"
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
    | "graph_build_evidence"
    | "unsupported";
  languageCapabilitySummary?: BridgeLanguageCapabilitySummary | null;
  bridgeEvidence?: {
    enabled: boolean;
    startupSucceeded: boolean;
    method?: string;
    seamMethod?: "direct.query" | "session.runCommand";
    delegatedMethod?: BridgeSessionDelegatedMethod;
    requestId?: number;
    rustBacked: boolean;
    protocolVersion?: string;
    engine?: {
      name: string;
      version: string;
    };
    capabilities?: {
      protocolVersion: BridgeInitializeCapabilities["protocolVersion"];
      methods: BridgeInitializeCapabilities["methods"];
      queryRelationship: BridgeInitializeCapabilities["queryRelationship"];
      languageCapabilityMatrix: BridgeInitializeCapabilities["languageCapabilityMatrix"];
    };
    failure?: {
      code: BridgeFailureCode;
      phase: BridgeFailurePhase;
      message: string;
      retryable: boolean;
    };
  };
  executionBoundary?: KnowledgeCommandExecutionBoundary;
  hostLifecycle?: RustHostLifecycleMetadata;
};

export type KnowledgeCommandExecutionBoundary = {
  path: "rust_hosted_first_wave" | "legacy_ts_host_bridge_compatibility";
  rustHosted: boolean;
  lifecycleAuthority: "rust" | "not_claimed";
  label: string;
  note: string;
};

export type RustHostLifecycleMetadata = {
  topology: "rust_host_ts_worker";
  supportBoundary: "knowledge_commands_first_wave";
  authorityOwner: "rust";
  workerRole: "typescript_worker";
  platform: string;
  workerState: string;
  healthState: string;
  failurePhase: string;
  timeoutClass: string;
  recoveryOutcome: string;
  cleanupOutcome: string;
  finalStatus: string;
  finalExitCode: number;
  legacyPathLabel?: "legacy_ts_host_bridge_compatibility_only";
  launchabilityIssue?: string;
};

type AskQuestionClassification = {
  queryClass: BridgeAskQueryClass | "unsupported";
  symbol?: string;
  targetPath?: string;
  targets?: string[];
  unsupportedReason?: string;
  unsupportedLimitations?: string[];
};

type BroadUnderstandingClassification =
  | { status: "supported"; subject: string }
  | { status: "unsupported"; reason: string }
  | { status: "not_broad" };

export const LEGACY_TS_HOST_KNOWLEDGE_BOUNDARY: KnowledgeCommandExecutionBoundary = {
  path: "legacy_ts_host_bridge_compatibility",
  rustHosted: false,
  lifecycleAuthority: "not_claimed",
  label: "legacy_ts_host_bridge_compatibility_only",
  note: "This TypeScript CLI path may spawn the legacy Rust bridge for query evidence; it is not the Rust-host lifecycle-authoritative first-wave path.",
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
      executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
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
      executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
    };
  }

  const guidance: string[] = [];

  if (input.kind === "ask" || input.kind === "explain") {
    const requestedQuestionClass =
      input.kind === "ask"
        ? classifyAskQuestion(input.input)
        : classifyExplainQuestion(input.input);

    if (requestedQuestionClass.queryClass === "unsupported") {
      const unsupportedTruth = unsupportedAskTruth(requestedQuestionClass);
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
        answer: unsupportedTruth.answer,
        answerType: "unsupported",
        answerState: "unsupported",
        evidence: [],
        limitations: unsupportedTruth.limitations,
        questionClass: "unsupported",
        requestedQuestionClass: "unsupported",
        languageCapabilitySummary: null,
        executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
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
      const bridgeRequest: BridgeAskRequest = {
        query: input.input,
        repoRoot: input.repoRoot,
        queryClass: requestedQuestionClass.queryClass,
        symbol: requestedQuestionClass.symbol,
        targetPath: requestedQuestionClass.targetPath,
        intent: requestedQuestionClass.queryClass === "graph_build_evidence" ? "explain" : undefined,
        targets: requestedQuestionClass.targets,
        freshness: requestedQuestionClass.queryClass === "graph_build_evidence" ? "indexed" : undefined,
        limit: 5,
      };

      const bridgeResult = await runBridgeAskQuery({
        bridgeClient,
        request: bridgeRequest,
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
        executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: true,
          method: bridgeResult.method,
          seamMethod: bridgeResult.seamMethod,
          delegatedMethod: bridgeResult.delegatedMethod,
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
      guidance.push("Run: dh --help to confirm available commands.");
      guidance.push("Run: dh status to check workspace/index state.");

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
        executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
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
        executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
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
      guidance.push("Run: dh --help to confirm available commands.");
      guidance.push("Run: dh status to check workspace/index state.");

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
        executionBoundary: legacyBoundaryForDirectTsHost(input.bridgeClientFactory),
      };
    } finally {
      await bridgeClient.close();
    }
  }

  return assertNeverKnowledgeKind(input.kind);
}

function classifyAskQuestion(query: string): AskQuestionClassification {
  const q = query.trim();
  const lowered = q.toLowerCase();

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

  const unsupportedBoundary = classifyUnsupportedAskBoundary(q, lowered);
  if (unsupportedBoundary) {
    return unsupportedBoundary;
  }

  const broadUnderstanding = classifyBroadUnderstandingAsk(q);
  if (broadUnderstanding.status === "supported") {
    return {
      queryClass: "graph_build_evidence",
      targets: [broadUnderstanding.subject],
    };
  }
  if (broadUnderstanding.status === "unsupported") {
    return unsupportedAskClassification(broadUnderstanding.reason);
  }

  return { queryClass: "unsupported" };
}

function unsupportedAskTruth(classification: AskQuestionClassification): {
  answer: string;
  limitations: string[];
} {
  const reason = classification.unsupportedReason
    ?? "this question falls outside the bounded Rust-hosted ask classes.";
  return {
    answer: `Unsupported: ${reason}`,
    limitations: classification.unsupportedLimitations ?? [
      "Rust-hosted first-wave ask supports search-aware file discovery, graph-aware definition/location, graph-aware one-hop usage/dependency/import relationships, and bounded broad understanding through Rust-authored query.buildEvidence packets.",
      "No TypeScript-composed canonical evidence packet fallback was used for this unsupported request.",
    ],
  };
}

function classifyUnsupportedAskBoundary(
  _query: string,
  lowered: string,
): AskQuestionClassification | null {
  if (/\b(runtime\s+trac(?:e|ing)|trace\s+flow)\b/.test(lowered)) {
    return unsupportedAskClassification(
      "runtime tracing and trace-flow execution are outside bounded Rust-hosted build-evidence support.",
    );
  }
  if (/\b(debug(?:ger|ging)?|profil(?:e|ing|er))\b/.test(lowered)) {
    return unsupportedAskClassification(
      "runtime debugging and profiling requests are outside the static repository-understanding ask contract.",
    );
  }
  if (/\bimpact\s+analysis\b/.test(lowered)) {
    return unsupportedAskClassification(
      "impact-analysis requests are not part of the bounded broad-understanding ask contract.",
    );
  }
  if (/\bimpact\s+of\b/.test(lowered) || /\b(?:could|would)\s+break\b/.test(lowered)) {
    return unsupportedAskClassification(
      "impact-analysis requests are not part of the bounded broad-understanding ask contract.",
    );
  }
  if (/\bcall\s+hierarchy\b/.test(lowered)) {
    return unsupportedAskClassification(
      "call-hierarchy requests remain outside this bounded broad-understanding ask route.",
    );
  }
  if (/\bmulti[-\s]?hop\b/.test(lowered)) {
    return unsupportedAskClassification(
      "multi-hop path exploration is outside first-wave Rust-hosted build-evidence support.",
    );
  }
  if (/\b(?:entire|whole)\s+(?:subsystem|system|codebase|repo|repository|project)\b/.test(lowered)) {
    return unsupportedAskClassification(
      "unbounded subsystem or repository-wide requests need a finite subject before build evidence can be safe.",
    );
  }
  if (/\b(?:everything|all\s+behaviou?r)\b/.test(lowered)) {
    return unsupportedAskClassification(
      "unbounded broad-understanding requests need a finite subject before build evidence can be safe.",
    );
  }

  return null;
}

function unsupportedAskClassification(reason: string): AskQuestionClassification {
  return {
    queryClass: "unsupported",
    unsupportedReason: reason,
    unsupportedLimitations: [
      reason,
      "Bounded broad ask requires a finite static repository subject and Rust-authored query.buildEvidence packet truth.",
      "No TypeScript-composed canonical evidence packet fallback was used.",
    ],
  };
}

function classifyBroadUnderstandingAsk(query: string): BroadUnderstandingClassification {
  const normalized = query.trim().replace(/\s+/g, " ");
  const broadPatterns = [
    /^how\s+does\s+(.+?)\s+works?(?:\s+(?:in|inside|within|for)\b.*)?\??$/i,
    /^how\s+is\s+(.+?)\s+(?:implemented|wired)(?:\s+(?:in|inside|within|for)\b.*)?\??$/i,
    /^what\s+is\s+the\s+(.+?)\s+flow(?:\s+(?:in|inside|within|for)\b.*)?\??$/i,
    /^explain\s+how\s+(.+?)\s+works?(?:\s+(?:in|inside|within|for)\b.*)?\??$/i,
  ];

  for (const pattern of broadPatterns) {
    const match = normalized.match(pattern);
    if (!match?.[1]) {
      continue;
    }

    const subject = sanitizeBroadUnderstandingSubject(match[1]);
    if (!subject) {
      return {
        status: "unsupported",
        reason: "bounded broad-understanding asks need a finite static repository subject.",
      };
    }

    if (isUnboundedBroadUnderstandingSubject(subject)) {
      return {
        status: "unsupported",
        reason: "unbounded broad-understanding requests need a finite subject before build evidence can be safe.",
      };
    }

    return { status: "supported", subject };
  }

  return { status: "not_broad" };
}

function sanitizeBroadUnderstandingSubject(raw: string): string | undefined {
  const withoutQuotes = raw
    .replace(/^[`"']+|[`"']+$/g, "")
    .replace(/[.,;:!?]+$/g, "")
    .trim()
    .replace(/^(?:the|a|an)\s+/i, "")
    .trim();
  if (!withoutQuotes) {
    return undefined;
  }
  return withoutQuotes;
}

function isUnboundedBroadUnderstandingSubject(subject: string): boolean {
  const lowered = subject.toLowerCase();
  if (
    lowered === "it"
    || lowered === "this"
    || lowered === "that"
    || lowered === "system"
    || lowered === "subsystem"
    || lowered === "codebase"
    || lowered === "repo"
    || lowered === "repository"
    || lowered === "project"
    || lowered === "everything"
  ) {
    return true;
  }

  return /^(?:all|entire|whole)\b/.test(lowered);
}

function classifyExplainQuestion(query: string): {
  queryClass: "graph_definition";
  symbol?: string;
  targetPath?: string;
  targets?: string[];
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
  | "bridge_query_relationship"
  | "bridge_query_build_evidence" {
  if (method === "query.definition") {
    return "bridge_query_definition";
  }
  if (method === "query.relationship") {
    return "bridge_query_relationship";
  }
  if (method === "query.buildEvidence") {
    return "bridge_query_build_evidence";
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

function runBridgeAskQuery(input: {
  bridgeClient: BridgeClient;
  request: BridgeAskRequest;
}): Promise<BridgeAskResult> {
  if (
    isFirstWaveDelegatedQuestionClass(input.request.queryClass)
    && input.bridgeClient.runSessionCommand
  ) {
    return input.bridgeClient.runSessionCommand(input.request);
  }

  return input.bridgeClient.runAskQuery(input.request);
}

function legacyBoundaryForDirectTsHost(
  bridgeClientFactory: ((repoRoot: string) => BridgeClient) | undefined,
): KnowledgeCommandExecutionBoundary | undefined {
  return bridgeClientFactory ? undefined : LEGACY_TS_HOST_KNOWLEDGE_BOUNDARY;
}

function isFirstWaveDelegatedQuestionClass(queryClass: string): queryClass is BridgeAskQueryClass {
  return queryClass === "search_file_discovery"
    || queryClass === "graph_definition"
    || queryClass === "graph_relationship_usage"
    || queryClass === "graph_relationship_dependencies"
    || queryClass === "graph_relationship_dependents"
    || queryClass === "graph_build_evidence";
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
  const rustEvidence = input.bridgeResult.evidence;
  const missingBuildEvidencePacket = input.requestedQuestionClass === "graph_build_evidence" && !rustEvidence;
  const envelopeEvidence = rustEvidence?.evidence ?? [];
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
  const groundedBuildEvidenceWithoutEntries = input.requestedQuestionClass === "graph_build_evidence"
    && rustEvidence?.answerState === "grounded"
    && evidence.length === 0;

  const answerState = missingBuildEvidencePacket || groundedBuildEvidenceWithoutEntries
    ? "insufficient"
    : rustEvidence?.answerState ?? input.bridgeResult.answerState;
  const questionClass = rustEvidence?.questionClass
    ?? (input.requestedQuestionClass === "graph_build_evidence" ? "build_evidence" : input.bridgeResult.questionClass);
  const limitations = [...(rustEvidence?.gaps ?? [])];
  if (missingBuildEvidencePacket) {
    limitations.push(
      "Rust build-evidence packet was missing; preview rows are non-authoritative and cannot ground this answer.",
    );
  }
  if (groundedBuildEvidenceWithoutEntries) {
    limitations.push(
      "Rust build-evidence packet was grounded but returned no inspectable evidence entries; final answer is insufficient.",
    );
  }
  if (rustEvidence && rustEvidence.answerState !== input.bridgeResult.answerState) {
    limitations.push(
      `Rust packet answerState '${rustEvidence.answerState}' was preserved over bridge envelope answerState '${input.bridgeResult.answerState}'.`,
    );
  }
  if (rustEvidence && rustEvidence.questionClass !== input.bridgeResult.questionClass) {
    limitations.push(
      `Rust packet questionClass '${rustEvidence.questionClass}' was preserved over bridge envelope questionClass '${input.bridgeResult.questionClass}'.`,
    );
  }
  if (!rustEvidence && input.bridgeResult.items.length > 0) {
    limitations.push(
      "Rust bridge returned preview items without a canonical evidence packet; preview rows are non-authoritative and cannot be used as proof.",
    );
  }
  if (answerState === "grounded" && evidence.length === 0) {
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
    questionClass,
    answerState,
  );

  let answer = "";
  if (missingBuildEvidencePacket) {
    answer = "Rust build-evidence packet was missing; preview rows are non-authoritative and cannot ground this answer.";
  } else if (groundedBuildEvidenceWithoutEntries) {
    answer = "Rust build-evidence packet was grounded but returned no inspectable evidence entries; final answer is insufficient.";
  } else if (rustEvidence?.conclusion) {
    answer = rustEvidence.conclusion;
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
    rustEvidence,
    limitations,
    questionClass,
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
  if (questionClass === "build_evidence") {
    return answerState === "grounded" ? "build_evidence" : "partial";
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
