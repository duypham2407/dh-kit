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

  if (
    report.command === "ask"
    || report.command === "explain"
    || report.command === "trace"
  ) {
    lines.push("", "answer:");
    lines.push(`  ${report.answer ?? "(no answer provided)"}`);
    lines.push("state:");
    lines.push(`  answer state: ${report.answerState ?? "unknown"}`);
    lines.push(`  answer type: ${report.answerType ?? "unknown"}`);
    if (report.languageCapabilitySummary) {
      lines.push("capability:");
      lines.push(`  capability: ${report.languageCapabilitySummary.capability}`);
      lines.push(`  weakest state: ${report.languageCapabilitySummary.weakestState}`);
      lines.push(`  retrieval only: ${report.languageCapabilitySummary.retrievalOnly}`);
      if (report.languageCapabilitySummary.languages.length > 0) {
        lines.push("  languages:");
        for (const language of report.languageCapabilitySummary.languages) {
          lines.push(
            `    - ${language.language}: ${language.state} (parser-backed=${language.parserBacked}) — ${language.reason}`,
          );
        }
      }
    }
    lines.push("evidence:");
    if (report.evidence && report.evidence.length > 0) {
      for (const item of report.evidence) {
        const location =
          typeof item.lineStart === "number" && typeof item.lineEnd === "number"
            ? `[${item.lineStart}-${item.lineEnd}]`
            : "[line unknown]";
        const metadata = [
          item.kind ? `kind=${item.kind}` : null,
          item.source ? `source=${item.source}` : null,
          item.confidence ? `confidence=${item.confidence}` : null,
        ]
          .filter((value): value is string => Boolean(value))
          .join(" ");
        lines.push(
          `  - ${item.filePath} ${location} via=${item.sourceMethod} reason=${item.reason}${metadata ? ` ${metadata}` : ""}`,
        );
      }
    } else {
      lines.push("  - (none)");
    }
    if (report.rustEvidence) {
      lines.push("rust packet:");
      lines.push(`  answer state: ${report.rustEvidence.answerState}`);
      lines.push(`  question class: ${report.rustEvidence.questionClass}`);
      if (report.rustEvidence.questionClass === "build_evidence") {
        lines.push("  authority: canonical Rust-authored query.buildEvidence packet for bounded Rust-hosted broad ask");
        lines.push("  legacy packet boundary: legacy retrieval/TypeScript-hosted packets are non-canonical for this flow");
      }
      lines.push(`  subject: ${report.rustEvidence.subject}`);
      lines.push(`  summary: ${report.rustEvidence.summary}`);
      lines.push(`  conclusion: ${report.rustEvidence.conclusion}`);
      lines.push("  evidence:");
      if (report.rustEvidence.evidence.length > 0) {
        for (const item of report.rustEvidence.evidence) {
          const location = typeof item.lineStart === "number" && typeof item.lineEnd === "number"
            ? `[${item.lineStart}-${item.lineEnd}]`
            : "[line unknown]";
          const provenance = [
            `kind=${item.kind}`,
            `source=${item.source}`,
            `confidence=${item.confidence}`,
            item.symbol ? `symbol=${item.symbol}` : null,
          ].filter((value): value is string => Boolean(value)).join(" ");
          lines.push(`    - ${item.filePath} ${location} reason=${item.reason} ${provenance}`);
        }
      } else {
        lines.push("    - (none)");
      }
      lines.push("  gaps:");
      if (report.rustEvidence.gaps.length > 0) {
        lines.push(...report.rustEvidence.gaps.map((item) => `    - ${item}`));
      } else {
        lines.push("    - (none)");
      }
      lines.push("  bounds:");
      if (report.rustEvidence.bounds.traversalScope) {
        lines.push(`    traversal scope: ${report.rustEvidence.bounds.traversalScope}`);
      }
      if (typeof report.rustEvidence.bounds.hopCount === "number") {
        lines.push(`    hop count: ${report.rustEvidence.bounds.hopCount}`);
      }
      if (typeof report.rustEvidence.bounds.nodeLimit === "number") {
        lines.push(`    node limit: ${report.rustEvidence.bounds.nodeLimit}`);
      }
      if (report.rustEvidence.bounds.stopReason) {
        lines.push(`    stop reason: ${report.rustEvidence.bounds.stopReason}`);
      }
      if (
        !report.rustEvidence.bounds.traversalScope
        && typeof report.rustEvidence.bounds.hopCount !== "number"
        && typeof report.rustEvidence.bounds.nodeLimit !== "number"
        && !report.rustEvidence.bounds.stopReason
      ) {
        lines.push("    - (none)");
      }
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
    if (report.bridgeEvidence.seamMethod) {
      lines.push(`bridge seam method: ${report.bridgeEvidence.seamMethod}`);
    }
    if (report.bridgeEvidence.delegatedMethod) {
      lines.push(`bridge delegated method: ${report.bridgeEvidence.delegatedMethod}`);
    }
    if (typeof report.bridgeEvidence.requestId === "number") {
      lines.push(`bridge request id: ${report.bridgeEvidence.requestId}`);
    }
    if (report.bridgeEvidence.engine) {
      lines.push(`bridge engine: ${report.bridgeEvidence.engine.name}@${report.bridgeEvidence.engine.version}`);
    }
    if (report.bridgeEvidence.protocolVersion) {
      lines.push(`bridge protocol version: ${report.bridgeEvidence.protocolVersion}`);
    }
    if (report.bridgeEvidence.capabilities) {
      lines.push(`bridge capability protocol: ${report.bridgeEvidence.capabilities.protocolVersion}`);
      lines.push(`bridge capability methods: ${report.bridgeEvidence.capabilities.methods.join(", ")}`);
      lines.push(
        `bridge capability relationship relations: ${report.bridgeEvidence.capabilities.queryRelationship.supportedRelations.join(", ")}`,
      );
    }
  }
  if (report.executionBoundary) {
    lines.push("execution boundary:");
    lines.push(`  path: ${report.executionBoundary.path}`);
    lines.push(`  rust hosted: ${report.executionBoundary.rustHosted}`);
    lines.push(`  lifecycle authority: ${report.executionBoundary.lifecycleAuthority}`);
    lines.push(`  label: ${report.executionBoundary.label}`);
    lines.push(`  note: ${report.executionBoundary.note}`);
  }
  if (report.hostLifecycle) {
    lines.push("rust host lifecycle:");
    lines.push(`  topology: ${report.hostLifecycle.topology}`);
    lines.push(`  support boundary: ${report.hostLifecycle.supportBoundary}`);
    lines.push(`  authority owner: ${report.hostLifecycle.authorityOwner}`);
    lines.push(`  worker state: ${report.hostLifecycle.workerState}`);
    lines.push(`  health state: ${report.hostLifecycle.healthState}`);
    lines.push(`  failure phase: ${report.hostLifecycle.failurePhase}`);
    lines.push(`  timeout class: ${report.hostLifecycle.timeoutClass}`);
    lines.push(`  recovery outcome: ${report.hostLifecycle.recoveryOutcome}`);
    lines.push(`  cleanup outcome: ${report.hostLifecycle.cleanupOutcome}`);
    lines.push(`  final status: ${report.hostLifecycle.finalStatus}`);
    lines.push(`  final exit code: ${report.hostLifecycle.finalExitCode}`);
    if (report.hostLifecycle.legacyPathLabel) {
      lines.push(`  legacy path label: ${report.hostLifecycle.legacyPathLabel}`);
    }
    if (report.hostLifecycle.launchabilityIssue) {
      lines.push(`  launchability issue: ${report.hostLifecycle.launchabilityIssue}`);
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
