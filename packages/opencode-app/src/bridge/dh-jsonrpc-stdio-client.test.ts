import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";
import * as bridgeModule from "./dh-jsonrpc-stdio-client.js";
import {
  type BridgeSessionRunCommandRequest,
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
    methods: ["dh.initialize", "query.search", "query.definition", "query.relationship", "query.buildEvidence"],
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
  it("delegates graph_build_evidence through session.runCommand as named query.buildEvidence", async () => {
    const delegatedCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "session.runCommand") {
        const query = (request.params?.query ?? {}) as {
          method?: string;
          params?: Record<string, unknown>;
        };
        delegatedCalls.push({
          method: query.method ?? "",
          params: query.params ?? {},
        });
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            method: "query.buildEvidence",
            answerState: "grounded",
            questionClass: "build_evidence",
            items: [],
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
                },
              ],
              gaps: [],
              bounds: {
                traversalScope: "build_evidence",
                hopCount: 2,
                nodeLimit: 5,
              },
            },
          },
        });
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    const result = await client.runSessionCommand!({
      query: "how does auth work?",
      repoRoot: process.cwd(),
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
    expect(result.evidence?.questionClass).toBe("build_evidence");
    expect(result.evidence?.evidence).toHaveLength(1);
    expect(result.capabilities.methods).toContain("query.buildEvidence");
    expect(delegatedCalls).toEqual([
      {
        method: "query.buildEvidence",
        params: {
          query: "how does auth work?",
          workspaceRoot: process.cwd(),
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
    await client.close();
  });

  it("parses build-evidence partial insufficient and unsupported packet states from Rust", async () => {
    const states = ["partial", "insufficient", "unsupported"] as const;

    for (const state of states) {
      const spawnChild = spawnFake((request, child) => {
        if (request.method === "dh.initialize") {
          child.emitJsonResponse({
            jsonrpc: "2.0",
            id: request.id,
            result: v2InitializeResult,
          });
          return;
        }

        if (request.method === "query.buildEvidence") {
          child.emitJsonResponse({
            jsonrpc: "2.0",
            id: request.id,
            result: {
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
            },
          });
        }
      });

      const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
      const result = await client.runAskQuery({
        query: `how does ${state} work?`,
        repoRoot: process.cwd(),
        queryClass: "graph_build_evidence",
        targets: [state],
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
      await client.close();
    }
  });

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

  it("does not expose runtime, file, or tool utility wrappers on the RHBE query bridge", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    expect("getRuntimePing" in client).toBe(false);
    expect("getRuntimeHealth" in client).toBe(false);
    expect("getRuntimeDiagnostics" in client).toBe(false);
    expect("fileRead" in client).toBe(false);
    expect("fileReadRange" in client).toBe(false);
    expect("fileList" in client).toBe(false);
    expect("toolExecute" in client).toBe(false);
    await client.close();
  });

  it("keeps runtime file and tool utility type contracts out of the RHBE bridge source", async () => {
    const source = await readFile(
      fileURLToPath(new URL("./dh-jsonrpc-stdio-client.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/BridgeRuntime(Ping|Health|Diagnostics)Result/);
    expect(source).not.toMatch(/BridgeFile(Read|ReadRange|List)(Request|Result)/);
    expect(source).not.toMatch(/BridgeToolExecute(Request|Result)/);
    expect(source).not.toMatch(/\bgetRuntime(Ping|Health|Diagnostics)\??:/);
    expect(source).not.toMatch(/\bfile(Read|ReadRange|List)\??:/);
    expect(source).not.toMatch(/\btoolExecute\??:/);

    expect(Object.keys(bridgeModule).filter((name) => name.startsWith("BridgeRuntime"))).toEqual([]);
    expect(Object.keys(bridgeModule).filter((name) => name.startsWith("BridgeFile"))).toEqual([]);
    expect(Object.keys(bridgeModule).filter((name) => name.startsWith("BridgeTool"))).toEqual([]);
  });

  it("delegates bounded first-wave query classes through session.runCommand", async () => {
    const delegatedCalls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const callMethods: string[] = [];

    const spawnChild = spawnFake((request, child) => {
      callMethods.push(request.method);

      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "session.runCommand") {
        const query = (request.params?.query ?? {}) as {
          method?: string;
          params?: Record<string, unknown>;
        };
        delegatedCalls.push({
          method: query.method ?? "",
          params: query.params ?? {},
        });
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            answerState: "grounded",
            questionClass: "search_file_discovery",
            items: [],
          },
        });
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });

    const searchResult = await client.runSessionCommand!({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "search_file_discovery",
      limit: 2,
    });
    const definitionResult = await client.runSessionCommand!({
      query: "AuthController",
      repoRoot: process.cwd(),
      queryClass: "graph_definition",
      limit: 2,
    });
    const usageResult = await client.runSessionCommand!({
      query: "AuthController",
      repoRoot: process.cwd(),
      queryClass: "graph_relationship_usage",
      limit: 2,
    });
    const dependenciesResult = await client.runSessionCommand!({
      query: "ignored-by-target-path",
      repoRoot: process.cwd(),
      queryClass: "graph_relationship_dependencies",
      targetPath: "src/auth.ts",
      limit: 2,
    });
    const dependentsResult = await client.runSessionCommand!({
      query: "ignored-by-target-path",
      repoRoot: process.cwd(),
      queryClass: "graph_relationship_dependents",
      targetPath: "src/auth.ts",
      limit: 2,
    });

    expect(searchResult.seamMethod).toBe("session.runCommand");
    expect(searchResult.delegatedMethod).toBe("query.search");
    expect(definitionResult.seamMethod).toBe("session.runCommand");
    expect(definitionResult.delegatedMethod).toBe("query.definition");
    expect(usageResult.seamMethod).toBe("session.runCommand");
    expect(usageResult.delegatedMethod).toBe("query.relationship");
    expect(dependenciesResult.seamMethod).toBe("session.runCommand");
    expect(dependenciesResult.delegatedMethod).toBe("query.relationship");
    expect(dependentsResult.seamMethod).toBe("session.runCommand");
    expect(dependentsResult.delegatedMethod).toBe("query.relationship");

    expect(callMethods.filter((method) => method !== "dh.initialize")).toEqual([
      "session.runCommand",
      "session.runCommand",
      "session.runCommand",
      "session.runCommand",
      "session.runCommand",
    ]);

    expect(delegatedCalls).toHaveLength(5);
    expect(delegatedCalls[0]).toMatchObject({
      method: "query.search",
      params: {
        mode: "file_path",
      },
    });
    expect(delegatedCalls[1]).toMatchObject({
      method: "query.definition",
    });
    expect(delegatedCalls[2]).toMatchObject({
      method: "query.relationship",
      params: {
        relation: "usage",
      },
    });
    expect(delegatedCalls[3]).toMatchObject({
      method: "query.relationship",
      params: {
        relation: "dependencies",
        filePath: "src/auth.ts",
      },
    });
    expect(delegatedCalls[4]).toMatchObject({
      method: "query.relationship",
      params: {
        relation: "dependents",
        target: "src/auth.ts",
      },
    });

    await client.close();
  });

  it("fails unsupported session.runCommand query class explicitly", async () => {
    const callMethods: string[] = [];
    const spawnChild = spawnFake((request, child) => {
      callMethods.push(request.method);
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runSessionCommand!({
      query: "auth",
      repoRoot: process.cwd(),
      queryClass: "graph_trace_flow",
    } as unknown as BridgeSessionRunCommandRequest)).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      phase: "request",
    } satisfies Partial<DhBridgeError>);
    expect(callMethods).toEqual(["dh.initialize"]);
    await client.close();
  });

  it("surfaces explicit session.runCommand refusal as CAPABILITY_UNSUPPORTED", async () => {
    const spawnChild = spawnFake((request, child) => {
      if (request.method === "dh.initialize") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          result: v2InitializeResult,
        });
        return;
      }

      if (request.method === "session.runCommand") {
        child.emitJsonResponse({
          jsonrpc: "2.0",
          id: request.id,
          error: {
            code: -32600,
            message: "session.runCommand does not support method: query.traceFlow",
            data: {
              code: "CAPABILITY_UNSUPPORTED",
            },
          },
        });
      }
    });

    const client = createDhJsonRpcStdioClient(process.cwd(), { spawnChild });
    await expect(client.runSessionCommand!({
      query: "AuthController",
      repoRoot: process.cwd(),
      queryClass: "graph_definition",
      limit: 1,
    })).rejects.toMatchObject({
      code: "CAPABILITY_UNSUPPORTED",
      phase: "request",
    } satisfies Partial<DhBridgeError>);
    await client.close();
  });
});
