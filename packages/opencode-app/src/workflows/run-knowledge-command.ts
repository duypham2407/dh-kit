import { runRetrieval } from "../../../retrieval/src/query/run-retrieval.js";
import { ChunksRepo } from "../../../storage/src/sqlite/repositories/chunks-repo.js";
import { EmbeddingsRepo } from "../../../storage/src/sqlite/repositories/embeddings-repo.js";
import { KnowledgeCommandSessionBridge } from "../../../runtime/src/session/knowledge-command-session-bridge.js";
import {
  type BridgeClient,
  type BridgeAskQueryClass,
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

export type KnowledgeAskGrounding = "grounded" | "partial" | "unsupported";

export type KnowledgeAskEvidenceEntry = {
  filePath: string;
  lineStart: number;
  lineEnd: number;
  reason: string;
  sourceMethod: string;
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
  grounding?: KnowledgeAskGrounding;
  evidence?: KnowledgeAskEvidenceEntry[];
  limitations?: string[];
  questionClass?:
    | "search_file_discovery"
    | "graph_definition"
    | "graph_relationship_usage"
    | "graph_relationship_dependencies"
    | "graph_relationship_dependents"
    | "unsupported";
  bridgeEvidence?: {
    enabled: boolean;
    startupSucceeded: boolean;
    method?: string;
    requestId?: number;
    rustBacked: boolean;
    engine?: {
      name: string;
      version: string;
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

  if (input.kind === "ask") {
    const askPlan = classifyAskQuestion(input.input);
    if (askPlan.queryClass === "unsupported") {
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
        grounding: "unsupported",
        evidence: [],
        limitations: unsupportedLimitations,
        questionClass: "unsupported",
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
        queryClass: askPlan.queryClass,
        symbol: askPlan.symbol,
        targetPath: askPlan.targetPath,
        limit: 5,
      });

      const assembled = assembleAskAnswer({
        query: input.input,
        questionClass: askPlan.queryClass,
        bridgeResult,
      });

      const evidencePreview = bridgeResult.items.slice(0, 3).map((item, index) => {
        return `evidence ${index + 1}: ${item.filePath} [${item.lineStart}-${item.lineEnd}] score=${item.score.toFixed(2)} reason=${item.reason}`;
      });

      return {
        exitCode: 0,
        command: input.kind,
        repo: input.repoRoot,
        intent: "bridge_query_search",
        tools: ["rust_bridge_jsonrpc"],
        seedTerms: input.input.split(/\s+/).filter((value) => value.length > 0).slice(0, 6),
        workspaceCount: 1,
        resultCount: bridgeResult.items.length,
        evidenceCount: bridgeResult.items.length,
        evidencePreview,
        sessionId: resolved.session.sessionId,
        resumed: resolved.resumed,
        compaction: resolved.compaction,
        persistence: resolved.persistence,
        guidance,
        answer: assembled.answer,
        answerType: assembled.answerType,
        grounding: assembled.grounding,
        evidence: assembled.evidence,
        limitations: assembled.limitations,
        questionClass: askPlan.queryClass,
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: true,
          method: bridgeResult.method,
          requestId: bridgeResult.requestId,
          rustBacked: true,
          engine: {
            name: bridgeResult.engineName,
            version: bridgeResult.engineVersion,
          },
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

  const retrieval = await runRetrieval({
    repoRoot: input.repoRoot,
    query: input.input,
    mode: input.kind,
    semanticMode: "always",
  });

  if (retrieval.results.length === 0) {
    let chunkCount = 0;
    let embeddingCount = 0;
    try {
      chunkCount = new ChunksRepo(input.repoRoot).count();
      embeddingCount = new EmbeddingsRepo(input.repoRoot).countByModel("text-embedding-3-small");
    } catch {
      // ignore guidance probe failures
    }

    if (chunkCount === 0) {
      guidance.push(`No indexed chunks found. Run: dh index`);
    } else if (embeddingCount === 0) {
      guidance.push(`Chunks exist but no embeddings were found. Run: dh index`);
    }

    guidance.push(`Try a more specific query or symbol name.`);
    guidance.push(`Check runtime health with: dh doctor`);
  }

  return {
    exitCode: 0,
    command: input.kind,
    repo: input.repoRoot,
    intent: retrieval.plan.intent,
    tools: retrieval.plan.selectedTools,
    seedTerms: retrieval.plan.seedTerms,
    workspaceCount: retrieval.workspaces.length,
    resultCount: retrieval.results.length,
    evidenceCount: retrieval.evidencePackets.length,
    evidencePreview: retrieval.evidencePackets.slice(0, 3).map((packet, index) => {
      return `evidence ${index + 1}: ${packet.filePath} [${packet.lines[0]}-${packet.lines[1]}] score=${packet.score.toFixed(2)} reason=${packet.reason}`;
    }),
    sessionId: resolved.session.sessionId,
    resumed: resolved.resumed,
    compaction: resolved.compaction,
    persistence: resolved.persistence,
    guidance,
    bridgeEvidence: {
      enabled: false,
      startupSucceeded: false,
      rustBacked: false,
    },
  };
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

function assembleAskAnswer(input: {
  query: string;
  questionClass: BridgeAskQueryClass;
  bridgeResult: {
    method: "query.search" | "query.definition" | "query.relationship";
    evidenceType: "search_match" | "definition" | "usage" | "dependencies" | "dependents";
    items: Array<{
      filePath: string;
      lineStart: number;
      lineEnd: number;
      snippet: string;
      reason: string;
      score: number;
    }>;
  };
}): {
  answer: string;
  answerType: KnowledgeAskAnswerType;
  grounding: KnowledgeAskGrounding;
  evidence: KnowledgeAskEvidenceEntry[];
  limitations: string[];
} {
  const evidence: KnowledgeAskEvidenceEntry[] = input.bridgeResult.items.map((item) => {
    return {
      filePath: item.filePath,
      lineStart: item.lineStart,
      lineEnd: item.lineEnd,
      reason: item.reason,
      sourceMethod: input.bridgeResult.method,
      snippet: item.snippet,
      score: item.score,
      symbol: extractSymbolFromSnippet(item.snippet),
      relationship:
        input.questionClass === "graph_relationship_usage"
          ? "usage"
          : input.questionClass === "graph_relationship_dependencies"
            ? "dependencies"
            : input.questionClass === "graph_relationship_dependents"
              ? "dependents"
              : undefined,
    };
  });

  const limitations: string[] = [];
  const top = evidence[0];
  const next = evidence[1];

  let grounding: KnowledgeAskGrounding = "grounded";
  if (!top) {
    grounding = "partial";
    limitations.push("No bridge evidence items were returned.");
  }
  if (top && top.score !== undefined && top.score < 0.75) {
    grounding = "partial";
    limitations.push("Best match has low confidence score.");
  }
  if (top && next && top.score !== undefined && next.score !== undefined && Math.abs(top.score - next.score) < 0.04) {
    grounding = "partial";
    limitations.push("Top evidence candidates are close in score (ambiguous best match).");
  }
  if (input.questionClass === "graph_definition" && evidence.length > 1) {
    grounding = "partial";
    limitations.push("Multiple possible definition locations were returned.");
  }

  const topLocation = top ? `${top.filePath} [${top.lineStart}-${top.lineEnd}]` : "no location";
  const answerType = grounding === "partial" ? "partial" : input.bridgeResult.evidenceType;

  let answer = "";
  if (input.questionClass === "search_file_discovery") {
    answer = top
      ? `Best file-discovery match: ${topLocation}.`
      : "Partial file-discovery answer: no concrete match returned.";
  } else if (input.questionClass === "graph_definition") {
    answer = top
      ? `Best definition location: ${topLocation}.`
      : "Partial definition answer: no concrete definition location returned.";
  } else if (input.questionClass === "graph_relationship_usage") {
    answer = top
      ? `Best one-hop usage match: ${topLocation}.`
      : "Partial usage answer: no concrete usage location returned.";
  } else if (input.questionClass === "graph_relationship_dependencies") {
    answer = top
      ? `Best one-hop dependency match: ${topLocation}.`
      : "Partial dependencies answer: no concrete dependency edge returned.";
  } else {
    answer = top
      ? `Best one-hop dependent/importer match: ${topLocation}.`
      : "Partial dependents answer: no concrete dependent/import edge returned.";
  }

  if (grounding === "partial") {
    answer = `Partial answer: ${answer}`;
  }

  return {
    answer,
    answerType,
    grounding,
    evidence,
    limitations,
  };
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

function extractSymbolFromSnippet(snippet: string): string | undefined {
  const explicit = snippet.match(/(?:function|class|type|interface|const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)/);
  if (explicit?.[1]) {
    return explicit[1];
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
