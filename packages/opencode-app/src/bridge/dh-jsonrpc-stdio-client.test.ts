import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import {
  createDhJsonRpcStdioClient,
  DhBridgeError,
} from "./dh-jsonrpc-stdio-client.js";

type RpcHandler = (request: { id: number; method: string; params?: Record<string, unknown> }, child: FakeChildProcess) => void;

class FakeChildProcess extends EventEmitter {
  readonly stdout = new EventEmitter();
  readonly stderr = new EventEmitter();
  readonly stdin: {
    write: (chunk: string, encoding: BufferEncoding, cb?: (error?: Error | null) => void) => boolean;
  };
  killed = false;

  constructor(private readonly handler: RpcHandler) {
    super();
    this.stdin = {
      write: (chunk, _encoding, cb) => {
        const request = parseFrame(chunk);
        this.handler(request, this);
        cb?.(null);
        return true;
      },
    };
  }

  kill(): boolean {
    this.killed = true;
    this.emit("exit", 0, null);
    return true;
  }

  emitJsonResponse(payload: Record<string, unknown>, splitAtBytes?: number): void {
    const body = JSON.stringify(payload);
    const frame = Buffer.from(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`, "utf8");
    if (!splitAtBytes || splitAtBytes <= 0 || splitAtBytes >= frame.length) {
      this.stdout.emit("data", frame);
      return;
    }

    this.stdout.emit("data", frame.subarray(0, splitAtBytes));
    this.stdout.emit("data", frame.subarray(splitAtBytes));
  }
}

function parseFrame(frame: string): { id: number; method: string; params?: Record<string, unknown> } {
  const headerEnd = frame.indexOf("\r\n\r\n");
  const body = frame.slice(headerEnd + 4);
  return JSON.parse(body) as { id: number; method: string; params?: Record<string, unknown> };
}

function spawnFake(handler: RpcHandler): (command: string, args: string[], options: SpawnOptionsWithoutStdio) => ChildProcessWithoutNullStreams {
  return () => new FakeChildProcess(handler) as unknown as ChildProcessWithoutNullStreams;
}

const v2InitializeResult = {
  serverName: "dh-engine",
  serverVersion: "0.1.0",
  protocolVersion: "1",
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
};

describe("dh-jsonrpc-stdio-client", () => {
  it("parses multibyte payload with byte-oriented framing", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "query.search") {
        child.emitJsonResponse(
          {
            jsonrpc: "2.0",
            id: request.id,
            result: {
              answerState: "partial",
              questionClass: "search_file_discovery",
              items: [
                {
                  filePath: "src/auth.ts",
                  lineStart: 10,
                  lineEnd: 10,
                  snippet: "đăng nhập 🔐 thành công",
                  reason: "unicode payload",
                  score: 0.88,
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
                    lineStart: 10,
                    lineEnd: 10,
                    reason: "unicode payload",
                    source: "query",
                    confidence: "partial",
                    snippet: "đăng nhập 🔐 thành công",
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
            },
          },
          37,
        );
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    const result = await client.runAskQuery({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 1,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.snippet).toBe("đăng nhập 🔐 thành công");
    expect(result.answerState).toBe("partial");
    expect(result.questionClass).toBe("search_file_discovery");
    expect(result.evidence?.answerState).toBe("partial");
    expect(result.languageCapabilitySummary?.retrievalOnly).toBe(true);
    await client.close();
  });

  it("keeps startup failures classified as startup phase", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emit("error", new Error("spawn failed"));
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runAskQuery({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 1,
    })).rejects.toMatchObject({
      code: "BRIDGE_STARTUP_FAILED",
      phase: "startup",
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });

  it("keeps request failures classified as request phase", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "query.search") {
        child.emit("exit", 2, null);
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runAskQuery({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 1,
    })).rejects.toMatchObject({
      code: "BRIDGE_UNREACHABLE",
      phase: "request",
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });

  it("surfaces unsupported relation as METHOD_NOT_SUPPORTED", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "query.relationship") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32601,
            message: "query.relationship relation not supported in bridge contract v2: impact",
          },
        });
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runAskQuery({
      query: "impact helper",
      repoRoot: process.cwd(),
      queryClass: "graph_relationship_dependents",
      targetPath: "impact",
      limit: 1,
    })).rejects.toMatchObject({
      code: "METHOD_NOT_SUPPORTED",
      phase: "request",
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });

  it("surfaces request timeout with retryable classification", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "query.search") {
        // Intentionally no response to trigger timeout.
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), {
      spawnChild,
      requestTimeoutMs: 5,
    });
    await expect(client.runAskQuery({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 1,
    })).rejects.toMatchObject({
      code: "BRIDGE_TIMEOUT",
      phase: "request",
      retryable: true,
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });

  it("keeps malformed startup protocol responses in startup phase", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.stdout.emit("data", Buffer.from("Content-Length: 1\r\n\r\n{", "utf8"));
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runAskQuery({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 1,
    })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      phase: "startup",
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });

  it("keeps malformed request protocol responses in request phase", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "query.search") {
        child.stdout.emit("data", Buffer.from("Content-Length: 1\r\n\r\n{", "utf8"));
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runAskQuery({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 1,
    })).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      phase: "request",
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });
});
