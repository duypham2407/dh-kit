import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase, openDhDatabase } from "../../../storage/src/sqlite/db.js";
import { runKnowledgeCommand } from "./run-knowledge-command.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import {
  DhBridgeError,
  type BridgeAskResult,
  type BridgeClient,
  type BridgeInitializeCapabilities,
  type BridgeInitializeSnapshot,
} from "../bridge/dh-jsonrpc-stdio-client.js";

let repos: string[] = [];

const v2Capabilities: BridgeInitializeCapabilities = {
  protocolVersion: "1",
  methods: ["dh.initialize", "query.search", "query.definition", "query.relationship"] as const,
  queryRelationship: {
    supportedRelations: ["usage", "dependencies", "dependents"] as const,
  },
  languageCapabilityMatrix: [
    {
      language: "typescript",
      capability: "trace_flow",
      state: "unsupported",
      reason: "Trace flow remains outside bounded support for this release.",
      parserBacked: false,
    },
    {
      language: "python",
      capability: "trace_flow",
      state: "unsupported",
      reason: "Trace flow remains outside bounded support for this release.",
      parserBacked: false,
    },
  ],
};

function makeInitializeSnapshot(): BridgeInitializeSnapshot {
  return {
    engineName: "dh-engine",
    engineVersion: "0.1.0",
    protocolVersion: "1",
    capabilities: v2Capabilities,
  };
}

function makeBridgeAskResult(overrides: Partial<BridgeAskResult> & Pick<BridgeAskResult, "method">): BridgeAskResult {
  return {
    method: overrides.method,
    requestId: overrides.requestId ?? 1,
    engineName: overrides.engineName ?? "dh-engine",
    engineVersion: overrides.engineVersion ?? "0.1.0",
    protocolVersion: overrides.protocolVersion ?? "1",
    capabilities: overrides.capabilities ?? v2Capabilities,
    answerState: overrides.answerState ?? "grounded",
    questionClass: overrides.questionClass ?? "search_symbol",
    items: overrides.items ?? [],
    evidence: overrides.evidence ?? null,
    languageCapabilitySummary: overrides.languageCapabilitySummary ?? null,
  };
}

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-run-knowledge-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
  }
  repos = [];
});

