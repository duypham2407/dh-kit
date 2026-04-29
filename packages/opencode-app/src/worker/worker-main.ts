import { stdin, stdout } from "node:process";
import {
  HOST_BACKED_BRIDGE_PROTOCOL_VERSION,
  createHostBridgeClient,
} from "./host-bridge-client.js";
import { WorkerCommandRouter, type WorkerRunCommandParams, type WorkerRunLaneParams } from "./worker-command-router.js";
import { JsonRpcResponseError, WorkerJsonRpcPeer } from "./worker-jsonrpc-stdio.js";
import { z } from "zod";

const WORKER_PROTOCOL_VERSION = "1";

type InitializeParams = {
  protocolVersion?: string;
  workspaceRoot?: string;
  platform?: string;
  topology?: string;
  supportBoundary?: string;
  lifecycleAuthority?: string;
  hostIdentity?: {
    name?: string;
    version?: string;
  };
};

export type WorkerRuntime = {
  peer: WorkerJsonRpcPeer;
  initialized: boolean;
  readySent: boolean;
  router?: WorkerCommandRouter;
  defaultRepoRoot: string;
  shutdownRequested: boolean;
  start: () => void;
};

export function createWorkerRuntime(input: {
  peer: WorkerJsonRpcPeer;
  defaultRepoRoot?: string;
  requestTimeoutMs?: number;
  onShutdown?: () => Promise<void> | void;
}): WorkerRuntime {
  const runtime: WorkerRuntime = {
    peer: input.peer,
    initialized: false,
    readySent: false,
    defaultRepoRoot: input.defaultRepoRoot ?? process.cwd(),
    shutdownRequested: false,
    start() {
      input.peer.start();
    },
  };

  input.peer.onRequest("dh.initialize", async (params) => {
    const initializeParams = asInitializeParams(params);
    if (initializeParams.protocolVersion !== WORKER_PROTOCOL_VERSION) {
      throw new JsonRpcResponseError({
        code: -32602,
        message: `Unsupported worker protocolVersion '${initializeParams.protocolVersion ?? "missing"}'.`,
        data: { code: "PROTOCOL_MISMATCH" },
      });
    }
    if (initializeParams.lifecycleAuthority && initializeParams.lifecycleAuthority !== "rust") {
      throw new JsonRpcResponseError({
        code: -32602,
        message: "TypeScript worker requires Rust host lifecycle authority on this path.",
        data: { code: "INVALID_LIFECYCLE_AUTHORITY" },
      });
    }

    runtime.defaultRepoRoot = initializeParams.workspaceRoot ?? runtime.defaultRepoRoot;
    const bridgeClient = createHostBridgeClient(input.peer, {
      protocolVersion: HOST_BACKED_BRIDGE_PROTOCOL_VERSION,
      engineName: initializeParams.hostIdentity?.name ?? "dh-engine",
      engineVersion: initializeParams.hostIdentity?.version ?? "host-managed",
      requestTimeoutMs: input.requestTimeoutMs,
    });
    runtime.router = new WorkerCommandRouter({
      bridgeClient,
      defaultRepoRoot: runtime.defaultRepoRoot,
    });
    runtime.initialized = true;

    return {
      workerId: "dh-typescript-worker",
      protocolVersion: WORKER_PROTOCOL_VERSION,
      workerProtocolVersion: WORKER_PROTOCOL_VERSION,
      role: "typescript_worker",
      lifecycleAuthority: "rust",
      capabilities: {
        commands: ["ask", "explain", "trace"],
        hostBackedBridgeClient: true,
        lifecycleAuthority: "rust",
      },
      bootstrapWarnings: [],
    };
  });

  input.peer.onNotification("dh.initialized", async () => {
    await markReady(runtime);
  });
  input.peer.onRequest("dh.initialized", async () => {
    await markReady(runtime);
    return { accepted: true };
  });

  input.peer.onRequest("runtime.ping", () => {
    return {
      ok: runtime.initialized && !runtime.shutdownRequested,
      workerState: runtime.shutdownRequested ? "shutting_down" : runtime.readySent ? "ready" : "spawned_not_ready",
      healthState: runtime.initialized && !runtime.shutdownRequested ? "healthy" : "unknown",
      phase: "health",
    };
  });

  input.peer.onNotification("session.cancel", () => {
    runtime.router?.cancel();
  });
  input.peer.onRequest("session.cancel", () => {
    runtime.router?.cancel();
    return { accepted: true };
  });

  input.peer.onRequest("session.runCommand", async (params) => {
    if (!runtime.initialized || !runtime.router) {
      throw new JsonRpcResponseError({
        code: -32000,
        message: "Worker is not initialized for session.runCommand.",
      });
    }
    if (!runtime.readySent) {
      await markReady(runtime);
    }

    return runtime.router.runCommand(asRunCommandParams(params));
  });

  input.peer.onRequest("session.runLane", async (params) => {
    if (!runtime.initialized || !runtime.router) {
      throw new JsonRpcResponseError({
        code: -32000,
        message: "Worker is not initialized for session.runLane.",
      });
    }
    if (!runtime.readySent) {
      await markReady(runtime);
    }

    return runtime.router.runLane(asRunLaneParams(params));
  });

  input.peer.onRequest("dh.shutdown", async () => {
    runtime.shutdownRequested = true;
    await runtime.router?.close();
    return { accepted: true };
  });
  input.peer.onAfterResponse("dh.shutdown", () => input.onShutdown?.());

  return runtime;
}

