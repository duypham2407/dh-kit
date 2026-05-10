import { McpConfigService } from "../../../../packages/opencode-app/src/mcp/mcp-config-service.js";
import { buildMcpDebugReport } from "../../../../packages/opencode-app/src/mcp/mcp-debug.js";
import type {
  McpAddServerInput,
  McpAuthListReport,
  McpDebugReport,
  McpListReport,
  McpLogoutReport,
  McpServerPublicRecord,
} from "../../../../packages/shared/src/types/mcp.js";

type McpDeps = {
  addServer: (repoRoot: string, input: McpAddServerInput) => McpServerPublicRecord;
  listServers: (repoRoot: string) => McpListReport;
  listAuth: (repoRoot: string) => McpAuthListReport;
  logout: (repoRoot: string, name: string) => McpLogoutReport;
  debug: (repoRoot: string, name: string) => McpDebugReport;
};

const defaultDeps: McpDeps = {
  addServer: (repoRoot, input) => new McpConfigService(repoRoot).addServer(input),
  listServers: (repoRoot) => new McpConfigService(repoRoot).listReport(),
  listAuth: (repoRoot) => new McpConfigService(repoRoot).authReport(),
  logout: (repoRoot, name) => new McpConfigService(repoRoot).logout(name),
  debug: buildMcpDebugReport,
};

export async function runMcpCommand(args: string[], repoRoot: string, deps: McpDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "add") return runAdd(rest, repoRoot, deps);
    if (subcommand === "auth") return runAuth(rest, repoRoot, deps);
    if (subcommand === "logout") return runLogout(rest, repoRoot, deps);
    if (subcommand === "debug") return runDebug(rest, repoRoot, deps);
    throw new Error(`Unknown mcp command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function runList(args: string[], repoRoot: string, deps: McpDeps): number {
  const report = deps.listServers(repoRoot);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderList(report)}\n`);
  return 0;
}

function runAdd(args: string[], repoRoot: string, deps: McpDeps): number {
  const name = readFlag(args, "--name");
  const command = readFlag(args, "--command");
  if (!name) throw new Error("dh mcp add requires --name <name>.");
  if (!command) throw new Error("dh mcp add requires --command <cmd>.");

  const report = deps.addServer(repoRoot, {
    name,
    command,
    args: readRepeatedFlag(args, "--arg"),
    env: readEnvFlags(args),
  });
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `added MCP server: ${report.name}\n`);
  return 0;
}

function runAuth(args: string[], repoRoot: string, deps: McpDeps): number {
  const [authSubcommand, ...rest] = args;
  if (authSubcommand !== "list") throw new Error("dh mcp auth supports only: list.");
  const report = deps.listAuth(repoRoot);
  process.stdout.write(rest.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderAuth(report)}\n`);
  return 0;
}

function runLogout(args: string[], repoRoot: string, deps: McpDeps): number {
  const name = positionalArgs(args)[0];
  if (!name) throw new Error("dh mcp logout requires <name>.");
  const report = deps.logout(repoRoot, name);
  if (!report.removed) throw new Error(`No local MCP auth state found for '${name}'.`);
  process.stdout.write(`removed MCP auth state: ${name}\n`);
  return 0;
}

function runDebug(args: string[], repoRoot: string, deps: McpDeps): number {
  const name = positionalArgs(args)[0];
  if (!name) throw new Error("dh mcp debug requires <name>.");
  const report = deps.debug(repoRoot, name);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderDebug(report)}\n`);
  return 0;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function readRepeatedFlag(args: string[], flag: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== flag) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
    values.push(value);
    index += 1;
  }
  return values;
}

function readEnvFlags(args: string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const item of readRepeatedFlag(args, "--env")) {
    const eq = item.indexOf("=");
    if (eq <= 0) throw new Error("--env requires KEY=VALUE.");
    env[item.slice(0, eq)] = item.slice(eq + 1);
  }
  return env;
}

function positionalArgs(args: string[]): string[] {
  const valueFlags = new Set(["--name", "--command", "--arg", "--env"]);
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (valueFlags.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) values.push(arg);
  }
  return values;
}

function renderList(report: McpListReport): string {
  if (report.servers.length === 0) return "no MCP servers";
  return report.servers
    .map((server) => `${server.name}  ${server.source}  auth=${server.authStatus}  enabled=${server.enabled}`)
    .join("\n");
}

function renderAuth(report: McpAuthListReport): string {
  if (report.auth.length === 0) return "no MCP auth state";
  return report.auth.map((record) => `${record.name}  ${record.status}`).join("\n");
}

function renderDebug(report: McpDebugReport): string {
  const lines = [
    `mcp: ${report.name}`,
    `source: ${report.source}`,
    `auth: ${report.authStatus}`,
    `runtime: ${report.runtime.state}`,
  ];
  if (report.launch) {
    lines.push(`command: ${report.launch.command}`);
    if (report.launch.args.length) lines.push(`args: ${report.launch.args.join(" ")}`);
    const envKeys = Object.keys(report.launch.env);
    if (envKeys.length) lines.push(`env: ${envKeys.join(",")}`);
  }
  return lines.join("\n");
}
