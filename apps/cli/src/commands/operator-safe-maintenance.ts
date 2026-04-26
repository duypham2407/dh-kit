import type {
  OperatorSafeArtifactFamily,
  OperatorSafeArtifactFamilySelector,
  OperatorSafeCleanupRequest,
  OperatorSafeArtifactInspectResult,
  OperatorSafeMaintenanceActionResult,
  OperatorSafeMaintenanceMode,
  OperatorSafePruneRequest,
  OperatorWorktreeMaintenanceInventory,
} from "../../../../packages/shared/src/types/operator-worktree.js";
import { createRuntimeClient } from "../runtime-client.js";

const HELP = [
  "dh operator-safe-maintenance <subcommand> [options]",
  "",
  "Subcommands:",
  "  list [--family <all|report|snapshot|temp>] [--limit <n>] [--json]",
  "  inspect --family <report|snapshot|temp> --id <artifact-id> [--json]",
  "  prune --mode <dry-run|apply> [--family <all|report|snapshot|temp>] [--json]",
  "  cleanup --mode <dry-run|apply> (--report <report-id> | --family <snapshot|temp> --id <artifact-id>) [--json]",
  "",
  "Boundaries:",
  "  - This command is bounded to .dh/runtime/operator-safe-worktree/{reports,snapshots,temp}",
  "  - No arbitrary path deletion and no workflow-state mutation are performed",
  "  - Use dry-run first to inspect retained/skipped reasoning before apply",
].join("\n");

type ParseResult =
  | { ok: true; json: boolean; payload: ParsedMaintenanceCommand }
  | { ok: false; error: string };

type ParsedMaintenanceCommand =
  | {
    kind: "list";
    family: OperatorSafeArtifactFamilySelector;
    limit?: number;
  }
  | {
    kind: "inspect";
    family: OperatorSafeArtifactFamily;
    artifactId: string;
  }
  | {
    kind: "prune";
    request: OperatorSafePruneRequest;
  }
  | {
    kind: "cleanup";
    request: OperatorSafeCleanupRequest;
  };

function resolveFamily(value: string | undefined): OperatorSafeArtifactFamilySelector | null {
  if (!value || value === "all") {
    return "all";
  }
  if (value === "report") {
    return "report";
  }
  if (value === "snapshot") {
    return "snapshot";
  }
  if (value === "temp" || value === "temp_workspace") {
    return "temp_workspace";
  }
  return null;
}

function resolveInspectFamily(value: string | undefined): OperatorSafeArtifactFamily | null {
  const resolved = resolveFamily(value);
  if (!resolved || resolved === "all") {
    return null;
  }
  return resolved;
}

function resolveMode(value: string | undefined): OperatorSafeMaintenanceMode | null {
  if (!value) {
    return null;
  }
  if (value === "dry-run" || value === "dry_run") {
    return "dry_run";
  }
  if (value === "apply") {
    return "apply";
  }
  return null;
}

function readFlagValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const next = args[index + 1];
  if (!next || next.startsWith("--")) {
    return undefined;
  }
  return next;
}

function parseListArgs(args: string[]): ParseResult {
  const json = args.includes("--json");
  const family = resolveFamily(readFlagValue(args, "--family"));
  if (!family) {
    return {
      ok: false,
      error: "Invalid --family value for list. Use one of: all, report, snapshot, temp.",
    };
  }

  const limitRaw = readFlagValue(args, "--limit");
  let limit: number | undefined;
  if (limitRaw) {
    const parsed = Number(limitRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return {
        ok: false,
        error: "Invalid --limit value. Expected positive integer.",
      };
    }
    limit = Math.floor(parsed);
  }

  return {
    ok: true,
    json,
    payload: {
      kind: "list",
      family,
      limit,
    },
  };
}

function parseInspectArgs(args: string[]): ParseResult {
  const json = args.includes("--json");
  const family = resolveInspectFamily(readFlagValue(args, "--family"));
  if (!family) {
    return {
      ok: false,
      error: "inspect requires --family <report|snapshot|temp>.",
    };
  }
  const artifactId = readFlagValue(args, "--id");
  if (!artifactId) {
    return {
      ok: false,
      error: "inspect requires --id <artifact-id>.",
    };
  }

  return {
    ok: true,
    json,
    payload: {
      kind: "inspect",
      family,
      artifactId,
    },
  };
}

