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
  methods: ["dh.initialize", "query.search", "query.definition", "query.relationship", "query.buildEvidence"] as const,
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
    seamMethod: overrides.seamMethod,
    delegatedMethod: overrides.delegatedMethod,
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
    expect(report.executionBoundary?.path).toBe("legacy_ts_host_bridge_compatibility");
    expect(report.executionBoundary?.lifecycleAuthority).toBe("not_claimed");
  });

  it("creates a knowledge session and returns additive metadata", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "explain",
      input: "how auth works",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("explain first-wave class should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_definition");
          return makeBridgeAskResult({
            method: "query.definition",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.definition",
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
    expect(report.bridgeEvidence?.seamMethod).toBe("session.runCommand");
    expect(report.bridgeEvidence?.delegatedMethod).toBe("query.definition");
    expect(report.executionBoundary).toBeUndefined();
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
    expect(report.executionBoundary).toBeUndefined();
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
        async runAskQuery() {
          throw new Error("ask first-wave class should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("search_file_discovery");
          return makeBridgeAskResult({
            method: "query.search",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.search",
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
    expect(report.bridgeEvidence?.seamMethod).toBe("session.runCommand");
    expect(report.bridgeEvidence?.delegatedMethod).toBe("query.search");
    expect(report.bridgeEvidence?.requestId).toBe(7);
    expect(report.bridgeEvidence?.protocolVersion).toBe("1");
    expect(report.bridgeEvidence?.capabilities?.methods).toEqual([
      "dh.initialize",
      "query.search",
      "query.definition",
      "query.relationship",
      "query.buildEvidence",
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

  it("routes bounded broad ask to Rust-hosted buildEvidence packet truth", async () => {
    const repo = makeRepo();
    let callCount = 0;

    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how does auth work?",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("broad Rust-hosted ask should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          callCount += 1;
          expect(input.queryClass).toBe("graph_build_evidence");
          expect(input.intent).toBe("explain");
          expect(input.targets).toEqual(["auth"]);
          expect(input.freshness).toBe("indexed");
          expect(input.limit).toBe(5);
          return makeBridgeAskResult({
            method: "query.buildEvidence",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.buildEvidence",
            requestId: 44,
            answerState: "grounded",
            questionClass: "build_evidence",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 3,
                lineEnd: 18,
                snippet: "export function auth() {}",
                reason: "preview row only",
                score: 0.88,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "build_evidence",
              subject: "auth",
              summary: "Auth is assembled through the bounded Rust evidence graph.",
              conclusion: "Auth works through Rust-authored packet evidence.",
              evidence: [
                {
                  kind: "symbol",
                  filePath: "src/auth.ts",
                  lineStart: 3,
                  lineEnd: 18,
                  reason: "Rust build-evidence packet entry",
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
            },
            languageCapabilitySummary: {
              capability: "build_evidence",
              weakestState: "supported",
              retrievalOnly: false,
              languages: [
                {
                  language: "typescript",
                  state: "supported",
                  reason: "parser-backed bounded build evidence",
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

    expect(callCount).toBe(1);
    expect(report.exitCode).toBe(0);
    expect(report.intent).toBe("bridge_query_build_evidence");
    expect(report.requestedQuestionClass).toBe("graph_build_evidence");
    expect(report.questionClass).toBe("build_evidence");
    expect(report.answerState).toBe("grounded");
    expect(report.answerType).toBe("build_evidence");
    expect(report.answer).toBe("Auth works through Rust-authored packet evidence.");
    expect(report.bridgeEvidence?.method).toBe("query.buildEvidence");
    expect(report.bridgeEvidence?.seamMethod).toBe("session.runCommand");
    expect(report.bridgeEvidence?.delegatedMethod).toBe("query.buildEvidence");
    expect(report.rustEvidence?.questionClass).toBe("build_evidence");
    expect(report.evidence).toEqual([
      expect.objectContaining({
        filePath: "src/auth.ts",
        sourceMethod: "query.buildEvidence",
        reason: "Rust build-evidence packet entry",
        symbol: "auth",
      }),
    ]);
  });

  it("does not synthesize build-evidence packet truth from preview items", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how is auth implemented?",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("bounded broad ask should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_build_evidence");
          expect(input.targets).toEqual(["auth"]);
          return makeBridgeAskResult({
            method: "query.buildEvidence",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.buildEvidence",
            requestId: 45,
            answerState: "insufficient",
            questionClass: "build_evidence",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 1,
                lineEnd: 1,
                snippet: "export const auth = true;",
                reason: "preview row is not canonical proof",
                score: 0.7,
              },
            ],
            evidence: {
              answerState: "insufficient",
              questionClass: "build_evidence",
              subject: "auth",
              summary: "Rust build evidence could not prove the implementation flow.",
              conclusion: "Missing indexed proof prevents a grounded auth implementation answer.",
              evidence: [],
              gaps: ["no indexed evidence proved the bounded auth implementation flow"],
              bounds: {
                traversalScope: "build_evidence",
                stopReason: "insufficient_evidence",
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
    expect(report.requestedQuestionClass).toBe("graph_build_evidence");
    expect(report.questionClass).toBe("build_evidence");
    expect(report.resultCount).toBe(1);
    expect(report.evidence).toEqual([]);
    expect(report.evidenceCount).toBe(0);
    expect(report.rustEvidence?.evidence).toEqual([]);
    expect(report.limitations).toContain("no indexed evidence proved the bounded auth implementation flow");
  });

  it("marks missing Rust build-evidence packet as insufficient even when preview rows exist", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how is auth wired?",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("bounded broad ask should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_build_evidence");
          return makeBridgeAskResult({
            method: "query.buildEvidence",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.buildEvidence",
            requestId: 46,
            answerState: "grounded",
            questionClass: "build_evidence",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 1,
                lineEnd: 1,
                snippet: "export const auth = true;",
                reason: "preview row is not canonical proof",
                score: 0.7,
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
    expect(report.answerState).toBe("insufficient");
    expect(report.answerType).toBe("partial");
    expect(report.questionClass).toBe("build_evidence");
    expect(report.resultCount).toBe(1);
    expect(report.evidence).toEqual([]);
    expect(report.evidenceCount).toBe(0);
    expect(report.rustEvidence).toBeNull();
    expect(report.limitations).toContain("Rust build-evidence packet was missing; preview rows are non-authoritative and cannot ground this answer.");
    expect(report.limitations).toContain("Rust bridge returned preview items without a canonical evidence packet; preview rows are non-authoritative and cannot be used as proof.");
  });

  it("preserves Rust packet answerState when the bridge envelope is stronger", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how does auth work?",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("bounded broad ask should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_build_evidence");
          return makeBridgeAskResult({
            method: "query.buildEvidence",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.buildEvidence",
            requestId: 47,
            answerState: "grounded",
            questionClass: "build_evidence",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 1,
                lineEnd: 4,
                snippet: "export function auth() {}",
                reason: "preview row must not upgrade packet truth",
                score: 0.9,
              },
            ],
            evidence: {
              answerState: "partial",
              questionClass: "build_evidence",
              subject: "auth",
              summary: "Rust packet says auth is only partially supported.",
              conclusion: "Auth has partial Rust packet evidence only.",
              evidence: [
                {
                  kind: "symbol",
                  filePath: "src/auth.ts",
                  lineStart: 1,
                  lineEnd: 4,
                  reason: "packet evidence survives",
                  source: "graph",
                  confidence: "partial",
                  symbol: "auth",
                },
              ],
              gaps: ["material auth wiring gap remains"],
              bounds: {
                traversalScope: "build_evidence",
                stopReason: "ambiguous_target",
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
    expect(report.answerState).toBe("partial");
    expect(report.answerType).toBe("partial");
    expect(report.answer).toBe("Partial answer: Auth has partial Rust packet evidence only.");
    expect(report.rustEvidence?.answerState).toBe("partial");
    expect(report.limitations).toContain("material auth wiring gap remains");
    expect(report.limitations).toContain("Rust packet answerState 'partial' was preserved over bridge envelope answerState 'grounded'.");
    expect(report.evidence).toEqual([
      expect.objectContaining({
        reason: "packet evidence survives",
        confidence: "partial",
      }),
    ]);
  });

  it("downgrades grounded build-evidence packet when Rust evidence entries are empty", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how does auth work?",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("bounded broad ask should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_build_evidence");
          return makeBridgeAskResult({
            method: "query.buildEvidence",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.buildEvidence",
            requestId: 50,
            answerState: "grounded",
            questionClass: "build_evidence",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 1,
                lineEnd: 4,
                snippet: "export function auth() {}",
                reason: "preview row must not ground empty Rust packet",
                score: 0.9,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "build_evidence",
              subject: "auth",
              summary: "Rust packet claimed grounded auth evidence.",
              conclusion: "Auth was claimed grounded without evidence entries.",
              evidence: [],
              gaps: [],
              bounds: {
                traversalScope: "build_evidence",
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
    expect(report.questionClass).toBe("build_evidence");
    expect(report.evidence).toEqual([]);
    expect(report.evidenceCount).toBe(0);
    expect(report.rustEvidence?.answerState).toBe("grounded");
    expect(report.rustEvidence?.evidence).toEqual([]);
    expect(report.limitations).toContain("Rust build-evidence packet was grounded but returned no inspectable evidence entries; final answer is insufficient.");
  });

  it("preserves unsupported Rust packet truth without lifecycle or preview upgrade", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how does auth work?",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("bounded broad ask should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_build_evidence");
          return makeBridgeAskResult({
            method: "query.buildEvidence",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.buildEvidence",
            requestId: 48,
            answerState: "grounded",
            questionClass: "build_evidence",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 1,
                lineEnd: 4,
                snippet: "export function auth() {}",
                reason: "preview row must not override unsupported packet",
                score: 0.9,
              },
            ],
            evidence: {
              answerState: "unsupported",
              questionClass: "build_evidence",
              subject: "auth",
              summary: "Rust packet classified the request as unsupported.",
              conclusion: "Auth evidence is unsupported across the bounded Rust packet contract.",
              evidence: [],
              gaps: ["unsupported language or capability boundary prevents canonical packet proof"],
              bounds: {
                traversalScope: "build_evidence",
                stopReason: "unsupported_language_capability",
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
    expect(report.answerState).toBe("unsupported");
    expect(report.answerType).toBe("unsupported");
    expect(report.evidence).toEqual([]);
    expect(report.evidenceCount).toBe(0);
    expect(report.rustEvidence?.answerState).toBe("unsupported");
    expect(report.rustEvidence?.bounds.stopReason).toBe("unsupported_language_capability");
    expect(report.limitations).toContain("unsupported language or capability boundary prevents canonical packet proof");
    expect(report.limitations).toContain("Rust packet answerState 'unsupported' was preserved over bridge envelope answerState 'grounded'.");
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
    expect(report.limitations?.[0]).toContain("impact-analysis requests");
    expect(report.limitations).toContain("No TypeScript-composed canonical evidence packet fallback was used.");
  });

  it("keeps unbounded broad asks unsupported without hidden bridge fallback", async () => {
    const repo = makeRepo();
    let bridgeFactoryCalled = false;
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how does the entire subsystem work?",
      repoRoot: repo,
      bridgeClientFactory: () => {
        bridgeFactoryCalled = true;
        return {
          async runAskQuery() {
            throw new Error("unsupported unbounded broad ask must not call runAskQuery");
          },
          async runSessionCommand() {
            throw new Error("unsupported unbounded broad ask must not call runSessionCommand");
          },
          async close() {
            // noop
          },
        } satisfies BridgeClient;
      },
    });

    expect(bridgeFactoryCalled).toBe(false);
    expect(report.exitCode).toBe(0);
    expect(report.answerType).toBe("unsupported");
    expect(report.answerState).toBe("unsupported");
    expect(report.questionClass).toBe("unsupported");
    expect(report.resultCount).toBe(0);
    expect(report.evidenceCount).toBe(0);
    expect(report.limitations?.[0]).toContain("unbounded");
    expect(report.limitations).toContain("No TypeScript-composed canonical evidence packet fallback was used.");
  });

  it("keeps impact-shaped broad asks unsupported instead of routing them to buildEvidence", async () => {
    const repo = makeRepo();
    let bridgeFactoryCalled = false;
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "how does impact of auth work?",
      repoRoot: repo,
      bridgeClientFactory: () => {
        bridgeFactoryCalled = true;
        return {
          async runAskQuery() {
            throw new Error("impact-shaped ask must not call runAskQuery");
          },
          async runSessionCommand() {
            throw new Error("impact-shaped ask must not call runSessionCommand");
          },
          async close() {
            // noop
          },
        } satisfies BridgeClient;
      },
    });

    expect(bridgeFactoryCalled).toBe(false);
    expect(report.exitCode).toBe(0);
    expect(report.answerType).toBe("unsupported");
    expect(report.answerState).toBe("unsupported");
    expect(report.questionClass).toBe("unsupported");
    expect(report.limitations?.[0]).toContain("impact-analysis requests");
    expect(report.limitations).toContain("No TypeScript-composed canonical evidence packet fallback was used.");
  });

  it("preserves narrow definition asks instead of forcing them through buildEvidence", async () => {
    const repo = makeRepo();
    const report = await runKnowledgeCommand({
      kind: "ask",
      input: "where is auth implemented in src/auth.ts",
      repoRoot: repo,
      bridgeClientFactory: () => ({
        async runAskQuery() {
          throw new Error("narrow definition ask should route through runSessionCommand when available");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_definition");
          expect(input.symbol).toBe("auth");
          expect(input.intent).toBeUndefined();
          expect(input.targets).toBeUndefined();
          return makeBridgeAskResult({
            method: "query.definition",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.definition",
            requestId: 46,
            answerState: "grounded",
            questionClass: "definition",
            items: [
              {
                filePath: "src/auth.ts",
                lineStart: 7,
                lineEnd: 14,
                snippet: "export function auth() {}",
                reason: "definition",
                score: 0.91,
              },
            ],
            evidence: {
              answerState: "grounded",
              questionClass: "definition",
              subject: "auth",
              summary: "Definition located",
              conclusion: "Definition found in src/auth.ts",
              evidence: [
                {
                  kind: "definition",
                  filePath: "src/auth.ts",
                  lineStart: 7,
                  lineEnd: 14,
                  reason: "definition",
                  source: "graph",
                  confidence: "grounded",
                  symbol: "auth",
                },
              ],
              gaps: [],
              bounds: {
                traversalScope: "goto_definition",
                hopCount: 0,
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
    expect(report.requestedQuestionClass).toBe("graph_definition");
    expect(report.questionClass).toBe("definition");
    expect(report.answerType).toBe("definition");
    expect(report.bridgeEvidence?.method).toBe("query.definition");
    expect(report.bridgeEvidence?.delegatedMethod).toBe("query.definition");
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
    expect(report.executionBoundary?.path).toBe("legacy_ts_host_bridge_compatibility");
    expect(report.executionBoundary?.rustHosted).toBe(false);
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
        async runAskQuery() {
          throw new Error("dependents first-wave class should route through runSessionCommand");
        },
        async runSessionCommand(input) {
          expect(input.queryClass).toBe("graph_relationship_dependents");
          expect(input.targetPath).toBe("packages/opencode-app/src/workflows/run-knowledge-command.ts");
          return makeBridgeAskResult({
            method: "query.relationship",
            seamMethod: "session.runCommand",
            delegatedMethod: "query.relationship",
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
    expect(report.bridgeEvidence?.seamMethod).toBe("session.runCommand");
    expect(report.bridgeEvidence?.delegatedMethod).toBe("query.relationship");
  });

  it("routes usage/dependencies ask classes through delegated relationship seam with inspectable metadata", async () => {
    const repo = makeRepo();
    const scenarios = [
      {
        input: "references to runKnowledgeCommand",
        requestedQuestionClass: "graph_relationship_usage" as const,
        rustQuestionClass: "references",
        answerType: "usage" as const,
        expectedSymbol: "runKnowledgeCommand",
      },
      {
        input: "what does packages/opencode-app/src/workflows/run-knowledge-command.ts depend on",
        requestedQuestionClass: "graph_relationship_dependencies" as const,
        rustQuestionClass: "dependencies",
        answerType: "dependencies" as const,
        expectedTargetPath: "packages/opencode-app/src/workflows/run-knowledge-command.ts",
      },
    ];

    const callMetadata: Array<{
      queryClass: string;
      symbol?: string;
      targetPath?: string;
    }> = [];

    for (const [index, scenario] of scenarios.entries()) {
      const report = await runKnowledgeCommand({
        kind: "ask",
        input: scenario.input,
        repoRoot: repo,
        bridgeClientFactory: () => ({
          async runAskQuery() {
            throw new Error("bounded first-wave relationship classes should route through runSessionCommand");
          },
          async runSessionCommand(input) {
            callMetadata.push({
              queryClass: input.queryClass,
              symbol: input.symbol,
              targetPath: input.targetPath,
            });

            expect(input.queryClass).toBe(scenario.requestedQuestionClass);
            if (scenario.expectedSymbol) {
              expect(input.symbol).toContain(scenario.expectedSymbol);
            }
            if (scenario.expectedTargetPath) {
              expect(input.targetPath).toBe(scenario.expectedTargetPath);
            }

            return makeBridgeAskResult({
              method: "query.relationship",
              seamMethod: "session.runCommand",
              delegatedMethod: "query.relationship",
              requestId: 100 + index,
              answerState: "grounded",
              questionClass: scenario.rustQuestionClass,
              items: [
                {
                  filePath: "apps/cli/src/runtime-client.ts",
                  lineStart: 2,
                  lineEnd: 2,
                  snippet: "import { runKnowledgeCommand } from ...",
                  reason: "one-hop graph relationship evidence",
                  score: 0.93,
                },
              ],
              evidence: {
                answerState: "grounded",
                questionClass: scenario.rustQuestionClass,
                subject: scenario.input,
                summary: "Relationship lookup",
                conclusion: "Found grounded one-hop relationship evidence",
                evidence: [
                  {
                    kind: scenario.answerType,
                    filePath: "apps/cli/src/runtime-client.ts",
                    lineStart: 2,
                    lineEnd: 2,
                    reason: "one-hop graph relationship evidence",
                    source: "graph",
                    confidence: "grounded",
                  },
                ],
                gaps: [],
                bounds: {
                  traversalScope: scenario.answerType === "usage" ? "usage_direct" : "dependencies_direct",
                  hopCount: 1,
                },
              },
              languageCapabilitySummary: {
                capability: scenario.answerType,
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
      expect(report.tools).toEqual(["rust_bridge_jsonrpc"]);
      expect(report.requestedQuestionClass).toBe(scenario.requestedQuestionClass);
      expect(report.questionClass).toBe(scenario.rustQuestionClass);
      expect(report.answerType).toBe(scenario.answerType);
      expect(report.bridgeEvidence?.method).toBe("query.relationship");
      expect(report.bridgeEvidence?.seamMethod).toBe("session.runCommand");
      expect(report.bridgeEvidence?.delegatedMethod).toBe("query.relationship");
      expect(report.evidence?.[0]?.sourceMethod).toBe("query.relationship");
      expect(report.evidence?.[0]?.relationship).toBe(scenario.answerType);
    }

    expect(callMetadata).toHaveLength(2);
    expect(callMetadata.map((entry) => entry.queryClass)).toEqual([
      "graph_relationship_usage",
      "graph_relationship_dependencies",
    ]);
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
