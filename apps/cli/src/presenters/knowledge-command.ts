import type { KnowledgeCommandReport } from "../../../../packages/opencode-app/src/workflows/run-knowledge-command.js";

export function renderKnowledgeCommandText(report: KnowledgeCommandReport): string {
  if (report.exitCode !== 0) {
    const lines = [report.message ?? "Knowledge command failed."];
    if (report.bridgeEvidence?.failure) {
      lines.push(
        `bridge failure code: ${report.bridgeEvidence.failure.code}`,
        `bridge failure phase: ${report.bridgeEvidence.failure.phase}`,
        `bridge failure retryable: ${report.bridgeEvidence.failure.retryable}`,
      );
    }
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

  if (report.command === "ask") {
    lines.push("", "answer:");
    lines.push(`  ${report.answer ?? "(no answer provided)"}`);
    lines.push("evidence:");
    lines.push(`  answer type: ${report.answerType ?? "unknown"}`);
    lines.push(`  grounding: ${report.grounding ?? "unknown"}`);
    if (report.evidence && report.evidence.length > 0) {
      for (const item of report.evidence) {
        lines.push(
          `  - ${item.filePath} [${item.lineStart}-${item.lineEnd}] via=${item.sourceMethod} reason=${item.reason}`,
        );
      }
    } else {
      lines.push("  - (none)");
    }
    if (report.limitations && report.limitations.length > 0) {
      lines.push("limitations:");
      lines.push(...report.limitations.map((item) => `  - ${item}`));
    }
  }

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
  if (report.bridgeEvidence) {
    lines.push(`bridge enabled: ${report.bridgeEvidence.enabled}`);
    lines.push(`bridge startup succeeded: ${report.bridgeEvidence.startupSucceeded}`);
    lines.push(`bridge rust backed: ${report.bridgeEvidence.rustBacked}`);
    if (report.bridgeEvidence.method) {
      lines.push(`bridge method: ${report.bridgeEvidence.method}`);
    }
    if (typeof report.bridgeEvidence.requestId === "number") {
      lines.push(`bridge request id: ${report.bridgeEvidence.requestId}`);
    }
    if (report.bridgeEvidence.engine) {
      lines.push(`bridge engine: ${report.bridgeEvidence.engine.name}@${report.bridgeEvidence.engine.version}`);
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
