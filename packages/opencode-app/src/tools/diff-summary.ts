import type { ToolResultMetadata } from "./schemas.js";

export type ToolDiffSummary = NonNullable<ToolResultMetadata["diffSummary"]>;

export function summarizeTextDiff(filePath: string, before: string, after: string): ToolDiffSummary {
  if (before === after) {
    return { filesChanged: 0, additions: 0, deletions: 0, paths: [] };
  }

  const beforeLines = splitComparableLines(before);
  const afterLines = splitComparableLines(after);
  let prefix = 0;
  while (
    prefix < beforeLines.length
    && prefix < afterLines.length
    && beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix
    && suffix < afterLines.length - prefix
    && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    filesChanged: 1,
    additions: afterLines.length - prefix - suffix,
    deletions: beforeLines.length - prefix - suffix,
    paths: [filePath],
  };
}

export function combineDiffSummaries(summaries: ToolDiffSummary[]): ToolDiffSummary {
  const paths = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const summary of summaries) {
    additions += summary.additions;
    deletions += summary.deletions;
    for (const filePath of summary.paths) paths.add(filePath);
  }

  return {
    filesChanged: paths.size,
    additions,
    deletions,
    paths: [...paths],
  };
}

function splitComparableLines(content: string): string[] {
  if (content.length === 0) return [];
  const lines = content.split(/\r?\n/);
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
