import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { DhBridgeError } from "../bridge/dh-jsonrpc-stdio-client.js";
import { HostBridgeClient } from "./host-bridge-client.js";
import { WorkerJsonRpcPeer } from "./worker-jsonrpc-stdio.js";

function connectPeers(): {
  workerPeer: WorkerJsonRpcPeer;
  hostPeer: WorkerJsonRpcPeer;
  start: () => void;
} {
  const hostToWorker = new PassThrough();
  const workerToHost = new PassThrough();
  const workerPeer = new WorkerJsonRpcPeer({ input: hostToWorker, output: workerToHost });
  const hostPeer = new WorkerJsonRpcPeer({ input: workerToHost, output: hostToWorker });

  return {
    workerPeer,
    hostPeer,
    start() {
      workerPeer.start();
      hostPeer.start();
    },
  };
}

describe("HostBridgeClient", () => {
  it("delegates query.buildEvidence as one named host-backed method and preserves grounded packet truth", async () => {
    const { workerPeer, hostPeer, start } = connectPeers();
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];

    hostPeer.onRequest("query.buildEvidence", (params) => {
      calls.push({ method: "query.buildEvidence", params: params as Record<string, unknown> });
      return {
        answerState: "grounded",
        questionClass: "build_evidence",
        items: [
          {
            filePath: "src/auth.ts",
            lineStart: 2,
            lineEnd: 8,
            snippet: "export function auth() {}",
            reason: "canonical Rust evidence preview",
            score: 0.95,
          },
        ],
        evidence: {
          answerState: "grounded",
          questionClass: "build_evidence",
          subject: "auth",
          summary: "Build evidence (explain)",
          conclusion: "bounded canonical evidence packet assembled from indexed definition and snippet truth",
          evidence: [
            {
              kind: "definition",
              filePath: "src/auth.ts",
              lineStart: 2,
              lineEnd: 8,
              reason: "indexed symbol candidate for auth",
              source: "storage",
              confidence: "grounded",
              symbol: "auth",
              snippet: "export function auth() {}",
            },
          ],
          gaps: [],
          bounds: {
            traversalScope: "build_evidence",
            hopCount: 2,
            nodeLimit: 5,
          },
        },
      };
    });
    start();

    const client = new HostBridgeClient(workerPeer);
    const result = await client.runSessionCommand({
      query: "how does auth work?",
      repoRoot: "/repo",
      queryClass: "graph_build_evidence",
      targets: ["auth"],
      budget: {
        maxFiles: 4,
        maxSymbols: 7,
        maxSnippets: 6,
      },
      freshness: "indexed",
    });

    expect(result.method).toBe("query.buildEvidence");
    expect(result.seamMethod).toBe("session.runCommand");
    expect(result.delegatedMethod).toBe("query.buildEvidence");
    expect(result.answerState).toBe("grounded");
    expect(result.questionClass).toBe("build_evidence");
    expect(result.evidence?.answerState).toBe("grounded");
    expect(result.evidence?.questionClass).toBe("build_evidence");
    expect(result.evidence?.evidence).toHaveLength(1);
    expect(result.evidence?.bounds.traversalScope).toBe("build_evidence");
    expect(result.capabilities.methods).toContain("query.buildEvidence");
    expect(calls).toEqual([
      {
        method: "query.buildEvidence",
        params: {
          query: "how does auth work?",
          workspaceRoot: "/repo",
          intent: "explain",
          targets: ["auth"],
          budget: {
            maxFiles: 4,
            maxSymbols: 7,
            maxSnippets: 6,
          },
          freshness: "indexed",
        },
      },
    ]);
  });

  it("preserves partial, insufficient, and unsupported build-evidence packet states without upgrading gaps", async () => {
    const states = ["partial", "insufficient", "unsupported"] as const;

    for (const state of states) {
      const { workerPeer, hostPeer, start } = connectPeers();
      hostPeer.onRequest("query.buildEvidence", () => ({
        answerState: state,
        questionClass: "build_evidence",
        items: [],
        evidence: {
          answerState: state,
          questionClass: "build_evidence",
          subject: `${state} subject`,
          summary: `Build evidence ${state}`,
          conclusion: `${state} canonical Rust packet`,
          evidence: state === "partial"
            ? [
              {
                kind: "chunk",
                filePath: "src/auth.ts",
                lineStart: 1,
                lineEnd: 2,
                reason: "partial useful evidence",
                source: "storage",
                confidence: "partial",
              },
            ]
            : [],
          gaps: [`${state} gap from Rust`],
          bounds: {
            traversalScope: "build_evidence",
            stopReason: state === "partial"
              ? "partial_index_or_capability"
              : state === "insufficient"
                ? "insufficient_evidence"
                : "runtime_trace",
          },
        },
      }));
      start();

      const client = new HostBridgeClient(workerPeer);
      const result = await client.runAskQuery({
        query: `how does ${state} work?`,
        repoRoot: "/repo",
        queryClass: "graph_build_evidence",
      });

      expect(result.method).toBe("query.buildEvidence");
      expect(result.answerState).toBe(state);
      expect(result.evidence?.answerState).toBe(state);
      expect(result.evidence?.gaps).toEqual([`${state} gap from Rust`]);
      expect(result.evidence?.bounds.stopReason).toBe(
        state === "partial"
          ? "partial_index_or_capability"
          : state === "insufficient"
            ? "insufficient_evidence"
            : "runtime_trace",
      );
      expect(result.evidence?.evidence).toHaveLength(state === "partial" ? 1 : 0);
    }
  });

  it("keeps arbitrary methods refused and close subordinate after adding build evidence", async () => {
    const { workerPeer, hostPeer, start } = connectPeers();
    const calls: string[] = [];
    hostPeer.onRequest("query.trace", () => {
      calls.push("query.trace");
      return { answerState: "grounded", questionClass: "trace" };
    });
    start();

    const client = new HostBridgeClient(workerPeer);
    await expect(client.runAskQuery({
      query: "trace auth flow",
      repoRoot: "/repo",
      queryClass: "graph_trace_flow",
    } as never)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      phase: "request",
    } satisfies Partial<DhBridgeError>);

    await expect(client.close()).resolves.toBeUndefined();
    await expect(client.close()).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("does not expose runtime, file, or tool utility wrappers on the RHBE host bridge", () => {
    const { workerPeer } = connectPeers();
    const client = new HostBridgeClient(workerPeer);

    expect("getRuntimeHealth" in client).toBe(false);
    expect("getRuntimeDiagnostics" in client).toBe(false);
    expect("fileRead" in client).toBe(false);
    expect("fileReadRange" in client).toBe(false);
    expect("fileList" in client).toBe(false);
    expect("toolExecute" in client).toBe(false);
  });

  it("delegates first-wave query classes to the Rust host peer without spawning Rust", async () => {
    const { workerPeer, hostPeer, start } = connectPeers();
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];

    hostPeer.onRequest("query.search", (params) => {
      calls.push({ method: "query.search", params: params as Record<string, unknown> });
      return {
        answerState: "partial",
        questionClass: "search_file_discovery",
        items: [
          {
            filePath: "src/auth.ts",
            lineStart: 2,
            lineEnd: 4,
            snippet: "export function auth() {}",
            reason: "file path match",
            score: 0.8,
          },
        ],
        evidence: {
          answerState: "partial",
          questionClass: "search_file_discovery",
          subject: "auth",
          summary: "search results",
          conclusion: "partial retrieval-backed search evidence available",
          evidence: [
            {
              kind: "chunk",
              filePath: "src/auth.ts",
              lineStart: 2,
              lineEnd: 4,
              reason: "file path match",
              source: "query",
              confidence: "partial",
              snippet: "export function auth() {}",
            },
          ],
          gaps: [],
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
      };
    });
    start();

    const client = new HostBridgeClient(workerPeer, {
      engineVersion: "0.1.0",
    });
    const result = await client.runSessionCommand({
      query: "find auth flow",
      repoRoot: "/repo",
      queryClass: "search_file_discovery",
      limit: 2,
    });

    expect(result.method).toBe("query.search");
    expect(result.seamMethod).toBe("session.runCommand");
    expect(result.delegatedMethod).toBe("query.search");
    expect(result.engineName).toBe("dh-engine");
    expect(result.engineVersion).toBe("0.1.0");
    expect(result.protocolVersion).toBe("1");
    expect(result.items).toHaveLength(1);
    expect(result.evidence?.answerState).toBe("partial");
    expect(result.languageCapabilitySummary?.retrievalOnly).toBe(true);
    expect(calls).toEqual([
      {
        method: "query.search",
        params: {
          query: "find auth flow",
          workspaceRoot: "/repo",
          mode: "file_path",
          limit: 2,
        },
      },
    ]);
  });

  it("maps host JSON-RPC errors into bridge failure classifications", async () => {
    const { workerPeer, hostPeer, start } = connectPeers();
    hostPeer.onRequest("query.definition", () => {
      throw new Error("definition fixture failed");
    });
    start();

    const client = new HostBridgeClient(workerPeer);

    await expect(client.runAskQuery({
      query: "AuthController",
      repoRoot: "/repo",
      queryClass: "graph_definition",
    })).rejects.toMatchObject({
      code: "REQUEST_FAILED",
      phase: "request",
    } satisfies Partial<DhBridgeError>);
  });

  it("maps host timeouts without claiming lifecycle authority", async () => {
    const { workerPeer, hostPeer, start } = connectPeers();
    hostPeer.onRequest("query.search", () => new Promise(() => {
      // Intentionally never resolve.
    }));
    start();

    const client = new HostBridgeClient(workerPeer, { requestTimeoutMs: 5 });
    await expect(client.runAskQuery({
      query: "auth",
      repoRoot: "/repo",
      queryClass: "search_file_discovery",
    })).rejects.toMatchObject({
      code: "BRIDGE_TIMEOUT",
      phase: "request",
      retryable: true,
    } satisfies Partial<DhBridgeError>);
  });
});
