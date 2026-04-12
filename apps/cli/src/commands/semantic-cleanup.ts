import { runHistoricalChunkCleanup } from "../../../../packages/retrieval/src/semantic/historical-chunk-cleanup.js";

type SemanticCleanupArgs = {
  mode: "dry-run" | "apply";
  sinceIso?: string;
  untilIso?: string;
  batchSize: number;
  exampleLimit: number;
  json: boolean;
};

const HELP = [
  "Usage:",
  "  dh semantic-cleanup --mode dry-run [--since <iso>] [--until <iso>] [--batch-size <n>] [--examples <n>] [--json]",
  "  dh semantic-cleanup --mode apply   [--since <iso>] [--until <iso>] [--batch-size <n>] [--examples <n>] [--json]",
  "",
  "Notes:",
  "  - dry-run is mandatory safety precheck before apply.",
  "  - apply mutates all deterministic-convertible historical chunk rows.",
].join("\n");

export async function runSemanticCleanupCommand(args: string[], repoRoot: string): Promise<number> {
  const parsed = parseArgs(args);
  if ("error" in parsed) {
    process.stderr.write(`${parsed.error}\n\n${HELP}\n`);
    return 1;
  }

  const report = runHistoricalChunkCleanup(repoRoot, {
    mode: parsed.value.mode,
    observationWindow: {
      sinceIso: parsed.value.sinceIso,
      untilIso: parsed.value.untilIso,
    },
    batchSize: parsed.value.batchSize,
    exampleLimit: parsed.value.exampleLimit,
    operator: "dh semantic-cleanup",
  });

  if (parsed.value.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 0;
  }

  const lines = [
    `historical semantic chunk cleanup (${report.meta.mode})`,
    `operator: ${report.meta.operator}`,
    `scope: ${report.meta.scope}`,
    `runAt: ${report.meta.runAt}`,
    `observationWindow: since=${report.meta.observationWindow.sinceIso ?? "(none)"} until=${report.meta.observationWindow.untilIso ?? "(none)"}`,
    "",
    "storage (before -> after)",
    `  scanned: ${report.storageBefore.rowsScanned} -> ${report.storageAfter.rowsScanned}`,
    `  telemetry-flagged rows: ${report.storageBefore.telemetryFlaggedRows} -> ${report.storageAfter.telemetryFlaggedRows}`,
    `  canonical: ${report.storageBefore.canonicalRows} -> ${report.storageAfter.canonicalRows}`,
    `  deterministic-convertible: ${report.storageBefore.deterministicConvertibleRows} -> ${report.storageAfter.deterministicConvertibleRows}`,
    `  unresolved: ${report.storageBefore.unresolvedRows} -> ${report.storageAfter.unresolvedRows}`,
    "",
    "mutation",
    `  updatedRows: ${report.updatedRows}`,
    `  deterministicRowsEligibleForApply: ${report.deterministicRowsEligibleForApply}`,
    `  deterministicRowsUpdated: ${report.deterministicRowsUpdated}`,
    `  deterministicRowsNotUpdated: ${report.deterministicRowsNotUpdated}`,
    `  canonicalRowsUnchanged: ${report.canonicalRowsUnchanged}`,
    `  skippedRows (deterministic not updated): ${report.skippedRows}`,
    `  unresolvedRowsRetained: ${report.unresolvedRowsRetained}`,
    "",
    "integrity",
    `  orphanedEmbeddings: ${report.orphanedEmbeddingsBefore} -> ${report.orphanedEmbeddingsAfter}`,
    `  orphanedEmbeddingsDeleted: ${report.orphanedEmbeddingsDeleted}`,
    "",
    "telemetry unresolved (before -> after)",
    `  semantic: ${report.telemetryBefore.unresolvedPaths.semantic} -> ${report.telemetryAfter.unresolvedPaths.semantic}`,
    `  evidence: ${report.telemetryBefore.unresolvedPaths.evidence} -> ${report.telemetryAfter.unresolvedPaths.evidence}`,
    ...(report.meta.mode === "dry-run"
      ? ["  note: dry-run does not mutate storage; before/after telemetry in this run are expected to be unchanged unless external events are appended concurrently."]
      : []),
    "",
    "examples",
    `  canonical: ${report.examples.canonical.join(" | ") || "(none)"}`,
    `  deterministic-convertible: ${report.examples.deterministicConvertible.join(" | ") || "(none)"}`,
    `  unresolved: ${report.examples.unresolved.join(" | ") || "(none)"}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}

function parseArgs(args: string[]): { value: SemanticCleanupArgs } | { error: string } {
  let mode: "dry-run" | "apply" | undefined;
  let sinceIso: string | undefined;
  let untilIso: string | undefined;
  let batchSize = 200;
  let exampleLimit = 5;
  let json = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--mode") {
      const value = args[i + 1];
      if (!value) return { error: "Missing value for --mode." };
      if (value !== "dry-run" && value !== "apply") return { error: "--mode must be 'dry-run' or 'apply'." };
      mode = value;
      i += 1;
      continue;
    }
    if (arg === "--since") {
      const value = args[i + 1];
      if (!value) return { error: "Missing value for --since." };
      sinceIso = value;
      i += 1;
      continue;
    }
    if (arg === "--until") {
      const value = args[i + 1];
      if (!value) return { error: "Missing value for --until." };
      untilIso = value;
      i += 1;
      continue;
    }
    if (arg === "--batch-size") {
      const value = Number(args[i + 1]);
      if (!Number.isFinite(value) || value <= 0) return { error: "--batch-size must be a positive number." };
      batchSize = Math.floor(value);
      i += 1;
      continue;
    }
    if (arg === "--examples") {
      const value = Number(args[i + 1]);
      if (!Number.isFinite(value) || value <= 0) return { error: "--examples must be a positive number." };
      exampleLimit = Math.floor(value);
      i += 1;
      continue;
    }
    return { error: `Unknown argument: ${arg}` };
  }

  if (!mode) {
    return { error: "Missing required --mode argument." };
  }

  return {
    value: {
      mode,
      sinceIso,
      untilIso,
      batchSize,
      exampleLimit,
      json,
    },
  };
}
