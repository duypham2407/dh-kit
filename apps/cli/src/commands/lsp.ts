import { LspService } from "../../../../packages/opencode-app/src/lsp/lsp-service.js";
import type { LspDiagnosticsReport } from "../../../../packages/opencode-app/src/lsp/lsp-client.js";

type LspDeps = {
  diagnostics: (repoRoot: string, file: string) => Promise<LspDiagnosticsReport>;
};

const defaultDeps: LspDeps = {
  diagnostics: (repoRoot, file) => new LspService({ repoRoot, enablement: "manual" }).diagnostics(file),
};

export async function runLspCommand(args: string[], repoRoot: string, deps: LspDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "diagnostics") return await runDiagnostics(rest, repoRoot, deps);
    throw new Error(`Unknown lsp command: ${subcommand ?? ""}`.trim());
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

async function runDiagnostics(args: string[], repoRoot: string, deps: LspDeps): Promise<number> {
  const file = readFlag(args, "--file");
  if (!file) throw new Error("dh lsp diagnostics requires --file <path>.");
  const report = await deps.diagnostics(repoRoot, file);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderDiagnostics(report)}\n`);
  return report.available ? 0 : 1;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function renderDiagnostics(report: LspDiagnosticsReport): string {
  if (!report.available) return `lsp unavailable: ${report.reason ?? "unknown"}`;
  if (report.diagnostics.length === 0) return `lsp diagnostics: ${report.file}: clean`;
  return report.diagnostics
    .map((diagnostic) => `${diagnostic.path}:${diagnostic.range.startLine}:${diagnostic.range.startCharacter} ${diagnostic.severity} ${diagnostic.message}`)
    .join("\n");
}
