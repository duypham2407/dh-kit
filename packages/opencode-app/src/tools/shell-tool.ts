import { spawn } from "node:child_process";
import type { RunEventPayload, RunEventType } from "../../../shared/src/types/run.js";
import { evaluateShellPermission } from "../../../runtime/src/hooks/bash-guard.js";
import type { ToolInputMap, ToolPermissionLevel, ToolResultEnvelope } from "./schemas.js";
import { resolveRepoPath } from "./tool-paths.js";

export type ShellToolOutput = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
};

export type ToolEventSink = (type: RunEventType, payload: RunEventPayload) => void;

export async function executeShellTool(input: {
  repoRoot: string;
  input: ToolInputMap["shell"];
  permissionLevel: ToolPermissionLevel;
  onEvent?: ToolEventSink;
}): Promise<ToolResultEnvelope<ShellToolOutput>> {
  const permission = evaluateShellPermission(input.input.command, input.permissionLevel);
  if (!permission.allowed) {
    return {
      toolName: "shell",
      status: permission.requiresPermission ? "permission_required" : "failed",
      error: permission.reason,
      metadata: { truncated: false },
    };
  }

  const startedAt = Date.now();
  const cwd = input.input.cwd ? resolveRepoPath(input.repoRoot, input.input.cwd).absolutePath : input.repoRoot;
  const maxOutputBytes = input.input.maxOutputBytes ?? 64_000;
  const timeoutMs = input.input.timeoutMs ?? 30_000;

  return await new Promise<ToolResultEnvelope<ShellToolOutput>>((resolve) => {
    const child = spawn(input.input.command, {
      cwd,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let bytesReturned = 0;
    let bytesSeen = 0;
    let timedOut = false;
    let settled = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const append = (stream: "stdout" | "stderr", chunk: Buffer) => {
      bytesSeen += chunk.byteLength;
      const remaining = Math.max(maxOutputBytes - bytesReturned, 0);
      const returned = remaining > 0 ? chunk.subarray(0, remaining) : Buffer.alloc(0);
      const text = returned.toString("utf8");
      bytesReturned += returned.byteLength;
      if (stream === "stdout") stdout += text;
      else stderr += text;
      if (text.length > 0) {
        input.onEvent?.("tool.delta", { toolName: "shell", stream, text });
      }
    };

    child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        toolName: "shell",
        status: "failed",
        error: error.message,
        metadata: {
          truncated: bytesSeen > bytesReturned,
          bytesReturned,
          omittedBytes: Math.max(bytesSeen - bytesReturned, 0),
          exitCode: null,
          durationMs: Date.now() - startedAt,
        },
      });
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const failed = timedOut || exitCode !== 0;
      resolve({
        toolName: "shell",
        status: failed ? "failed" : "succeeded",
        output: {
          command: input.input.command,
          stdout,
          stderr,
          exitCode,
        },
        error: timedOut
          ? `Shell command timed out after ${timeoutMs}ms.`
          : exitCode === 0
            ? undefined
            : `Shell command exited with code ${exitCode}.`,
        metadata: {
          truncated: bytesSeen > bytesReturned,
          bytesReturned,
          omittedBytes: Math.max(bytesSeen - bytesReturned, 0),
          exitCode,
          durationMs: Date.now() - startedAt,
        },
      });
    });
  });
}
