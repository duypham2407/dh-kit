import { decode as decodeMsgpack, encode as encodeMsgpack } from "@msgpack/msgpack";

export const JSON_RPC_CODEC = "json-rpc-v1" as const;
export const MSGPACK_RPC_CODEC = "msgpack-rpc-v1" as const;

export type BridgeRpcCodec = typeof JSON_RPC_CODEC | typeof MSGPACK_RPC_CODEC;
export type BridgeCodecModeOverride = "auto" | "json" | "msgpack";

export const DEFAULT_BRIDGE_MAX_FRAME_BYTES = 16 * 1024 * 1024;
export const MIN_BRIDGE_MAX_FRAME_BYTES = 64 * 1024;
export const JSON_RPC_CONTENT_TYPE = "application/vscode-jsonrpc; charset=utf-8";
export const MSGPACK_RPC_CONTENT_TYPE = "application/x-msgpack; bridge=dh-jsonrpc; version=1";

export type BridgeFrameHeaders = {
  contentLength: number | null;
  contentType: string | null;
  malformedContentLength: boolean;
};

export function isValidBridgeMaxFrameBytes(value: number): boolean {
  return Number.isSafeInteger(value)
    && value >= MIN_BRIDGE_MAX_FRAME_BYTES
    && value <= DEFAULT_BRIDGE_MAX_FRAME_BYTES;
}

export function validateBridgeMaxFrameBytes(value: number): number {
  if (!isValidBridgeMaxFrameBytes(value)) {
    throw new RangeError(
      `maxFrameBytes must be an integer between ${MIN_BRIDGE_MAX_FRAME_BYTES} and ${DEFAULT_BRIDGE_MAX_FRAME_BYTES}; received ${value}.`,
    );
  }
  return value;
}

export function normalizeBridgeCodecModeOverride(value: unknown): BridgeCodecModeOverride {
  if (typeof value !== "string") {
    return "auto";
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "json" || normalized === "msgpack" || normalized === "auto") {
    return normalized;
  }

  return "auto";
}

export function findFrameHeaderEnd(buffer: Buffer): number | null {
  for (let index = 0; index <= buffer.length - 4; index += 1) {
    if (
      buffer[index] === 13
      && buffer[index + 1] === 10
      && buffer[index + 2] === 13
      && buffer[index + 3] === 10
    ) {
      return index;
    }
  }
  return null;
}

export function parseFrameHeaders(header: string): BridgeFrameHeaders {
  let contentLength: number | null = null;
  let contentType: string | null = null;
  let malformedContentLength = false;

  const lines = header.split("\r\n");
  for (const line of lines) {
    const [name, ...rest] = line.split(":");
    if (!name || rest.length === 0) {
      continue;
    }

    const normalizedName = name.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (normalizedName === "content-length") {
      if (contentLength !== null || !/^[0-9]+$/.test(value)) {
        malformedContentLength = true;
        contentLength = null;
        continue;
      }

      const parsed = Number(value);
      if (Number.isSafeInteger(parsed)) {
        contentLength = parsed;
      } else {
        malformedContentLength = true;
        contentLength = null;
      }
      continue;
    }

    if (normalizedName === "content-type") {
      contentType = value;
    }
  }

  return { contentLength, contentType, malformedContentLength };
}

export function encodeRpcBody(codec: BridgeRpcCodec, value: unknown): Buffer {
  if (codec === JSON_RPC_CODEC) {
    return Buffer.from(JSON.stringify(value), "utf8");
  }

  const encoded = encodeMsgpack(value, {
    ignoreUndefined: true,
    initialBufferSize: 4096,
  });
  return Buffer.from(encoded);
}

export function decodeRpcBody(codec: BridgeRpcCodec, body: Buffer, maxFrameBytes = DEFAULT_BRIDGE_MAX_FRAME_BYTES): unknown {
  validateBridgeMaxFrameBytes(maxFrameBytes);

  if (codec === JSON_RPC_CODEC) {
    return JSON.parse(body.toString("utf8"));
  }

  return decodeMsgpack(body, {
    maxStrLength: maxFrameBytes,
    maxBinLength: maxFrameBytes,
    maxArrayLength: 1_000_000,
    maxMapLength: 100_000,
  });
}

export function encodeRpcFrame(
  codec: BridgeRpcCodec,
  value: unknown,
  maxFrameBytes = DEFAULT_BRIDGE_MAX_FRAME_BYTES,
): Buffer {
  validateBridgeMaxFrameBytes(maxFrameBytes);

  const body = encodeRpcBody(codec, value);
  if (body.length > maxFrameBytes) {
    throw new Error(`RPC frame body is ${body.length} bytes, exceeding maxFrameBytes=${maxFrameBytes}.`);
  }

  const header = `Content-Length: ${body.length}\r\nContent-Type: ${contentTypeForCodec(codec)}\r\n\r\n`;
  return Buffer.concat([Buffer.from(header, "ascii"), body]);
}

export function contentTypeForCodec(codec: BridgeRpcCodec): string {
  return codec === MSGPACK_RPC_CODEC ? MSGPACK_RPC_CONTENT_TYPE : JSON_RPC_CONTENT_TYPE;
}
