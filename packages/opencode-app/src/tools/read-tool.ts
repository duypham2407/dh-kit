import fs from "node:fs";
import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import { resolveRepoPath } from "./tool-paths.js";

export type ReadToolOutput = {
  path: string;
  content: string;
  startLine: number;
  endLine: number;
};

export function executeReadTool(input: {
  repoRoot: string;
  input: ToolInputMap["read"];
}): ToolResultEnvelope<ReadToolOutput> {
  try {
    const resolved = resolveRepoPath(input.repoRoot, input.input.path);
    const buffer = fs.readFileSync(resolved.absolutePath);
    const bytesRead = buffer.byteLength;
    const maxBytes = input.input.maxBytes;
    const content = maxBytes && bytesRead > maxBytes
      ? buffer.subarray(0, maxBytes).toString("utf8")
      : buffer.toString("utf8");
    const lineResult = sliceLines(content, input.input.offset ?? 0, input.input.limit);
    const bytesReturned = Buffer.byteLength(lineResult.content);
    const byteTruncated = maxBytes !== undefined && bytesRead > maxBytes;

    return {
      toolName: "read",
      status: "succeeded",
      output: {
        path: resolved.relativePath,
        content: lineResult.content,
        startLine: lineResult.startLine,
        endLine: lineResult.endLine,
      },
      metadata: {
        truncated: byteTruncated || lineResult.truncated,
        bytesRead,
        bytesReturned,
        omittedBytes: Math.max(bytesRead - bytesReturned, 0),
      },
    };
  } catch (error) {
    return {
      toolName: "read",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: { truncated: false },
    };
  }
}

function sliceLines(content: string, offset: number, limit: number | undefined): {
  content: string;
  startLine: number;
  endLine: number;
  truncated: boolean;
} {
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  const selected = lines.slice(offset, limit ? offset + limit : undefined);
  return {
    content: selected.join("\n"),
    startLine: selected.length > 0 ? offset + 1 : offset,
    endLine: selected.length > 0 ? offset + selected.length : offset,
    truncated: offset > 0 || (limit !== undefined && offset + limit < lines.length),
  };
}
