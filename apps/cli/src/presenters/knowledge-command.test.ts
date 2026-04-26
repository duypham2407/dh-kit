import { describe, expect, it } from "vitest";
import { renderKnowledgeCommandJson, renderKnowledgeCommandText } from "./knowledge-command.js";
import type { KnowledgeCommandReport } from "../../../../packages/opencode-app/src/workflows/run-knowledge-command.js";

function makeReport(overrides?: Partial<KnowledgeCommandReport>): KnowledgeCommandReport {
  return {
    exitCode: 0,
    command: "ask",
    repo: "/tmp/repo",
    intent: "broad_codebase_question",
    tools: ["keyword_search", "semantic_search"],
    seedTerms: ["auth", "flow"],
    workspaceCount: 1,
    resultCount: 3,
    evidenceCount: 2,
    evidencePreview: ["evidence 1: src/a.ts [1-10] score=0.91 reason=match"],
    ...overrides,
  };
}

function makeBuildEvidenceReport(
  overrides?: Partial<KnowledgeCommandReport>,
  packetOverrides?: Partial<NonNullable<KnowledgeCommandReport["rustEvidence"]>>,
): KnowledgeCommandReport {
  const packet: NonNullable<KnowledgeCommandReport["rustEvidence"]> = {
    answerState: "grounded",
    questionClass: "build_evidence",
    subject: "auth",
    summary: "Auth build evidence summary from Rust.",
    conclusion: "Auth is grounded by Rust packet evidence.",
    evidence: [
      {
        kind: "symbol",
        filePath: "src/auth.ts",
        lineStart: 3,
        lineEnd: 18,
        reason: "Rust packet provenance",
        source: "graph",
        confidence: "grounded",
        symbol: "auth",
      },
    ],
    gaps: [],
    bounds: {
      traversalScope: "build_evidence",
      hopCount: 1,
      nodeLimit: 5,
    },
    ...packetOverrides,
  };

  return makeReport({
    intent: "bridge_query_build_evidence",
    tools: ["rust_bridge_jsonrpc"],
    resultCount: 1,
    evidenceCount: packet.evidence.length,
    evidencePreview: packet.evidence.map((entry) => `evidence 1: ${entry.filePath} via=query.buildEvidence reason=${entry.reason}`),
    answer: packet.answerState === "grounded" ? packet.conclusion : `${packet.answerState} answer: ${packet.conclusion}`,
    answerType: packet.answerState === "grounded" ? "build_evidence" : packet.answerState === "unsupported" ? "unsupported" : "partial",
    answerState: packet.answerState,
    questionClass: packet.questionClass,
    requestedQuestionClass: "graph_build_evidence",
    rustEvidence: packet,
    evidence: packet.evidence.map((entry) => ({
      filePath: entry.filePath,
      lineStart: entry.lineStart,
      lineEnd: entry.lineEnd,
      reason: entry.reason,
      sourceMethod: "query.buildEvidence",
      source: entry.source,
      confidence: entry.confidence,
      kind: entry.kind,
      symbol: entry.symbol,
    })),
    limitations: packet.gaps,
    bridgeEvidence: {
      enabled: true,
      startupSucceeded: true,
      method: "query.buildEvidence",
      seamMethod: "session.runCommand",
      delegatedMethod: "query.buildEvidence",
      requestId: 44,
      rustBacked: true,
      protocolVersion: "1",
    },
    hostLifecycle: {
      topology: "rust_host_ts_worker",
      supportBoundary: "knowledge_commands_first_wave",
      authorityOwner: "rust",
      workerRole: "typescript_worker",
      platform: "linux",
      workerState: "stopped",
      healthState: "healthy",
      failurePhase: "none",
      timeoutClass: "none",
      recoveryOutcome: "not_attempted",
      cleanupOutcome: "graceful",
      finalStatus: "clean_success",
      finalExitCode: 0,
    },
    ...overrides,
  });
}

