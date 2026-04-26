import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { createWorkerRuntime } from "./worker-main.js";
import { WorkerJsonRpcPeer } from "./worker-jsonrpc-stdio.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-worker-main-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function connectHostAndWorker(repoRoot: string): {
  hostPeer: WorkerJsonRpcPeer;
  start: () => void;
} {
  const hostToWorker = new PassThrough();
  const workerToHost = new PassThrough();
  const hostPeer = new WorkerJsonRpcPeer({ input: workerToHost, output: hostToWorker });
  const workerPeer = new WorkerJsonRpcPeer({ input: hostToWorker, output: workerToHost });
  const runtime = createWorkerRuntime({
    peer: workerPeer,
    defaultRepoRoot: repoRoot,
    requestTimeoutMs: 1_000,
  });

  return {
    hostPeer,
    start() {
      hostPeer.start();
      runtime.start();
    },
  };
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
  }
  repos = [];
});

describe("worker-main", () => {
  it("handshakes with Rust lifecycle authority and emits ready only after dh.initialized", async () => {
    const repo = makeRepo();
    const { hostPeer, start } = connectHostAndWorker(repo);
    const notifications: unknown[] = [];
    hostPeer.onNotification("dh.ready", (params) => {
      notifications.push(params);
    });
    start();

    const initializeResult = await hostPeer.request("dh.initialize", {
      protocolVersion: "1",
      workspaceRoot: repo,
      topology: "rust_host_ts_worker",
      supportBoundary: "knowledge_commands_first_wave",
      lifecycleAuthority: "rust",
    });

    expect(initializeResult).toMatchObject({
      workerId: "dh-typescript-worker",
      protocolVersion: "1",
      workerProtocolVersion: "1",
      role: "typescript_worker",
      lifecycleAuthority: "rust",
      capabilities: {
        hostBackedBridgeClient: true,
        lifecycleAuthority: "rust",
      },
    });
    expect(notifications).toEqual([]);

    await hostPeer.notify("dh.initialized", { accepted: true });
    await new Promise((resolve) => setImmediate(resolve));

    expect(notifications).toEqual([
      {
        ready: true,
        workerState: "ready",
        role: "typescript_worker",
      },
    ]);
  });

  it("answers ping with worker-local facts and no host lifecycle envelope", async () => {
    const repo = makeRepo();
    const { hostPeer, start } = connectHostAndWorker(repo);
    start();

    await hostPeer.request("dh.initialize", {
      protocolVersion: "1",
      workspaceRoot: repo,
      lifecycleAuthority: "rust",
    });
    await hostPeer.request("dh.initialized", { accepted: true });

    await expect(hostPeer.request("runtime.ping", {})).resolves.toEqual({
      ok: true,
      workerState: "ready",
      healthState: "healthy",
      phase: "health",
    });
  });

  it("runs a knowledge command with host-backed reverse RPC for query evidence", async () => {
    const repo = makeRepo();
    const { hostPeer, start } = connectHostAndWorker(repo);
    const reverseCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    hostPeer.onRequest("query.search", (params) => {
      reverseCalls.push({ method: "query.search", params: params as Record<string, unknown> });
      return {
        answerState: "partial",
        questionClass: "search_file_discovery",
        items: [
          {
            filePath: "src/auth.ts",
            lineStart: 1,
            lineEnd: 3,
            snippet: "export function auth() {}",
            reason: "file path match",
            score: 0.8,
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
              lineStart: 1,
              lineEnd: 3,
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

    await hostPeer.request("dh.initialize", {
      protocolVersion: "1",
      workspaceRoot: repo,
      lifecycleAuthority: "rust",
    });
    await hostPeer.request("dh.initialized", { accepted: true });

    const result = await hostPeer.request("session.runCommand", {
      command: "ask",
      input: "find auth flow",
      workspaceRoot: repo,
      replaySafety: "replay_safe_read_only",
    });

    expect(result).toMatchObject({
      report: {
        exitCode: 0,
        command: "ask",
        answerState: "partial",
        bridgeEvidence: {
          rustBacked: true,
          seamMethod: "session.runCommand",
          delegatedMethod: "query.search",
        },
      },
    });
    expect((result as { report: { executionBoundary?: unknown } }).report.executionBoundary).toBeUndefined();
    expect(reverseCalls).toEqual([
      {
        method: "query.search",
        params: {
          query: "find auth flow",
          workspaceRoot: repo,
          mode: "file_path",
          limit: 5,
        },
      },
    ]);
  });

  it("rejects non-Rust lifecycle authority during initialization", async () => {
    const repo = makeRepo();
    const { hostPeer, start } = connectHostAndWorker(repo);
    start();

    await expect(hostPeer.request("dh.initialize", {
      protocolVersion: "1",
      workspaceRoot: repo,
      lifecycleAuthority: "typescript",
    })).rejects.toMatchObject({
      kind: "rpc",
      rpcCode: -32602,
      rpcData: { code: "INVALID_LIFECYCLE_AUTHORITY" },
    });
  });
});
