import type { SessionStatsReport } from "../../../../packages/shared/src/types/session.js";
import { buildSessionStats } from "../../../../packages/runtime/src/session/session-stats.js";

type StatsDeps = { buildSessionStats: typeof buildSessionStats };

const defaultDeps: StatsDeps = { buildSessionStats };

export async function runStatsCommand(args: string[], repoRoot: string, deps: StatsDeps = defaultDeps): Promise<number> {
  try {
    const json = args.includes("--json");
    const report = deps.buildSessionStats(repoRoot, {
      days: readOptionalPositiveIntFlag(args, "--days"),
      models: readOptionalPositiveIntFlag(args, "--models"),
      tools: readOptionalPositiveIntFlag(args, "--tools"),
    });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderStats(report)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function readOptionalPositiveIntFlag(args: string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer.`);
  return value;
}

function renderStats(report: SessionStatsReport): string {
  return [
    `sessions: ${report.totalSessions}`,
    `lanes: ${renderBuckets(report.sessionsByLane)}`,
    `statuses: ${renderBuckets(report.sessionsByStatus)}`,
    `models: ${renderBuckets(report.topModels)}`,
    `tools: ${renderBuckets(report.topTools)}`,
    `tokens: ${report.tokenUsage === "unavailable" ? "unavailable" : report.tokenUsage.totalTokens}`,
    `cost usd: ${report.costUsd}`,
  ].join("\n");
}

function renderBuckets(buckets: Array<{ key: string; count: number }>): string {
  return buckets.map((bucket) => `${bucket.key}=${bucket.count}`).join(", ") || "none";
}
