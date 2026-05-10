import fs from "node:fs";
import path from "node:path";
import type {
  ContextCoverageWarning,
  ContextInspectInput,
  ContextInspectReport,
  ContextLedgerEntry,
} from "../../../shared/src/types/context.js";
import type { NormalizedRetrievalResult } from "../../../shared/src/types/evidence.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { runRetrieval } from "../../../retrieval/src/query/run-retrieval.js";
import { computeWorkspaceFingerprint } from "../performance/workspace-freshness.js";

export async function inspectContext(input: ContextInspectInput & { repoRoot: string }): Promise<ContextInspectReport> {
  const totalStart = Date.now();
  const query = input.query.trim();
  if (!query) throw new Error("context query is required.");
  const fingerprintStart = Date.now();
  const workspaceFingerprint = computeWorkspaceFingerprint(input.repoRoot).fingerprint;
  const fingerprintMs = Date.now() - fingerprintStart;
  const budgetMode = input.budgetMode ?? "normal";
  const cached = readRankingCache(input.repoRoot, workspaceFingerprint, query, budgetMode);
  if (cached) {
    return {
      ...cached,
      generatedAt: nowIso(),
      cache: { status: "hit", workspaceFingerprint },
      metrics: {
        latencyMs: {
          fingerprint: fingerprintMs,
          retrieval: 0,
          planning: 0,
          total: Date.now() - totalStart,
        },
      },
    };
  }

  const retrievalStart = Date.now();
  const retrieval = await runRetrieval({
    repoRoot: input.repoRoot,
    query,
    mode: input.mode ?? "ask",
    semanticMode: input.semanticMode ?? "auto",
    scanOptions: input.scanOptions,
  });
  const retrievalMs = Date.now() - retrievalStart;
  const planningStart = Date.now();
  const entries = dedupeEntries([
    ...retrieval.results.map(toLedgerEntry),
    ...fileMentionEntries(input.repoRoot, query),
  ], maxEvidenceForBudget(budgetMode));
  const warnings = coverageWarnings(retrieval, entries);
  writeSymbolGraphCache(input.repoRoot, workspaceFingerprint, {
    generatedAt: nowIso(),
    symbolCount: retrieval.symbols.length,
    edgeCount: retrieval.edges.length,
    symbols: retrieval.symbols,
    edges: retrieval.edges,
  });
  const report = {
    query,
    ledger: {
      id: createId("context-ledger"),
      entries,
    },
    coverage: {
      included: entries.length,
      skipped: Math.max(0, retrieval.results.length - entries.length),
      warnings,
    },
    cache: {
      status: "miss" as const,
      workspaceFingerprint,
    },
    metrics: {
      latencyMs: {
        fingerprint: fingerprintMs,
        retrieval: retrievalMs,
        planning: Date.now() - planningStart,
        total: Date.now() - totalStart,
      },
    },
    generatedAt: nowIso(),
  };
  writeContextLedger(input.repoRoot, report);
  writeRankingCache(input.repoRoot, workspaceFingerprint, query, budgetMode, report);
  return report;
}

function toLedgerEntry(result: NormalizedRetrievalResult): ContextLedgerEntry {
  return {
    id: createId("evidence"),
    filePath: result.filePath,
    lineRange: result.lineRange,
    reason: result.matchReason,
    score: result.normalizedScore,
    source: normalizeSource(result.sourceTool),
    symbolName: result.symbolName,
  };
}

