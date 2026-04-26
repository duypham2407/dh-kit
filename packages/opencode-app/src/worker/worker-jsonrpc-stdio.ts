import type { Readable, Writable } from "node:stream";

export type JsonRpcId = number | string;

export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
};

export type JsonRpcFailure = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  error: JsonRpcErrorPayload;
};

export type JsonRpcErrorPayload = {
  code: number;
  message: string;
  data?: unknown;
};

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

type JsonRpcIncomingMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

type PendingRequest = {
  resolve: (result: unknown) => void;
  reject: (error: JsonRpcPeerError) => void;
  timer: NodeJS.Timeout;
  method: string;
};

type RequestHandler = (params: unknown, request: JsonRpcRequest) => Promise<unknown> | unknown;
type NotificationHandler = (params: unknown, notification: JsonRpcNotification) => Promise<void> | void;
type AfterResponseHandler = (request: JsonRpcRequest) => Promise<void> | void;

export class JsonRpcResponseError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(input: { code: number; message: string; data?: unknown }) {
    super(input.message);
    this.name = "JsonRpcResponseError";
    this.code = input.code;
    this.data = input.data;
  }
}

export class JsonRpcPeerError extends Error {
  readonly kind: "closed" | "timeout" | "protocol" | "rpc";
  readonly method?: string;
  readonly rpcCode?: number;
  readonly rpcData?: unknown;

  constructor(input: {
    kind: "closed" | "timeout" | "protocol" | "rpc";
    message: string;
    method?: string;
    rpcCode?: number;
    rpcData?: unknown;
  }) {
    super(input.message);
    this.name = "JsonRpcPeerError";
    this.kind = input.kind;
    this.method = input.method;
    this.rpcCode = input.rpcCode;
    this.rpcData = input.rpcData;
  }
}

export class WorkerJsonRpcPeer {
  private readonly input: Readable;
  private readonly output: Writable;
  private readonly requestTimeoutMs: number;
  private readonly onProtocolError?: (error: Error) => void;
  private readonly requestHandlers = new Map<string, RequestHandler>();
  private readonly notificationHandlers = new Map<string, NotificationHandler>();
  private readonly afterResponseHandlers = new Map<string, AfterResponseHandler>();
  private readonly pending = new Map<JsonRpcId, PendingRequest>();

  private readBuffer = Buffer.alloc(0);
  private nextRequestId = 1;
  private started = false;
  private closed = false;

  constructor(input: {
    input: Readable;
    output: Writable;
    requestTimeoutMs?: number;
    onProtocolError?: (error: Error) => void;
  }) {
    this.input = input.input;
    this.output = input.output;
    this.requestTimeoutMs = input.requestTimeoutMs ?? 10_000;
    this.onProtocolError = input.onProtocolError;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.input.on("data", (chunk: Buffer | string) => {
      if (this.closed) {
        return;
      }
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, "utf8");
      this.readBuffer = Buffer.concat([this.readBuffer, bytes]);
      this.drainFrames();
    });

    this.input.on("error", (error: Error) => {
      this.failAllPending(new JsonRpcPeerError({
        kind: "protocol",
        message: `JSON-RPC input stream failed: ${error.message}`,
      }));
      this.onProtocolError?.(error);
    });