describe("knowledge command presenters", () => {
  it("renders text output", () => {
    const text = renderKnowledgeCommandText(
      makeReport({
        sessionId: "knowledge-session-123",
        resumed: true,
        compaction: {
          attempted: true,
          overflow: true,
          compacted: true,
          continuationSummaryGeneratedInMemory: true,
          continuationSummaryPersisted: true,
        },
        persistence: {
          attempted: true,
          persisted: true,
        },
        bridgeEvidence: {
          enabled: true,
          startupSucceeded: true,
          method: "query.search",
          seamMethod: "session.runCommand",
          delegatedMethod: "query.search",
          requestId: 12,
          rustBacked: true,
          protocolVersion: "1",
          engine: {
            name: "dh-engine",
            version: "0.1.0",
          },
          capabilities: {
            protocolVersion: "1",
            methods: ["dh.initialize", "query.search", "query.definition", "query.relationship"],
            queryRelationship: {
              supportedRelations: ["usage", "dependencies", "dependents"],
            },
            languageCapabilityMatrix: [
              {
                language: "typescript",
                capability: "trace_flow",
                state: "unsupported",
                reason: "Trace flow remains outside bounded support for this release.",
                parserBacked: false,
              },
            ],
          },
        },
        executionBoundary: {
          path: "legacy_ts_host_bridge_compatibility",
          rustHosted: false,
          lifecycleAuthority: "not_claimed",
          label: "legacy_ts_host_bridge_compatibility_only",
          note: "legacy compatibility path",
        },
        hostLifecycle: {
          topology: "rust_host_ts_worker",
          supportBoundary: "knowledge_commands_first_wave",
          authorityOwner: "rust",
          workerRole: "typescript_worker",
          platform: "linux",
          workerState: "stopped",
          healthState: "healthy",
          failurePhase: "none",
          timeoutClass: "none",
          recoveryOutcome: "not_attempted",
          cleanupOutcome: "graceful",
          finalStatus: "clean_success",
          finalExitCode: 0,
          legacyPathLabel: "legacy_ts_host_bridge_compatibility_only",
        },
        answer: "Best file-discovery match: src/a.ts [1-10].",
        answerType: "search_match",
        answerState: "grounded",
        languageCapabilitySummary: {
          capability: "structural_indexing",
          weakestState: "partial",
          retrievalOnly: true,
          languages: [
            {
              language: "typescript",
              state: "supported",
              reason: "bounded search",
              parserBacked: false,
            },
          ],
        },
        rustEvidence: {
          answerState: "grounded",
          questionClass: "find_symbol",
          subject: "auth",
          summary: "search results",
          conclusion: "grounded symbol search evidence available",
          evidence: [
            {
              kind: "definition",
              filePath: "src/a.ts",
              lineStart: 1,
              lineEnd: 10,
              reason: "match",
              source: "storage",
              confidence: "grounded",
            },
          ],
          gaps: [],
          bounds: {
            hopCount: 0,
            traversalScope: "search_symbol",
          },
        },
        evidence: [
          {
            filePath: "src/a.ts",
            lineStart: 1,
            lineEnd: 10,
            reason: "match",
            sourceMethod: "query.search",
            snippet: "export const a = 1",
            source: "storage",
            confidence: "grounded",
            kind: "definition",
          },
        ],
      }),
    );
    expect(text).toContain("command: ask");
    expect(text).toContain("evidence count: 2");
    expect(text).toContain("session id: knowledge-session-123");
    expect(text).toContain("compaction applied: true");
    expect(text).toContain("continuation summary persisted: true");
    expect(text).toContain("runtime persistence succeeded: true");
    expect(text).toContain("bridge enabled: true");
    expect(text).toContain("bridge startup succeeded: true");
    expect(text).toContain("bridge rust backed: true");
    expect(text).toContain("bridge method: query.search");
    expect(text).toContain("bridge seam method: session.runCommand");
    expect(text).toContain("bridge delegated method: query.search");
    expect(text).toContain("bridge request id: 12");
    expect(text).toContain("bridge protocol version: 1");
    expect(text).toContain("bridge capability protocol: 1");
    expect(text).toContain("bridge capability methods: dh.initialize, query.search, query.definition, query.relationship");
    expect(text).toContain("bridge capability relationship relations: usage, dependencies, dependents");
    expect(text).toContain("execution boundary:");
    expect(text).toContain("path: legacy_ts_host_bridge_compatibility");
    expect(text).toContain("lifecycle authority: not_claimed");
    expect(text).toContain("rust host lifecycle:");
    expect(text).toContain("topology: rust_host_ts_worker");
    expect(text).toContain("final status: clean_success");
    expect(text).toContain("answer:");
    expect(text).toContain("Best file-discovery match");
    expect(text).toContain("state:");
    expect(text).toContain("answer state: grounded");
    expect(text).toContain("capability:");
    expect(text).toContain("weakest state: partial");
    expect(text).toContain("retrieval only: true");
    expect(text).toContain("evidence:");
    expect(text).toContain("answer type: search_match");
    expect(text).toContain("confidence=grounded");
    expect(text).toContain("rust packet:");
    expect(text).toContain("subject: auth");
  });

  it("renders grounded build-evidence packet state, provenance, and lifecycle separately", () => {
    const text = renderKnowledgeCommandText(makeBuildEvidenceReport());

    expect(text).toContain("answer state: grounded");
    expect(text).toContain("answer type: build_evidence");
    expect(text).toContain("rust packet:");
    expect(text).toContain("question class: build_evidence");
    expect(text).toContain("authority: canonical Rust-authored query.buildEvidence packet for bounded Rust-hosted broad ask");
    expect(text).toContain("legacy packet boundary: legacy retrieval/TypeScript-hosted packets are non-canonical for this flow");
    expect(text).toContain("subject: auth");
    expect(text).toContain("Rust packet provenance");
    expect(text).toContain("source=graph");
    expect(text).toContain("confidence=grounded");
    expect(text).toContain("gaps:");
    expect(text).toContain("bounds:");
    expect(text).toContain("traversal scope: build_evidence");
    expect(text).toContain("rust host lifecycle:");
    expect(text).toContain("final status: clean_success");
  });

  it("renders partial build-evidence without hiding useful evidence or gaps", () => {
    const text = renderKnowledgeCommandText(makeBuildEvidenceReport({}, {
      answerState: "partial",
      conclusion: "Auth is only partially grounded by Rust packet evidence.",
      evidence: [
        {
          kind: "symbol",
          filePath: "src/auth.ts",
          lineStart: 4,
          lineEnd: 12,
          reason: "partial Rust packet evidence",
          source: "graph",
          confidence: "partial",
          symbol: "auth",
        },
      ],
      gaps: ["ambiguous auth wiring remains"],
      bounds: {
        traversalScope: "build_evidence",
        hopCount: 1,
        nodeLimit: 5,
        stopReason: "ambiguous_target",
      },
    }));

    expect(text).toContain("answer state: partial");
    expect(text).toContain("partial Rust packet evidence");
    expect(text).toContain("ambiguous auth wiring remains");
    expect(text).toContain("stop reason: ambiguous_target");
    expect(text).toContain("final status: clean_success");
  });

  it("renders insufficient build-evidence as non-grounded with gaps and no evidence", () => {
    const text = renderKnowledgeCommandText(makeBuildEvidenceReport({}, {
      answerState: "insufficient",
      conclusion: "Missing indexed proof prevents a grounded auth answer.",
      evidence: [],
      gaps: ["no indexed evidence proved auth"],
      bounds: {
        traversalScope: "build_evidence",
        stopReason: "insufficient_evidence",
      },
    }));

    expect(text).toContain("answer state: insufficient");
    expect(text).toContain("answer type: partial");
    expect(text).toContain("  evidence:\n    - (none)");
    expect(text).toContain("no indexed evidence proved auth");
    expect(text).toContain("stop reason: insufficient_evidence");
    expect(text).toContain("final status: clean_success");
  });

  it("renders unsupported build-evidence as unsupported packet truth despite lifecycle success", () => {
    const text = renderKnowledgeCommandText(makeBuildEvidenceReport({}, {
      answerState: "unsupported",
      conclusion: "Auth evidence is unsupported across the bounded Rust packet contract.",
      evidence: [],
      gaps: ["unsupported language or capability boundary prevents canonical packet proof"],
      bounds: {
        traversalScope: "build_evidence",
        stopReason: "unsupported_language_capability",
      },
    }));

    expect(text).toContain("answer state: unsupported");
    expect(text).toContain("answer type: unsupported");
    expect(text).toContain("unsupported language or capability boundary prevents canonical packet proof");
    expect(text).toContain("stop reason: unsupported_language_capability");
    expect(text).toContain("rust host lifecycle:");
    expect(text).toContain("final status: clean_success");
    expect(text).not.toContain("runtime tracing is supported");
  });

  it("renders ask limitations when grounding is partial", () => {
    const text = renderKnowledgeCommandText(makeReport({
      answer: "Partial answer: Best definition location: a.ts [10-10].",
      answerType: "partial",
      answerState: "partial",
      evidence: [
        {
          filePath: "a.ts",
          lineStart: 10,
          lineEnd: 10,
          reason: "candidate",
          sourceMethod: "query.definition",
        },
      ],
      limitations: ["Multiple possible definition locations were returned."],
    }));

    expect(text).toContain("answer state: partial");
    expect(text).toContain("limitations:");
    expect(text).toContain("Multiple possible definition locations were returned.");
  });

  it("renders explain answer-state/evidence/capability sections", () => {
    const text = renderKnowledgeCommandText(makeReport({
      command: "explain",
      intent: "bridge_query_definition",
      tools: ["rust_bridge_jsonrpc"],
      answer: "Definition found at packages/opencode-app/src/workflows/run-knowledge-command.ts:111",
      answerType: "definition",
      answerState: "grounded",
      rustEvidence: {
        answerState: "grounded",
        questionClass: "definition",
        subject: "runKnowledgeCommand",
        summary: "Definition located",
        conclusion: "Definition found at packages/opencode-app/src/workflows/run-knowledge-command.ts:111",
        evidence: [
          {
            kind: "definition",
            filePath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
            lineStart: 111,
            lineEnd: 117,
            reason: "symbol definition",
            source: "storage",
            confidence: "grounded",
          },
        ],
        gaps: [],
        bounds: {
          traversalScope: "goto_definition",
          hopCount: 0,
        },
      },
      evidence: [
        {
          filePath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
          lineStart: 111,
          lineEnd: 117,
          reason: "symbol definition",
          sourceMethod: "query.definition",
          source: "storage",
          confidence: "grounded",
          kind: "definition",
        },
      ],
      languageCapabilitySummary: {
        capability: "definition_lookup",
        weakestState: "supported",
        retrievalOnly: false,
        languages: [
          {
            language: "typescript",
            state: "supported",
            reason: "parser-backed",
            parserBacked: true,
          },
        ],
      },
    }));

    expect(text).toContain("command: explain");
    expect(text).toContain("intent: bridge_query_definition");
    expect(text).toContain("answer:");
    expect(text).toContain("answer state: grounded");
    expect(text).toContain("answer type: definition");
    expect(text).toContain("capability:");
    expect(text).toContain("capability: definition_lookup");
    expect(text).toContain("evidence:");
    expect(text).toContain("via=query.definition");
    expect(text).toContain("rust packet:");
  });

  it("renders failure text output", () => {
    const text = renderKnowledgeCommandText(makeReport({
      exitCode: 1,
      message: "missing input",
      bridgeEvidence: {
        enabled: true,
        startupSucceeded: false,
        rustBacked: false,
        failure: {
          code: "BRIDGE_STARTUP_FAILED",
          phase: "startup",
          message: "spawn failed",
          retryable: false,
        },
      },
    }));
    expect(text).toContain("missing input");
    expect(text).toContain("bridge failure code: BRIDGE_STARTUP_FAILED");
    expect(text).toContain("bridge failure phase: startup");
  });

  it("renders json payload", () => {
    const json = renderKnowledgeCommandJson(makeReport());
    const parsed = JSON.parse(json) as KnowledgeCommandReport;
    expect(parsed.command).toBe("ask");
    expect(parsed.tools.length).toBeGreaterThan(0);
  });
});