describe("runKnowledgeCommand", () => {
  it("returns missing input error unchanged", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(1);
    expect(report.message).toContain("Missing input");
  });

  it("creates a knowledge session and returns additive metadata", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "explain",
      input: "how auth works",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(input) {
          expect(input.queryClass).toBe("graph_definition");
          return makeBridgeAskResult({
            method: "query.definition",
            requestId: 4,
            answerState: "partial",
            questionClass: "definition",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 12,
                lineEnd: 24,
                snippet: "export function auth() {}",
                reason: "definition candidate",
                score: 0.8,
              },
            ],
            evidence: {
              answerState: "partial",
              questionClass: "definition",
              subject: "how auth works",
              summary: "Definition lookup returned one bounded candidate",
              conclusion: "Partial answer for explain definition lookup",
              evidence: [
                {
                  kind: "definition",
                  filePath: "src/auth.ts",
                  lineStart: 12,
                  lineEnd: 24,
                  reason: "definition candidate",
                  source: "storage",
                  confidence: "partial",
                },
              ],
              gaps: ["symbol meaning still requires adjacent context review"],
              bounds: {
                traversalScope: "goto_definition",
                hopCount: 0,
              },
            },
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.command).toBe("explain");
    expect(report.intent).toBe("bridge_query_definition");
    expect(report.answerState).toBe("partial");
    expect(report.rustEvidence?.questionClass).toBe("definition");
    expect(report.bridgeEvidence?.method).toBe("query.definition");
    expect(report.sessionId).toBeDefined();
    expect(report.resumed).toBe(false);
    expect(report.compaction?.attempted).toBe(true);
    expect(typeof report.compaction?.continuationSummaryGeneratedInMemory).toBe("boolean");
    expect(typeof report.compaction?.continuationSummaryPersisted).toBe("boolean");
    expect(typeof report.persistence?.persisted).toBe("boolean");
  });

  it("preserves existing report fields and adds session fields optionally", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "where is workflow state persisted",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("trace should not call runAskQuery");
        },
        async getInitializeSnapshot() {
          return makeInitializeSnapshot();
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(typeof report.command).toBe("string");
    expect(typeof report.repo).toBe("string");
    expect(typeof report.intent).toBe("string");
    expect(Array.isArray(report.tools)).toBe(true);
    expect(Array.isArray(report.seedTerms)).toBe(true);
    expect(typeof report.workspaceCount).toBe("number");
    expect(typeof report.resultCount).toBe("number");
    expect(typeof report.evidenceCount).toBe("number");
    expect(Array.isArray(report.evidencePreview)).toBe(true);
    expect(report.answerType).toBe("unsupported");
    expect(report.answerState).toBe("unsupported");
    expect(report.questionClass).toBe("trace_flow");
    expect(report.bridgeEvidence?.enabled).toBe(true);
    expect(report.bridgeEvidence?.rustBacked).toBe(true);
    expect(report.bridgeEvidence?.method).toBe("dh.initialize");
    expect(report.sessionId).toBeDefined();
    expect(typeof report.resumed).toBe("boolean");
    expect(report.compaction).toBeDefined();
  });

  it("resumes a session when resumeSessionId is supplied", async () => {
    const repo = makeRepo();
    const first = await runKnowledgeCommand({
      kind: "explain",
      input: "runLaneWorkflow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          return makeBridgeAskResult({
            method: "query.definition",
            requestId: 22,
            answerState: "grounded",
            questionClass: "definition",
            items: [
              {
                filePath: "apps/cli/src/runtime-client.ts",
                lineStart: 14,
                lineEnd: 20,
                snippet: "export function createRuntimeClient() { ... }",
                reason: "definition",
                score: 0.95,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "definition",
              subject: "runLaneWorkflow",
              summary: "Definition located",
              conclusion: "Definition found in runtime client wiring path",
              evidence: [
                {
                  kind: "definition",
                  filePath: "apps/cli/src/runtime-client.ts",
                  lineStart: 14,
                  lineEnd: 20,
                  reason: "definition",
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    const resumed = await runKnowledgeCommand({
      kind: "trace",
      input: "workflow state flow",
      repoRoot: repo,
      resumeSessionId: first.sessionId,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("trace should not call runAskQuery");
        },
        async getInitializeSnapshot() {
          return makeInitializeSnapshot();
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(first.exitCode).toBe(0);
    expect(first.sessionId).toBeDefined();
    expect(resumed.exitCode).toBe(0);
    expect(resumed.sessionId).toBe(first.sessionId);
    expect(resumed.resumed).toBe(true);
  });

  it("routes explain through Rust bridge envelope instead of retrieval fallback", async () => {
    const repo = makeRepo();
    let called = false;

    const report = await runKnowledgeCommand({
      kind: "explain",
      input: "runKnowledgeCommand",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(input) {
          called = true;
          expect(input.queryClass).toBe("graph_definition");
          expect(input.symbol).toBe("runKnowledgeCommand");
          return makeBridgeAskResult({
            method: "query.definition",
            requestId: 34,
            answerState: "grounded",
            questionClass: "definition",
            items: [
              {
                filePath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
                lineStart: 108,
                lineEnd: 115,
                snippet: "export async function runKnowledgeCommand(...) {",
                reason: "symbol definition",
                score: 0.97,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "definition",
              subject: "runKnowledgeCommand",
              summary: "Definition located",
              conclusion: "Definition found at packages/opencode-app/src/workflows/run-knowledge-command.ts:108",
              evidence: [
                {
                  kind: "definition",
                  filePath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
                  lineStart: 108,
                  lineEnd: 115,
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(called).toBe(true);
    expect(report.exitCode).toBe(0);
    expect(report.command).toBe("explain");
    expect(report.intent).toBe("bridge_query_definition");
    expect(report.tools).toEqual(["rust_bridge_jsonrpc"]);
    expect(report.answerState).toBe("grounded");
    expect(report.answerType).toBe("definition");
    expect(report.rustEvidence?.questionClass).toBe("definition");
    expect(report.languageCapabilitySummary?.capability).toBe("definition_lookup");
  });

  it("fails clearly on invalid resume session id", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "find auth flow",
      repoRoot: repo,
      resumeSessionId: "knowledge-session-not-found",
    });

    expect(report.exitCode).toBe(1);
    expect(report.message).toContain("was not found");
  });

  it("surfaces compaction trigger metadata when prompt overflows", async () => {
    const repo = makeRepo();
    new ConfigRepo(repo).write("session.auto_compaction", true);
    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "x".repeat(60_000),
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("trace should not call runAskQuery");
        },
        async getInitializeSnapshot() {
          return makeInitializeSnapshot();
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.compaction?.attempted).toBe(true);
    expect(report.compaction?.overflow).toBe(true);
    expect(report.compaction?.compacted).toBe(true);
    expect(report.compaction?.continuationSummaryGeneratedInMemory).toBe(true);
    expect(report.compaction?.continuationSummaryPersisted).toBe(true);
    expect(report.persistence?.persisted).toBe(true);
  });

  it("keeps command success but reports persistence failure when bridge writes fail", async () => {
    const repo = makeRepo();
    openDhDatabase(repo).exec("DROP TABLE knowledge_command_summaries");

    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "x".repeat(60_000),
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("trace should not call runAskQuery");
        },
        async getInitializeSnapshot() {
          return makeInitializeSnapshot();
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.persistence?.persisted).toBe(false);
    expect(report.persistence?.warning).toContain("Cross-surface persistence failed");
  });

  it("fails trace when bridge initialize truth is unavailable", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "trace",
      input: "where does auth flow go",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("trace should not call runAskQuery");
        },
        async getInitializeSnapshot() {
          throw new DhBridgeError({
            code: "BRIDGE_STARTUP_FAILED",
            phase: "startup",
            message: "bridge unavailable",
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(1);
    expect(report.bridgeEvidence?.failure?.code).toBe("BRIDGE_STARTUP_FAILED");
    expect(report.bridgeEvidence?.failure?.phase).toBe("startup");
  });

  it("routes ask through bridge and returns bridge evidence", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(input) {
          expect(input.queryClass).toBe("search_file_discovery");
          return makeBridgeAskResult({
            method: "query.search",
            requestId: 7,
            answerState: "partial",
            questionClass: "search_file_discovery",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 3,
                lineEnd: 9,
                snippet: "export function login() {}",
                reason: "symbol match",
                score: 0.92,
              },
            ],
            evidence: {
              answerState: "partial",
              questionClass: "search_file_discovery",
              subject: "find auth flow",
              summary: "search results",
              conclusion: "partial retrieval-backed search evidence available",
              evidence: [
                {
                  kind: "chunk",
                  filePath: "src/auth.ts",
                  lineStart: 3,
                  lineEnd: 9,
                  reason: "symbol match",
                  source: "query",
                  confidence: "partial",
                  snippet: "export function login() {}",
                },
              ],
              gaps: ["search results are retrieval-backed and do not prove parser-backed relation support"],
              bounds: {
                traversalScope: "search_file_discovery",
              },
            },
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.resultCount).toBe(1);
    expect(report.tools).toEqual(["rust_bridge_jsonrpc"]);
    expect(report.bridgeEvidence?.enabled).toBe(true);
    expect(report.bridgeEvidence?.startupSucceeded).toBe(true);
    expect(report.bridgeEvidence?.rustBacked).toBe(true);
    expect(report.bridgeEvidence?.method).toBe("query.search");
    expect(report.bridgeEvidence?.requestId).toBe(7);
    expect(report.bridgeEvidence?.protocolVersion).toBe("1");
    expect(report.bridgeEvidence?.capabilities?.methods).toEqual([
      "dh.initialize",
      "query.search",
      "query.definition",
      "query.relationship",
    ]);
    expect(report.bridgeEvidence?.capabilities?.queryRelationship.supportedRelations).toEqual([
      "usage",
      "dependencies",
      "dependents",
    ]);
    expect(report.answerType).toBe("partial");
    expect(report.answerState).toBe("partial");
    expect(report.answer).toContain("retrieval-backed search evidence");
    expect(report.evidence?.length).toBeGreaterThan(0);
  });

  it("returns grounded graph-aware definition answer for supported question", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "where is runKnowledgeCommand defined",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(input) {
          expect(input.queryClass).toBe("graph_definition");
          return makeBridgeAskResult({
            method: "query.definition",
            requestId: 11,
            answerState: "grounded",
            questionClass: "definition",
            items: [
              {
                filePath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
                lineStart: 60,
                lineEnd: 66,
                snippet: "export async function runKnowledgeCommand(...) {",
                reason: "symbol definition",
                score: 0.96,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "definition",
              subject: "runKnowledgeCommand",
              summary: "Definition located",
              conclusion: "Definition found at packages/opencode-app/src/workflows/run-knowledge-command.ts:60",
              evidence: [
                {
                  kind: "definition",
                  filePath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
                  lineStart: 60,
                  lineEnd: 66,
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.answerType).toBe("definition");
    expect(report.answerState).toBe("grounded");
    expect(report.answer).toContain("Definition found at");
    expect(report.questionClass).toBe("definition");
    expect(report.requestedQuestionClass).toBe("graph_definition");
  });

  it("marks ambiguous supported result as partial with limitations", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "where is runKnowledgeCommand defined",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          return makeBridgeAskResult({
            method: "query.definition",
            requestId: 13,
            answerState: "partial",
            questionClass: "definition",
            items: [
              {
                filePath: "a.ts",
                lineStart: 10,
                lineEnd: 10,
                snippet: "function runKnowledgeCommand() {}",
                reason: "candidate 1",
                score: 0.74,
              },
              {
                filePath: "b.ts",
                lineStart: 20,
                lineEnd: 20,
                snippet: "function runKnowledgeCommand() {}",
                reason: "candidate 2",
                score: 0.72,
              },
            ],
            evidence: {
              answerState: "partial",
              questionClass: "definition",
              subject: "runKnowledgeCommand",
              summary: "Definition candidates",
              conclusion: "Definition candidates are ambiguous across multiple files",
              evidence: [
                {
                  kind: "definition",
                  filePath: "a.ts",
                  lineStart: 10,
                  lineEnd: 10,
                  reason: "candidate 1",
                  source: "storage",
                  confidence: "partial",
                },
                {
                  kind: "definition",
                  filePath: "b.ts",
                  lineStart: 20,
                  lineEnd: 20,
                  reason: "candidate 2",
                  source: "storage",
                  confidence: "partial",
                },
              ],
              gaps: ["multiple candidate definitions remain"],
              bounds: {
                traversalScope: "goto_definition",
              },
            },
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.answerType).toBe("partial");
    expect(report.answerState).toBe("partial");
    expect(report.answer).toContain("Partial answer");
    expect(report.limitations?.length).toBeGreaterThan(0);
  });

  it("labels unsupported adjacent ask questions as unsupported", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "give me multi-hop call hierarchy impact analysis for auth",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.answerType).toBe("unsupported");
    expect(report.answerState).toBe("unsupported");
    expect(report.questionClass).toBe("unsupported");
    expect(report.limitations?.[0]).toContain("Phase 3 supports only");
  });

  it("keeps unmatched ask prompt unsupported instead of defaulting to search", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "summarize governance philosophy tradeoffs",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.questionClass).toBe("unsupported");
    expect(report.answerType).toBe("unsupported");
    expect(report.answerState).toBe("unsupported");
    expect(report.resultCount).toBe(0);
    expect(report.evidenceCount).toBe(0);
  });

  it("routes 'what files import X' to graph relationship dependents", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "what files import packages/opencode-app/src/workflows/run-knowledge-command.ts",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(input) {
          expect(input.queryClass).toBe("graph_relationship_dependents");
          expect(input.targetPath).toBe("packages/opencode-app/src/workflows/run-knowledge-command.ts");
          return makeBridgeAskResult({
            method: "query.relationship",
            requestId: 21,
            answerState: "grounded",
            questionClass: "dependents",
            items: [
              {
                filePath: "apps/cli/src/runtime-client.ts",
                lineStart: 2,
                lineEnd: 2,
                snippet: "import { runKnowledgeCommand } from ...",
                reason: "one-hop dependent/importer match",
                score: 0.9,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "dependents",
              subject: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
              summary: "Dependents lookup",
              conclusion: "Found grounded direct dependents",
              evidence: [
                {
                  kind: "dependent",
                  filePath: "apps/cli/src/runtime-client.ts",
                  lineStart: 2,
                  lineEnd: 2,
                  reason: "one-hop dependent/importer match",
                  source: "graph",
                  confidence: "grounded",
                },
              ],
              gaps: [],
              bounds: {
                traversalScope: "dependents_direct",
                hopCount: 1,
              },
            },
            languageCapabilitySummary: {
              capability: "dependents",
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
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.answer).toContain("direct dependents");
    expect(report.answerType).toBe("dependents");
    expect(report.answerState).toBe("grounded");
    expect(report.bridgeEvidence?.method).toBe("query.relationship");
  });

  it("surfaces startup and request failures distinctly for ask", async () => {
    const repo = makeRepo();

    const startupFailure = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          throw new DhBridgeError({
            code: "BRIDGE_STARTUP_FAILED",
            phase: "startup",
            message: "spawn failed",
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(startupFailure.exitCode).toBe(1);
    expect(startupFailure.bridgeEvidence?.failure?.code).toBe("BRIDGE_STARTUP_FAILED");
    expect(startupFailure.bridgeEvidence?.failure?.phase).toBe("startup");
    expect(startupFailure.bridgeEvidence?.startupSucceeded).toBe(false);

    const requestFailure = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          throw new DhBridgeError({
            code: "REQUEST_FAILED",
            phase: "request",
            message: "query failed",
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(requestFailure.exitCode).toBe(1);
    expect(requestFailure.bridgeEvidence?.failure?.code).toBe("REQUEST_FAILED");
    expect(requestFailure.bridgeEvidence?.failure?.phase).toBe("request");
    expect(requestFailure.bridgeEvidence?.startupSucceeded).toBe(true);
  });

  it("preserves timeout and unreachable-worker failure classifications", async () => {
    const repo = makeRepo();

    const timeoutFailure = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          throw new DhBridgeError({
            code: "BRIDGE_TIMEOUT",
            phase: "request",
            message: "timeout",
            retryable: true,
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(timeoutFailure.exitCode).toBe(1);
    expect(timeoutFailure.bridgeEvidence?.failure?.code).toBe("BRIDGE_TIMEOUT");
    expect(timeoutFailure.bridgeEvidence?.failure?.phase).toBe("request");
    expect(timeoutFailure.bridgeEvidence?.failure?.retryable).toBe(true);

    const unreachableFailure = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          throw new DhBridgeError({
            code: "BRIDGE_UNREACHABLE",
            phase: "request",
            message: "broken pipe",
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(unreachableFailure.exitCode).toBe(1);
    expect(unreachableFailure.bridgeEvidence?.failure?.code).toBe("BRIDGE_UNREACHABLE");
    expect(unreachableFailure.bridgeEvidence?.failure?.phase).toBe("request");
  });

  it("accepts insufficient bridge result without treating empty items as transport failure", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          return makeBridgeAskResult({
            method: "query.search",
            answerState: "insufficient",
            questionClass: "search_file_discovery",
            items: [],
            evidence: {
              answerState: "insufficient",
              questionClass: "search_file_discovery",
              subject: "find auth flow",
              summary: "search results",
              conclusion: "insufficient search evidence",
              evidence: [],
              gaps: ["no search matches found"],
              bounds: {
                traversalScope: "search_file_discovery",
                stopReason: "no_matches",
              },
            },
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.answerState).toBe("insufficient");
    expect(report.answerType).toBe("partial");
    expect(report.bridgeEvidence?.failure).toBeUndefined();
  });

  it("does not treat preview items as evidence when Rust envelope is missing", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "find auth flow",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery(_input) {
          return makeBridgeAskResult({
            method: "query.search",
            answerState: "partial",
            questionClass: "search_file_discovery",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 10,
                lineEnd: 14,
                snippet: "export function login() {}",
                reason: "file path match",
                score: 0.9,
              },
            ],
            evidence: null,
          });
        },
        async close() {
          // noop
        },
      } satisfies BridgeClient),
    });

    expect(report.exitCode).toBe(0);
    expect(report.evidence).toEqual([]);
    expect(report.evidenceCount).toBe(0);
    expect(report.limitations?.some((item) => item.includes("preview items without a canonical evidence packet"))).toBe(true);
  });
});
