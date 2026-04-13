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

  if (report.sessionId) {
    lines.push(`session id: ${report.sessionId}`);
  }
  if (typeof report.resumed === "boolean") {
    lines.push(`session resumed: ${report.resumed}`);
  }
  if (report.compaction) {
    lines.push(`compaction attempted: ${report.compaction.attempted}`);
    lines.push(`compaction overflow: ${report.compaction.overflow}`);
    lines.push(`compaction applied: ${report.compaction.compacted}`);
    lines.push(
      `continuation summary persisted: ${report.compaction.continuationSummaryPersisted}`,
    );
  }
  if (report.persistence) {
    lines.push(`runtime persistence attempted: ${report.persistence.attempted}`);
    lines.push(`runtime persistence succeeded: ${report.persistence.persisted}`);
    if (report.persistence.warning) {
      lines.push(`runtime persistence warning: ${report.persistence.warning}`);
    }
  }

  if (report.guidance && report.guidance.length > 0) {
    lines.push("", "next steps:", ...report.guidance.map((item) => `  - ${item}`));
  }

  return lines.join("\n");
}

export function renderKnowledgeCommandJson(report: KnowledgeCommandReport): string {
  return JSON.stringify(report, null, 2);
}
