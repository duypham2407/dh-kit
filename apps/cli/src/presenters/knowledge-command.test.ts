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
    expect(text).toContain("bridge request id: 12");
    expect(text).toContain("bridge protocol version: 1");
    expect(text).toContain("bridge capability protocol: 1");
    expect(text).toContain("bridge capability methods: dh.initialize, query.search, query.definition, query.relationship");
    expect(text).toContain("bridge capability relationship relations: usage, dependencies, dependents");
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
    expect(text).toContain("rust envelope:");
    expect(text).toContain("subject: auth");
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
    expect(text).toContain("rust envelope:");
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