function parsePruneArgs(args: string[]): ParseResult {
  const json = args.includes("--json");
  const mode = resolveMode(readFlagValue(args, "--mode"));
  if (!mode) {
    return {
      ok: false,
      error: "prune requires --mode <dry-run|apply>.",
    };
  }
  const family = resolveFamily(readFlagValue(args, "--family"));
  if (!family) {
    return {
      ok: false,
      error: "Invalid --family value for prune. Use one of: all, report, snapshot, temp.",
    };
  }

  return {
    ok: true,
    json,
    payload: {
      kind: "prune",
      request: {
        mode,
        family,
      },
    },
  };
}

function parseCleanupArgs(args: string[]): ParseResult {
  const json = args.includes("--json");
  const mode = resolveMode(readFlagValue(args, "--mode"));
  if (!mode) {
    return {
      ok: false,
      error: "cleanup requires --mode <dry-run|apply>.",
    };
  }

  const reportId = readFlagValue(args, "--report");
  if (reportId) {
    return {
      ok: true,
      json,
      payload: {
        kind: "cleanup",
        request: {
          mode,
          reportId,
        },
      },
    };
  }

  const family = resolveInspectFamily(readFlagValue(args, "--family"));
  const artifactId = readFlagValue(args, "--id");
  if (!family || (family !== "snapshot" && family !== "temp_workspace") || !artifactId) {
    return {
      ok: false,
      error: "cleanup requires either --report <report-id> or --family <snapshot|temp> --id <artifact-id>.",
    };
  }

  return {
    ok: true,
    json,
    payload: {
      kind: "cleanup",
      request: {
        mode,
        family,
        artifactId,
      },
    },
  };
}

function parseArgs(args: string[]): ParseResult {
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "help" || subcommand === "--help") {
    return {
      ok: false,
      error: HELP,
    };
  }

  if (subcommand === "list") {
    return parseListArgs(rest);
  }
  if (subcommand === "inspect") {
    return parseInspectArgs(rest);
  }
  if (subcommand === "prune") {
    return parsePruneArgs(rest);
  }
  if (subcommand === "cleanup") {
    return parseCleanupArgs(rest);
  }

  return {
    ok: false,
    error: `Unknown operator-safe-maintenance subcommand '${subcommand}'.\n\n${HELP}`,
  };
}

function formatInventoryText(inventory: OperatorWorktreeMaintenanceInventory): string {
  const lines = [
    "operator-safe maintenance inventory",
    `generatedAt: ${inventory.generatedAt}`,
    `family: ${inventory.selectedFamily}`,
    `total: ${inventory.totalCount}`,
    "",
    `reports: ${inventory.families.report.length}`,
  ];

  for (const item of inventory.families.report) {
    lines.push(`  - ${item.artifactId} outcome=${item.outcome ?? "unknown"} cleanup=${item.cleanupEligibility}${item.cleanupReason ? ` (${item.cleanupReason})` : ""}`);
  }

  lines.push(`snapshots: ${inventory.families.snapshot.length}`);
  for (const item of inventory.families.snapshot) {
    lines.push(`  - ${item.artifactId} cleanup=${item.cleanupEligibility}${item.cleanupReason ? ` (${item.cleanupReason})` : ""}`);
  }

  lines.push(`temp_workspaces: ${inventory.families.temp_workspace.length}`);
  for (const item of inventory.families.temp_workspace) {
    lines.push(`  - ${item.artifactId} cleanup=${item.cleanupEligibility}${item.cleanupReason ? ` (${item.cleanupReason})` : ""}`);
  }

  return lines.join("\n");
}

function formatActionText(result: OperatorSafeMaintenanceActionResult): string {
  const lines = [
    `operator-safe maintenance ${result.action}`,
    `mode: ${result.mode}`,
    `requestedFamily: ${result.requestedFamily}`,
    `evaluated: ${result.evaluated.length}`,
    `planned: ${result.planned.length}`,
    `removed: ${result.removed.length}`,
    `retained: ${result.retained.length}`,
    `skipped: ${result.skipped.length}`,
  ];

  if (result.removed.length > 0) {
    lines.push("", "removed:");
    for (const item of result.removed) {
      lines.push(`  - ${item.family}:${item.artifactId} (${item.reason})`);
    }
  }

  if (result.retained.length > 0) {
    lines.push("", "retained:");
    for (const item of result.retained) {
      lines.push(`  - ${item.family}:${item.artifactId} (${item.reason})`);
    }
  }

  if (result.skipped.length > 0) {
    lines.push("", "skipped:");
    for (const item of result.skipped) {
      lines.push(`  - ${item.family}:${item.artifactId} (${item.reason})`);
    }
  }

  return lines.join("\n");
}

