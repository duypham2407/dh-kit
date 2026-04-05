import type { KnowledgeCommandReport } from "../../../../packages/opencode-app/src/workflows/run-knowledge-command.js";

export function renderKnowledgeCommandText(report: KnowledgeCommandReport): string {
  if (report.exitCode !== 0) {
    const lines = [report.message ?? "Knowledge command failed."];
    if (report.guidance && report.guidance.length > 0) {
      lines.push("", "next steps:", ...report.guidance.map((item) => `  - ${item}`));
    }
    return lines.join("\n");
  }

  const lines = [
    `command: ${report.command}`,
    `repo: ${report.repo}`,
    `intent: ${report.intent}`,
    `tools: ${report.tools.join(", ")}`,
    `seed terms: ${report.seedTerms.join(", ")}`,
    `workspace count: ${report.workspaceCount}`,
    `result count: ${report.resultCount}`,
    `evidence count: ${report.evidenceCount}`,
    ...report.evidencePreview,
  ];

  if (report.guidance && report.guidance.length > 0) {
    lines.push("", "next steps:", ...report.guidance.map((item) => `  - ${item}`));
  }

  return lines.join("\n");
}

export function renderKnowledgeCommandJson(report: KnowledgeCommandReport): string {
  return JSON.stringify(report, null, 2);
}
