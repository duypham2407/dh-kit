import type { ContextInspectReport } from "../../../../packages/shared/src/types/context.js";
import { inspectContext } from "../../../../packages/runtime/src/context/context-planner.js";

type ContextDeps = {
  inspectContext: typeof inspectContext;
};

const defaultDeps: ContextDeps = { inspectContext };

export async function runContextCommand(args: string[], repoRoot: string, deps: ContextDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "inspect") return await runInspect(rest, repoRoot, deps);
    throw new Error(`Unknown context command: ${subcommand ?? ""}`.trim());
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

async function runInspect(args: string[], repoRoot: string, deps: ContextDeps): Promise<number> {
  const json = args.includes("--json");
  const query = args.filter((arg) => !arg.startsWith("--")).join(" ").trim();
  if (!query) throw new Error("dh context inspect requires <query>.");
  const report = await deps.inspectContext({ repoRoot, query });
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderContextReport(report)}\n`);
  return 0;
}

function renderContextReport(report: ContextInspectReport): string {
  const lines = [
    `query: ${report.query}`,
    `evidence: ${report.coverage.included}`,
    `skipped: ${report.coverage.skipped}`,
  ];
  for (const entry of report.ledger.entries.slice(0, 8)) {
    lines.push(`${entry.filePath}:${entry.lineRange[0]}-${entry.lineRange[1]} ${entry.source} ${entry.score.toFixed(2)} ${entry.reason}`);
  }
  for (const warning of report.coverage.warnings) {
    lines.push(`warning: ${warning.message}`);
  }
  return lines.join("\n");
}
