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
          },
        },
        answer: "Best file-discovery match: src/a.ts [1-10].",
        answerType: "search_match",
        grounding: "grounded",
        evidence: [
          {
            filePath: "src/a.ts",
            lineStart: 1,
            lineEnd: 10,
            reason: "match",
            sourceMethod: "query.search",
            snippet: "export const a = 1",
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
    expect(text).toContain("evidence:");
    expect(text).toContain("answer type: search_match");
    expect(text).toContain("grounding: grounded");
  });

  it("renders ask limitations when grounding is partial", () => {
    const text = renderKnowledgeCommandText(makeReport({
      answer: "Partial answer: Best definition location: a.ts [10-10].",
      answerType: "partial",
      grounding: "partial",
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

    expect(text).toContain("grounding: partial");
    expect(text).toContain("limitations:");
    expect(text).toContain("Multiple possible definition locations were returned.");
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
