import type { KnowledgeCommandReport } from "../../../../packages/opencode-app/src/workflows/run-knowledge-command.js";

export function renderKnowledgeCommandText(report: KnowledgeCommandReport): string {
  if (report.exitCode !== 0) {
    return report.message ?? "Knowledge command failed.";
  }

  return [
    `command: ${report.command}`,
    `repo: ${report.repo}`,
    `intent: ${report.intent}`,
    `tools: ${report.tools.join(", ")}`,
    `seed terms: ${report.seedTerms.join(", ")}`,
    `workspace count: ${report.workspaceCount}`,
    `result count: ${report.resultCount}`,
    `evidence count: ${report.evidenceCount}`,
    ...report.evidencePreview,
  ].join("\n");
}

export function renderKnowledgeCommandJson(report: KnowledgeCommandReport): string {
  return JSON.stringify(report, null, 2);
}