function formatInspectText(result: OperatorSafeArtifactInspectResult): string {
  if (!result.found) {
    return `inspect: ${result.reason ?? "artifact_not_found"} (${result.family}:${result.artifactId})`;
  }

  const lines = [
    `operator-safe maintenance inspect`,
    `family: ${result.family}`,
    `id: ${result.artifactId}`,
    `cleanup: ${result.record?.cleanupEligibility ?? "unknown"}${result.record?.cleanupReason ? ` (${result.record.cleanupReason})` : ""}`,
    `path: ${result.record?.path ?? "(unknown)"}`,
  ];

  if (result.details?.family === "report") {
    lines.push(`operation: ${result.details.operation ?? "unknown"}`);
    lines.push(`mode: ${result.details.mode ?? "unknown"}`);
    lines.push(`outcome: ${result.details.outcome ?? "unknown"}`);
    lines.push(`failureClass: ${result.details.failureClass ?? "unknown"}`);
    lines.push(`recommendedAction: ${result.details.recommendedAction ?? "unknown"}`);
  } else if (result.details?.family === "snapshot") {
    lines.push(`operation: ${result.details.operation ?? "unknown"}`);
    lines.push(`mode: ${result.details.mode ?? "unknown"}`);
    lines.push(`linkedReportId: ${result.details.linkedReportId ?? "(none)"}`);
    lines.push(`orphaned: ${result.details.orphaned}`);
  } else if (result.details?.family === "temp_workspace") {
    lines.push(`operation: ${result.details.operation ?? "unknown"}`);
    lines.push(`mode: ${result.details.mode ?? "unknown"}`);
    lines.push(`linkedReportId: ${result.details.linkedReportId ?? "(none)"}`);
    lines.push(`orphaned: ${result.details.orphaned}`);
    lines.push(`nextEligibleCleanupAt: ${result.details.nextEligibleCleanupAt ?? "unknown"}`);
  }

  if (result.warnings.length > 0) {
    lines.push("warnings:");
    for (const warning of result.warnings) {
      lines.push(`  - ${warning.reason}: ${warning.message}`);
    }
  }

  return lines.join("\n");
}

export async function runOperatorSafeMaintenanceCommand(args: string[], repoRoot: string): Promise<number> {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const runtime = createRuntimeClient();

  if (parsed.payload.kind === "list") {
    const inventory = await runtime.listOperatorSafeMaintenance({
      repoRoot,
      family: parsed.payload.family,
      limit: parsed.payload.limit,
    });
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`${formatInventoryText(inventory)}\n`);
    return 0;
  }

  if (parsed.payload.kind === "inspect") {
    const inspection = await runtime.inspectOperatorSafeMaintenance({
      repoRoot,
      family: parsed.payload.family,
      artifactId: parsed.payload.artifactId,
    });
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(inspection, null, 2)}\n`);
      return inspection.found ? 0 : 1;
    }
    if (!inspection.found) {
      process.stderr.write(`${formatInspectText(inspection)}\n`);
      return 1;
    }
    process.stdout.write(`${formatInspectText(inspection)}\n`);
    return 0;
  }

  if (parsed.payload.kind === "prune") {
    const result = await runtime.pruneOperatorSafeMaintenance({
      repoRoot,
      request: parsed.payload.request,
    });
    if (parsed.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      return 0;
    }
    process.stdout.write(`${formatActionText(result)}\n`);
    return 0;
  }

  const result = await runtime.cleanupOperatorSafeMaintenance({
    repoRoot,
    request: parsed.payload.request,
  });
  if (parsed.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.skipped.some((item) => item.reason === "artifact_not_found") ? 1 : 0;
  }
  process.stdout.write(`${formatActionText(result)}\n`);
  return result.skipped.some((item) => item.reason === "artifact_not_found") ? 1 : 0;
}