    this.input.on("end", () => {
      this.failAllPending(new JsonRpcPeerError({
        kind: "closed",
        message: "JSON-RPC input stream ended.",
      }));
    });
  }

  onRequest(method: string, handler: RequestHandler): void {
    this.requestHandlers.set(method, handler);
  }

  onNotification(method: string, handler: NotificationHandler): void {
    this.notificationHandlers.set(method, handler);
  }

  onAfterResponse(method: string, handler: AfterResponseHandler): void {
    this.afterResponseHandlers.set(method, handler);
  }

  request(method: string, params?: unknown, timeoutMs = this.requestTimeoutMs): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new JsonRpcPeerError({
        kind: "closed",
        method,
        message: "JSON-RPC peer is closed.",
      }));
    }

    const id = this.nextRequestId;
    this.nextRequestId += 1;
    const message: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new JsonRpcPeerError({
          kind: "timeout",
          method,
          message: `JSON-RPC request '${method}' timed out after ${timeoutMs}ms.`,
        }));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer, method });

      this.writeMessage(message).catch((error: Error) => {
        const pending = this.pending.get(id);
        if (!pending) {
          return;
        }
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(new JsonRpcPeerError({
          kind: "closed",
          method,
          message: `Failed to write JSON-RPC request '${method}': ${error.message}`,
        }));
      });
    });
  }

  notify(method: string, params?: unknown): Promise<void> {
    if (this.closed) {
      return Promise.reject(new JsonRpcPeerError({
        kind: "closed",
        method,
        message: "JSON-RPC peer is closed.",
      }));
    }

    return this.writeMessage({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.failAllPending(new JsonRpcPeerError({
      kind: "closed",
      message: "JSON-RPC peer was closed.",
    }));
  }

  private drainFrames(): void {
    while (true) {
      const headerEnd = findHeaderEnd(this.readBuffer);
      if (headerEnd === null) {
        return;
      }

      const header = this.readBuffer.subarray(0, headerEnd).toString("ascii");
      const contentLength = parseContentLength(header);
      if (contentLength === null || contentLength < 0) {
        this.handleProtocolError(new Error("JSON-RPC frame is missing a valid Content-Length header."));
        this.readBuffer = Buffer.alloc(0);
        return;
      }

      const bodyStart = headerEnd + 4;
      const frameLength = bodyStart + contentLength;
      if (this.readBuffer.length < frameLength) {
        return;
      }

      const body = this.readBuffer.subarray(bodyStart, frameLength).toString("utf8");
      this.readBuffer = this.readBuffer.subarray(frameLength);

      let parsed: JsonRpcIncomingMessage;
      try {
        parsed = JSON.parse(body) as JsonRpcIncomingMessage;
      } catch (error) {
        this.handleProtocolError(new Error(`JSON-RPC payload is not valid JSON: ${(error as Error).message}`));
        continue;
      }

      void this.handleIncoming(parsed);
    }
  }

  private async handleIncoming(message: JsonRpcIncomingMessage): Promise<void> {
    if (!isJsonRpcMessage(message)) {
      this.handleProtocolError(new Error("Ignoring malformed JSON-RPC message."));
      return;
    }

    if (isResponse(message)) {
      this.handleResponse(message);
      return;
    }

    if (isRequest(message)) {
      await this.handleRequest(message);
      return;
    }

    await this.handleNotification(message);
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    this.pending.delete(response.id);

    if ("error" in response) {
      pending.reject(new JsonRpcPeerError({
        kind: "rpc",
        method: pending.method,
        rpcCode: response.error.code,
        rpcData: response.error.data,
        message: response.error.message,
      }));
      return;
    }

    pending.resolve(response.result);
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    const handler = this.requestHandlers.get(request.method);
    if (!handler) {
      await this.writeErrorResponse(request.id, {
        code: -32601,
        message: `method not found: ${request.method}`,
      });
      return;
    }

    try {
      const result = await handler(request.params, request);
      await this.writeMessage({
        jsonrpc: "2.0",
        id: request.id,
        result,
      });
      await this.afterResponseHandlers.get(request.method)?.(request);
    } catch (error) {
      const payload = error instanceof JsonRpcResponseError
        ? { code: error.code, message: error.message, data: error.data }
        : {
          code: -32000,
          message: error instanceof Error ? error.message : "JSON-RPC request failed.",
        };
      await this.writeErrorResponse(request.id, payload);
    }
  }

  private async handleNotification(notification: JsonRpcNotification): Promise<void> {
    const handler = this.notificationHandlers.get(notification.method);
    if (!handler) {
      return;
    }

    try {
      await handler(notification.params, notification);
    } catch (error) {
      this.handleProtocolError(error instanceof Error ? error : new Error("JSON-RPC notification handler failed."));
    }
  }

  private writeErrorResponse(id: JsonRpcId, error: JsonRpcErrorPayload): Promise<void> {
    return this.writeMessage({
      jsonrpc: "2.0",
      id,
      error,
    });
  }

  private writeMessage(message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse): Promise<void> {
    const body = JSON.stringify(message);
    const frame = `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;

    return new Promise<void>((resolve, reject) => {
      this.output.write(frame, "utf8", (error?: Error | null) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private failAllPending(error: JsonRpcPeerError): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }

  private handleProtocolError(error: Error): void {
    this.onProtocolError?.(error);
    this.failAllPending(new JsonRpcPeerError({
      kind: "protocol",
      message: error.message,
    }));
  }
}

function findHeaderEnd(buffer: Buffer): number | null {
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

function parseContentLength(header: string): number | null {
  const lines = header.split("\r\n");
  for (const line of lines) {
    const [name, ...rest] = line.split(":");
    if (!name || rest.length === 0) {
      continue;
    }
    if (name.trim().toLowerCase() !== "content-length") {
      continue;
    }
    const parsed = Number.parseInt(rest.join(":").trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isJsonRpcMessage(message: JsonRpcIncomingMessage): boolean {
  return Boolean(message)
    && typeof message === "object"
    && !Array.isArray(message)
    && message.jsonrpc === "2.0";
}

function isRequest(message: JsonRpcIncomingMessage): message is JsonRpcRequest {
  return "id" in message && "method" in message;
}

function isResponse(message: JsonRpcIncomingMessage): message is JsonRpcResponse {
  return "id" in message && ("result" in message || "error" in message) && !("method" in message);
}
