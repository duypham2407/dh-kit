import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { MIN_BRIDGE_MAX_FRAME_BYTES, MSGPACK_RPC_CODEC, type BridgeRpcCodec } from "../bridge/stdio-codec.js";
import { JsonRpcResponseError, WorkerJsonRpcPeer } from "./worker-jsonrpc-stdio.js";

function connectPeers(codec?: BridgeRpcCodec, maxFrameBytes?: number): {
  left: WorkerJsonRpcPeer;
  right: WorkerJsonRpcPeer;
  start: () => void;
} {
  const leftToRight = new PassThrough();
  const rightToLeft = new PassThrough();
  const left = new WorkerJsonRpcPeer({ input: rightToLeft, output: leftToRight, codec, maxFrameBytes });
  const right = new WorkerJsonRpcPeer({ input: leftToRight, output: rightToLeft, codec, maxFrameBytes });
  return {
    left,
    right,
    start() {
      left.start();
      right.start();
    },
  };
}

function connectPeerWithProtocolCapture(options?: { codec?: BridgeRpcCodec; maxFrameBytes?: number }): {
  peer: WorkerJsonRpcPeer;
  input: PassThrough;
  protocolErrors: Error[];
  start: () => void;
} {
  const input = new PassThrough();
  const output = new PassThrough();
  const protocolErrors: Error[] = [];
  const peer = new WorkerJsonRpcPeer({
    input,
    output,
    codec: options?.codec,
    maxFrameBytes: options?.maxFrameBytes,
    onProtocolError(error) {
      protocolErrors.push(error);
    },
  });
  return {
    peer,
    input,
    protocolErrors,
    start() {
      peer.start();
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

  it("round-trips MessagePack-framed large payloads", async () => {
    const { left: host, right: worker, start } = connectPeers(MSGPACK_RPC_CODEC);
    const vector = Array.from({ length: 1536 }, (_, index) => index / 1536);
    const ast = {
      kind: "module",
      children: Array.from({ length: 256 }, (_, index) => ({ kind: "node", index })),
    };
    worker.onRequest("query.buildEvidence", (params) => ({ echoed: params }));
    start();

    await expect(host.request("query.buildEvidence", {
      query: "large vector",
      semanticVector: vector,
      ast,
    })).resolves.toEqual({
      echoed: {
        query: "large vector",
        semanticVector: vector,
        ast,
      },
    });
  });

  it("surfaces malformed MessagePack payloads as protocol errors", async () => {
    const { input, protocolErrors, start } = connectPeerWithProtocolCapture({ codec: MSGPACK_RPC_CODEC });
    start();
    input.write(Buffer.from("Content-Length: 1\r\nContent-Type: application/x-msgpack\r\n\r\n\xc1", "binary"));

    expect(protocolErrors).toHaveLength(1);
    expect(protocolErrors[0]?.message).toContain("could not be decoded as msgpack-rpc-v1");
  });

  it("surfaces oversized MessagePack frames before reading a body", async () => {
    const { input, protocolErrors, start } = connectPeerWithProtocolCapture({
      codec: MSGPACK_RPC_CODEC,
      maxFrameBytes: MIN_BRIDGE_MAX_FRAME_BYTES,
    });
    start();
    input.write(Buffer.from(`Content-Length: ${MIN_BRIDGE_MAX_FRAME_BYTES + 1}\r\nContent-Type: application/x-msgpack\r\n\r\n`, "ascii"));

    expect(protocolErrors).toHaveLength(1);
    expect(protocolErrors[0]?.message).toContain("exceeding maxFrameBytes");
  });

  it("surfaces truncated MessagePack frames when the stream ends", async () => {
    const { input, protocolErrors, start } = connectPeerWithProtocolCapture({ codec: MSGPACK_RPC_CODEC });
    start();
    input.end(Buffer.from("Content-Length: 10\r\nContent-Type: application/x-msgpack\r\n\r\nabc", "binary"));
    await new Promise((resolve) => setImmediate(resolve));

    expect(protocolErrors).toHaveLength(1);
    expect(protocolErrors[0]?.message).toContain("truncated frame");
  });

  it("rejects maxFrameBytes lower than the supported bridge floor", () => {
    const input = new PassThrough();
    const output = new PassThrough();

    expect(() => new WorkerJsonRpcPeer({
      input,
      output,
      codec: MSGPACK_RPC_CODEC,
      maxFrameBytes: MIN_BRIDGE_MAX_FRAME_BYTES - 1,
    })).toThrow(/maxFrameBytes/);
  });

  it("rejects duplicate and non-numeric Content-Length headers", async () => {
    for (const rawFrame of [
      "Content-Length: 2\r\nContent-Length: 2\r\n\r\n{}",
      "Content-Length: 1junk\r\n\r\n{}",
    ]) {
      const { input, protocolErrors, start } = connectPeerWithProtocolCapture();
      start();
      input.write(Buffer.from(rawFrame, "utf8"));
      expect(protocolErrors).toHaveLength(1);
      expect(protocolErrors[0]?.message).toContain("Content-Length");
    }
  });

  it("rejects outbound frames above maxFrameBytes", async () => {
    const { left: host, right: worker, start } = connectPeers(undefined, MIN_BRIDGE_MAX_FRAME_BYTES);
    worker.onRequest("query.search", () => ({ ok: true }));
    start();

    await expect(host.request("query.search", {
      payload: "x".repeat(MIN_BRIDGE_MAX_FRAME_BYTES),
    })).rejects.toThrow(/maxFrameBytes/);
  });
});