function fileMentionEntries(repoRoot: string, query: string): ContextLedgerEntry[] {
  const mentions = query.match(/[A-Za-z0-9_.\-\/]+\.[A-Za-z0-9]+/g) ?? [];
  return mentions.flatMap((mention) => {
    const normalized = mention.replace(/^\.?\//, "");
    const absolute = path.resolve(repoRoot, normalized);
    if (!absolute.startsWith(path.resolve(repoRoot)) || !fs.existsSync(absolute)) return [];
    return [{
      id: createId("evidence"),
      filePath: normalized,
      lineRange: [1, 80] as [number, number],
      reason: "Explicit file mention in user query.",
      score: 1,
      source: "file_mention",
    }];
  });
}

function dedupeEntries(entries: ContextLedgerEntry[], maxEvidence: number): ContextLedgerEntry[] {
  const seen = new Set<string>();
  return entries
    .sort((left, right) => right.score - left.score)
    .filter((entry) => {
      const key = `${entry.filePath}:${entry.lineRange[0]}:${entry.lineRange[1]}:${entry.source}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxEvidence);
}

function coverageWarnings(
  retrieval: Awaited<ReturnType<typeof runRetrieval>>,
  entries: ContextLedgerEntry[],
): ContextCoverageWarning[] {
  const warnings: ContextCoverageWarning[] = [];

  if (retrieval.scanMeta.reducedCoverage) {
    warnings.push({
      code: "reduced_scan_coverage",
      message: "Workspace scan was truncated; context may be incomplete.",
      details: { stopReasons: retrieval.scanMeta.stopReasons },
    });
  }
  for (const reason of retrieval.scanMeta.stopReasons) {
    warnings.push({
      code: "scan_stopped",
      message: `Workspace scan stopped early: ${reason}.`,
      details: { reason },
    });
  }
  if (!retrieval.dependencyGraph.available) {
    warnings.push({
      code: "dependency_graph_unavailable",
      message: `Dependency graph unavailable: ${retrieval.dependencyGraph.reason}.`,
      details: { source: retrieval.dependencyGraph.source },
    });
  }
  warnings.push({
    code: "lsp_unconfigured",
    message: "LSP diagnostics were not included because no live LSP client was configured for context planning.",
  });
  if (entries.length === 0) {
    warnings.push({
      code: "no_evidence",
      message: "No context evidence matched the query.",
    });
  }
  if (retrieval.results.length > entries.length) {
    warnings.push({
      code: "truncated_context",
      message: "Some retrieval results were skipped by the context ledger budget.",
      details: { skipped: retrieval.results.length - entries.length },
    });
  }

  return warnings;
}

function normalizeSource(sourceTool: string): ContextLedgerEntry["source"] {
  if (sourceTool === "symbol_search") return "symbol";
  if (sourceTool === "reference_search") return "reference";
  if (sourceTool === "graph_expand") return "graph";
  if (sourceTool === "lsp_diagnostics") return "lsp_diagnostics";
  if (sourceTool.includes("semantic")) return "semantic";
  if (sourceTool.includes("keyword")) return "keyword";
  return sourceTool;
}

function writeContextLedger(repoRoot: string, report: ContextInspectReport): void {
  const dir = path.join(repoRoot, ".dh", "context-ledgers");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${report.ledger.id}.json`), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

function maxEvidenceForBudget(mode: ContextInspectInput["budgetMode"]): number {
  if (mode === "fast") return 4;
  if (mode === "deep") return 24;
  return 12;
}

function cachePath(repoRoot: string, workspaceFingerprint: string, query: string, budgetMode: string): string {
  const key = Buffer.from(`${workspaceFingerprint}:${budgetMode}:${query}`).toString("base64url");
  return path.join(repoRoot, ".dh", "cache", "context-rankings", `${key}.json`);
}

function readRankingCache(
  repoRoot: string,
  workspaceFingerprint: string,
  query: string,
  budgetMode: string,
): ContextInspectReport | undefined {
  const file = cachePath(repoRoot, workspaceFingerprint, query, budgetMode);
  if (!fs.existsSync(file)) return undefined;
  return JSON.parse(fs.readFileSync(file, "utf8")) as ContextInspectReport;
}

function writeRankingCache(
  repoRoot: string,
  workspaceFingerprint: string,
  query: string,
  budgetMode: string,
  report: ContextInspectReport,
): void {
  const file = cachePath(repoRoot, workspaceFingerprint, query, budgetMode);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
}

function writeSymbolGraphCache(
  repoRoot: string,
  workspaceFingerprint: string,
  payload: Record<string, unknown>,
): void {
  const file = path.join(repoRoot, ".dh", "cache", "symbol-graph", `${workspaceFingerprint}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
}
