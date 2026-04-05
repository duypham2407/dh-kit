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
    const text = renderKnowledgeCommandText(makeReport());
    expect(text).toContain("command: ask");
    expect(text).toContain("evidence count: 2");
  });

  it("renders failure text output", () => {
    const text = renderKnowledgeCommandText(makeReport({ exitCode: 1, message: "missing input" }));
    expect(text).toBe("missing input");
  });

  it("renders json payload", () => {
    const json = renderKnowledgeCommandJson(makeReport());
    const parsed = JSON.parse(json) as KnowledgeCommandReport;
    expect(parsed.command).toBe("ask");
    expect(parsed.tools.length).toBeGreaterThan(0);
  });
});
