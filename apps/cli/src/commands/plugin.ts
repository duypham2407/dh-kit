import { PluginConfigService } from "../../../../packages/opencode-app/src/plugin/plugin-config.js";
import type { PluginConfigEntry, PluginListReport } from "../../../../packages/opencode-app/src/plugin/plugin-api.js";

type PluginDeps = {
  listPlugins: (repoRoot: string) => PluginListReport;
  addPlugin: (repoRoot: string, input: { id: string; path: string }) => PluginConfigEntry;
};

const defaultDeps: PluginDeps = {
  listPlugins: (repoRoot) => new PluginConfigService(repoRoot).listPlugins(),
  addPlugin: (repoRoot, input) => new PluginConfigService(repoRoot).addPlugin(input),
};

export async function runPluginCommand(args: string[], repoRoot: string, deps: PluginDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "add") return runAdd(rest, repoRoot, deps);
    throw new Error(`Unknown plugin command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function runList(args: string[], repoRoot: string, deps: PluginDeps): number {
  const report = deps.listPlugins(repoRoot);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderPlugins(report)}\n`);
  return 0;
}

function runAdd(args: string[], repoRoot: string, deps: PluginDeps): number {
  const id = readFlag(args, "--id");
  const pluginPath = readFlag(args, "--path");
  if (!id) throw new Error("dh plugin add requires --id <id>.");
  if (!pluginPath) throw new Error("dh plugin add requires --path <path>.");
  const entry = deps.addPlugin(repoRoot, { id, path: pluginPath });
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(entry, null, 2)}\n` : `added plugin: ${entry.id}\n`);
  return 0;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function renderPlugins(report: PluginListReport): string {
  if (report.plugins.length === 0) return "no plugins";
  return report.plugins.map((plugin) => `${plugin.id}  enabled=${plugin.enabled}  path=${plugin.path}`).join("\n");
}
