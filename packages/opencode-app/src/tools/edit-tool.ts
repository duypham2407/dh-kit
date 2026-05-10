import fs from "node:fs";
import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import { resolveRepoPath } from "./tool-paths.js";

export type EditToolOutput = {
  path: string;
  replacements: number;
};

export function executeEditTool(input: {
  repoRoot: string;
  input: ToolInputMap["edit"];
}): ToolResultEnvelope<EditToolOutput> {
  try {
    const resolved = resolveRepoPath(input.repoRoot, input.input.path);
    const original = fs.readFileSync(resolved.absolutePath, "utf8");
    if (!original.includes(input.input.oldText)) {
      return {
        toolName: "edit",
        status: "failed",
        error: `Text to replace was not found in ${resolved.relativePath}.`,
        metadata: { truncated: false },
      };
    }

    const replacements = input.input.replaceAll
      ? original.split(input.input.oldText).length - 1
      : 1;
    const updated = input.input.replaceAll
      ? original.split(input.input.oldText).join(input.input.newText)
      : original.replace(input.input.oldText, input.input.newText);
    fs.writeFileSync(resolved.absolutePath, updated, "utf8");

    return {
      toolName: "edit",
      status: "succeeded",
      output: { path: resolved.relativePath, replacements },
      metadata: {
        truncated: false,
        bytesRead: Buffer.byteLength(original),
        bytesReturned: Buffer.byteLength(updated),
      },
    };
  } catch (error) {
    return {
      toolName: "edit",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: { truncated: false },
    };
  }
}
