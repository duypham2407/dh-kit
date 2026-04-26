import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { JsonRpcResponseError, WorkerJsonRpcPeer } from "./worker-jsonrpc-stdio.js";

function connectPeers(): {
  left: WorkerJsonRpcPeer;
  right: WorkerJsonRpcPeer;
  start: () => void;
} {
  const leftToRight = new PassThrough();
  const rightToLeft = new PassThrough();
  const left = new WorkerJsonRpcPeer({ input: rightToLeft, output: leftToRight });
  const right = new WorkerJsonRpcPeer({ input: leftToRight, output: rightToLeft });
  return {
    left,
    right,
    start() {
      left.start();
      right.start();
    },
  };
}

describe("WorkerJsonRpcPeer", () => {
  it("round-trips byte-framed JSON-RPC requests and notifications", async () => {
    const { left: host, right: worker, start } = connectPeers();
    const notifications: unknown[] = [];

    worker.onRequest("runtime.ping", () => {
      return {
        ok: true,
        workerState: "ready",
        healthState: "healthy",
        phase: "health",
      };
    });
    host.onNotification("dh.ready", (params) => {
      notifications.push(params);
    });
    start();

    await worker.notify("dh.ready", { ready: true, workerState: "ready" });
    const result = await host.request("runtime.ping", {});

    expect(result).toEqual({
      ok: true,
      workerState: "ready",
      healthState: "healthy",
      phase: "health",
    });
    expect(notifications).toEqual([{ ready: true, workerState: "ready" }]);
  });

  it("surfaces JSON-RPC handler errors to the caller", async () => {
    const { left: host, right: worker, start } = connectPeers();
    worker.onRequest("query.search", () => {
      throw new JsonRpcResponseError({
        code: -32602,
        message: "query.search requires query",
        data: { code: "INVALID_REQUEST" },
      });
    });
    start();

    await expect(host.request("query.search", {})).rejects.toMatchObject({
      kind: "rpc",
      rpcCode: -32602,
      rpcData: { code: "INVALID_REQUEST" },
    });
  });

  it("uses byte length for unicode payload framing", async () => {
    const { left: host, right: worker, start } = connectPeers();
    worker.onRequest("query.search", (params) => {
      return {
        echoed: params,
        snippet: "đăng nhập 🔐 thành công",
      };
    });
    start();

    await expect(host.request("query.search", {
      query: "đăng nhập 🔐",
    })).resolves.toEqual({
      echoed: {
        query: "đăng nhập 🔐",
      },
      snippet: "đăng nhập 🔐 thành công",
    });
  });
});