async function markReady(runtime: WorkerRuntime): Promise<void> {
  if (runtime.readySent) {
    return;
  }
  if (!runtime.initialized) {
    throw new JsonRpcResponseError({
      code: -32000,
      message: "Worker cannot report ready before dh.initialize succeeds.",
    });
  }
  runtime.readySent = true;
  await runtime.peer.notify("dh.ready", {
    ready: true,
    workerState: "ready",
    role: "typescript_worker",
  });
}

const InitializeParamsSchema = z.object({
  protocolVersion: z.string().optional(),
  workspaceRoot: z.string().optional(),
  platform: z.string().optional(),
  topology: z.string().optional(),
  supportBoundary: z.string().optional(),
  lifecycleAuthority: z.string().optional(),
  hostIdentity: z.object({
    name: z.string().optional(),
    version: z.string().optional(),
  }).optional(),
});

const WorkerRunCommandParamsSchema = z.object({
  command: z.enum(["ask", "explain", "trace"]).optional(),
  kind: z.enum(["ask", "explain", "trace"]).optional(),
  input: z.string().optional(),
  prompt: z.string().optional(),
  query: z.string().optional(),
  workspaceRoot: z.string().optional(),
  repoRoot: z.string().optional(),
  resumeSessionId: z.string().optional(),
  outputMode: z.enum(["text", "json"]).optional(),
  replaySafety: z.enum(["replay_safe_read_only", "replay_unsafe", "uncertain"]).optional(),
});

function asInitializeParams(value: unknown): InitializeParams {
  const result = InitializeParamsSchema.safeParse(value);
  if (!result.success) {
    throw new JsonRpcResponseError({
      code: -32602,
      message: `Invalid InitializeParams: ${result.error.message}`,
      data: result.error.format(),
    });
  }
  return result.data;
}

function asRunCommandParams(value: unknown): WorkerRunCommandParams {
  const result = WorkerRunCommandParamsSchema.safeParse(value);
  if (!result.success) {
    throw new JsonRpcResponseError({
      code: -32602,
      message: `Invalid session.runCommand params: ${result.error.message}`,
      data: result.error.format(),
    });
  }
  return result.data;
}

const WorkerRunLaneParamsSchema = z.object({
  lane: z.enum(["quick", "delivery", "migration"]),
  objective: z.string(),
  repoRoot: z.string().optional(),
  resumeSessionId: z.string().optional(),
});

function asRunLaneParams(value: unknown): WorkerRunLaneParams {
  const result = WorkerRunLaneParamsSchema.safeParse(value);
  if (!result.success) {
    throw new JsonRpcResponseError({
      code: -32602,
      message: `Invalid session.runLane params: ${result.error.message}`,
      data: result.error.format(),
    });
  }
  return result.data;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], "file:").href) {
  const peer = new WorkerJsonRpcPeer({
    input: stdin,
    output: stdout,
    onProtocolError(error) {
      process.stderr.write(`[dh-worker] ${error.message}\n`);
    },
  });
  const runtime = createWorkerRuntime({
    peer,
    onShutdown() {
      process.exit(0);
    },
  });
  runtime.start();
}
