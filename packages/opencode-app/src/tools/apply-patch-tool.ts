import fs from "node:fs";
import path from "node:path";
import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import { combineDiffSummaries, summarizeTextDiff } from "./diff-summary.js";
import { resolveRepoPath } from "./tool-paths.js";

type PatchOperation =
  | { type: "add"; filePath: string; lines: string[] }
  | { type: "delete"; filePath: string }
  | { type: "update"; filePath: string; hunks: PatchHunk[] };

type PatchHunk = {
  oldLines: string[];
  newLines: string[];
};

export type ApplyPatchToolOutput = {
  paths: string[];
  filesChanged: number;
  additions: number;
  deletions: number;
};

export function executeApplyPatchTool(input: {
  repoRoot: string;
  input: ToolInputMap["apply_patch"];
}): ToolResultEnvelope<ApplyPatchToolOutput> {
  try {
    const operations = parseApplyPatch(input.input.patch);
    const summaries = operations.map((operation) => applyOperation(input.repoRoot, operation));
    const diffSummary = combineDiffSummaries(summaries);

    return {
      toolName: "apply_patch",
      status: "succeeded",
      output: {
        paths: diffSummary.paths,
        filesChanged: diffSummary.filesChanged,
        additions: diffSummary.additions,
        deletions: diffSummary.deletions,
      },
      metadata: {
        truncated: false,
        diffSummary,
      },
    };
  } catch (error) {
    return {
      toolName: "apply_patch",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
      metadata: { truncated: false },
    };
  }
}

function parseApplyPatch(patch: string): PatchOperation[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  while (lines.at(-1) === "") lines.pop();
  if (lines[0] !== "*** Begin Patch" || lines.at(-1) !== "*** End Patch") {
    throw new Error("Patch must be wrapped in *** Begin Patch and *** End Patch markers.");
  }

  const operations: PatchOperation[] = [];
  let index = 1;
  while (index < lines.length - 1) {
    const line = lines[index]!;
    if (line.startsWith("*** Add File: ")) {
      const filePath = line.slice("*** Add File: ".length).trim();
      const contentLines: string[] = [];
      index += 1;
      while (index < lines.length - 1 && !lines[index]!.startsWith("*** ")) {
        const contentLine = lines[index]!;
        if (!contentLine.startsWith("+")) throw new Error(`Add file '${filePath}' lines must start with '+'.`);
        contentLines.push(contentLine.slice(1));
        index += 1;
      }
      operations.push({ type: "add", filePath, lines: contentLines });
      continue;
    }

    if (line.startsWith("*** Delete File: ")) {
      operations.push({ type: "delete", filePath: line.slice("*** Delete File: ".length).trim() });
      index += 1;
      continue;
    }

    if (line.startsWith("*** Update File: ")) {
      const filePath = line.slice("*** Update File: ".length).trim();
      const hunks: PatchHunk[] = [];
      let current: PatchHunk | undefined;
      index += 1;
      while (index < lines.length - 1 && !lines[index]!.startsWith("*** ")) {
        const hunkLine = lines[index]!;
        if (hunkLine.startsWith("@@")) {
          if (current) hunks.push(current);
          current = { oldLines: [], newLines: [] };
          index += 1;
          continue;
        }

        if (!current) current = { oldLines: [], newLines: [] };
        const marker = hunkLine[0];
        const value = hunkLine.slice(1);
        if (marker === " ") {
          current.oldLines.push(value);
          current.newLines.push(value);
        } else if (marker === "-") {
          current.oldLines.push(value);
        } else if (marker === "+") {
          current.newLines.push(value);
        } else {
          throw new Error(`Unsupported patch line in '${filePath}': ${hunkLine}`);
        }
        index += 1;
      }
      if (current) hunks.push(current);
      if (hunks.length === 0) throw new Error(`Update file '${filePath}' has no hunks.`);
      operations.push({ type: "update", filePath, hunks });
      continue;
    }

    throw new Error(`Unsupported patch directive: ${line}`);
  }

  if (operations.length === 0) throw new Error("Patch did not contain any file operations.");
  return operations;
}

function applyOperation(repoRoot: string, operation: PatchOperation) {
  if (operation.type === "add") {
    const resolved = resolveRepoPath(repoRoot, operation.filePath);
    if (fs.existsSync(resolved.absolutePath)) {
      throw new Error(`Cannot add '${resolved.relativePath}' because it already exists.`);
    }
    const after = formatPatchLines(operation.lines);
    fs.mkdirSync(path.dirname(resolved.absolutePath), { recursive: true });
    fs.writeFileSync(resolved.absolutePath, after, "utf8");
    return summarizeTextDiff(resolved.relativePath, "", after);
  }

  if (operation.type === "delete") {
    const resolved = resolveRepoPath(repoRoot, operation.filePath);
    const before = fs.readFileSync(resolved.absolutePath, "utf8");
    fs.unlinkSync(resolved.absolutePath);
    return summarizeTextDiff(resolved.relativePath, before, "");
  }

  const resolved = resolveRepoPath(repoRoot, operation.filePath);
  const before = fs.readFileSync(resolved.absolutePath, "utf8");
  const after = applyUpdateHunks(before, operation.hunks, resolved.relativePath);
  fs.writeFileSync(resolved.absolutePath, after, "utf8");
  return summarizeTextDiff(resolved.relativePath, before, after);
}

function applyUpdateHunks(content: string, hunks: PatchHunk[], filePath: string): string {
  const hadTrailingNewline = content.endsWith("\n");
  let lines = splitFileLines(content);
  let cursor = 0;

  for (const hunk of hunks) {
    const start = findLineSequence(lines, hunk.oldLines, cursor);
    if (start < 0) {
      throw new Error(`Patch hunk did not match ${filePath}.`);
    }
    lines = [
      ...lines.slice(0, start),
      ...hunk.newLines,
      ...lines.slice(start + hunk.oldLines.length),
    ];
    cursor = start + hunk.newLines.length;
  }

  return lines.length > 0 ? `${lines.join("\n")}${hadTrailingNewline ? "\n" : ""}` : "";
}

function findLineSequence(lines: string[], sequence: string[], startIndex: number): number {
  if (sequence.length === 0) return startIndex;
  for (let index = startIndex; index <= lines.length - sequence.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (lines[index + offset] !== sequence[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) return index;
  }
  return -1;
}

function splitFileLines(content: string): string[] {
  if (content.length === 0) return [];
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function formatPatchLines(lines: string[]): string {
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
