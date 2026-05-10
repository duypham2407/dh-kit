import fs from "node:fs";
import path from "node:path";
import type { ToolInputMap, ToolResultEnvelope } from "./schemas.js";
import { normalizeRelativePath, resolveRepoPath } from "./tool-paths.js";

export type GlobToolOutput = {
  matches: string[];
};

export type GrepMatch = {
  path: string;
  line: number;
  text: string;
};

export type GrepToolOutput = {
  matches: GrepMatch[];
};

const SKIPPED_DIRS = new Set([".git", ".dh", "node_modules", "dist", "build", ".next"]);

export function executeGlobTool(input: {
  repoRoot: string;
  input: ToolInputMap["glob"];
}): ToolResultEnvelope<GlobToolOutput> {
  try {
    const cwd = input.input.cwd ? resolveRepoPath(input.repoRoot, input.input.cwd) : undefined;
    const base = cwd?.absolutePath ?? input.repoRoot;
    const pattern = normalizeRelativePath(input.input.pattern);
    const matcher = globMatcher(pattern);
    const limit = input.input.limit ?? 100;
    const matches: string[] = [];
    let truncated = false;

    for (const file of walkFiles(base, input.repoRoot)) {
      const relativeToBase = normalizeRelativePath(path.relative(base, file.absolutePath));
      if (matcher(relativeToBase) || matcher(file.relativePath)) {
        if (matches.length < limit) {
          matches.push(file.relativePath);
        } else {
          truncated = true;
          break;
        }
      }
    }

    return {
      toolName: "glob",
      status: "succeeded",
      output: { matches },
      metadata: { truncated },
    };
  } catch (error) {
    return failed("glob", error);
  }
}

export function executeGrepTool(input: {
  repoRoot: string;
  input: ToolInputMap["grep"];
}): ToolResultEnvelope<GrepToolOutput> {
  try {
    const cwd = input.input.cwd ? resolveRepoPath(input.repoRoot, input.input.cwd) : undefined;
    const base = cwd?.absolutePath ?? input.repoRoot;
    const include = globMatcher(normalizeRelativePath(input.input.include ?? "**/*"));
    const regex = compilePattern(input.input.pattern, input.input.caseSensitive ?? false);
    const limit = input.input.limit ?? 100;
    const matches: GrepMatch[] = [];
    let truncated = false;

    search:
    for (const file of walkFiles(base, input.repoRoot)) {
      const relativeToBase = normalizeRelativePath(path.relative(base, file.absolutePath));
      if (!include(relativeToBase) && !include(file.relativePath)) continue;
      const buffer = fs.readFileSync(file.absolutePath);
      if (buffer.includes(0)) continue;
      const lines = buffer.toString("utf8").split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const text = lines[index]!;
        regex.lastIndex = 0;
        if (regex.test(text)) {
          if (matches.length < limit) {
            matches.push({ path: file.relativePath, line: index + 1, text });
          } else {
            truncated = true;
            break search;
          }
        }
      }
    }

    return {
      toolName: "grep",
      status: "succeeded",
      output: { matches },
      metadata: { truncated },
    };
  } catch (error) {
    return failed("grep", error);
  }
}

function* walkFiles(base: string, repoRoot: string): Generator<{ absolutePath: string; relativePath: string }> {
  const entries = fs.readdirSync(base, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIPPED_DIRS.has(entry.name)) continue;
    const absolutePath = path.join(base, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath, repoRoot);
    } else if (entry.isFile()) {
      yield {
        absolutePath,
        relativePath: normalizeRelativePath(path.relative(repoRoot, absolutePath)),
      };
    }
  }
}

function globMatcher(pattern: string): (value: string) => boolean {
  let source = "";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;
    const next = pattern[index + 1];
    const afterNext = pattern[index + 2];
    if (char === "*" && next === "*" && afterNext === "/") {
      source += "(?:.*/)?";
      index += 2;
    } else if (char === "*" && next === "*") {
      source += ".*";
      index += 1;
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegex(char);
    }
  }
  const regex = new RegExp(`^${source}$`);
  return (value) => regex.test(value);
}

function escapeRegex(value: string): string {
  return value.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function compilePattern(pattern: string, caseSensitive: boolean): RegExp {
  try {
    return new RegExp(pattern, caseSensitive ? "g" : "gi");
  } catch {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, caseSensitive ? "g" : "gi");
  }
}

function failed<TToolName extends "glob" | "grep">(toolName: TToolName, error: unknown): ToolResultEnvelope {
  return {
    toolName,
    status: "failed",
    error: error instanceof Error ? error.message : String(error),
    metadata: { truncated: false },
  };
}
