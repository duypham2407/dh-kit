import fs from "node:fs";
import path from "node:path";
import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import { resolveRepoPath } from "./tool-paths.js";

export type WriteToolOutput = {
  path: string;
  bytesWritten: number;
};

export function executeWriteTool(input: {
  repoRoot: string;
  input: ToolInputMap["write"];
}): ToolResultEnvelope<WriteToolOutput> {
  try {
    const resolved = resolveRepoPath(input.repoRoot, input.input.path);
    if (input.input.createDirs) {
      fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
    }
    fs.writeFileSync(resolved.absolutePath, input.input.content, "utf8");
    const bytesWritten = Buffer.byteLength(input.input.content);
    return {
      toolName: "write",
      status: "succeeded",
      output: { path: resolved.relativePath, bytesWritten },
      metadata: {
        truncated: false,
        bytesReturned: bytesWritten,
      },
    };
  } catch (error) {
    return {
      toolName: "write",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: { truncated: false },
    };
  }
}
