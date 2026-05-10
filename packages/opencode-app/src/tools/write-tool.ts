import fs from "node:fs";
import path from "node:path";
import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import { summarizeTextDiff } from "./diff-summary.js";
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
    const before = fs.existsSync(resolved.absolutePath)
      ? fs.readFileSync(resolved.absolutePath, "utf8")
      : "";
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
        diffSummary: summarizeTextDiff(resolved.relativePath, before, input.input.content),
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
