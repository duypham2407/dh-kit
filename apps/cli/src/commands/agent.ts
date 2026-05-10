import { AgentConfigService } from "../../../../packages/opencode-app/src/agent/agent-config-service.js";
import type {
  AgentCreateInput,
  AgentCreateReport,
  AgentListReport,
  AgentMode,
  AgentPermissionPolicy,
} from "../../../../packages/shared/src/types/agent.js";

type AgentDeps = {
  listAgents: (repoRoot: string) => AgentListReport;
  createAgent: (repoRoot: string, input: AgentCreateInput) => AgentCreateReport;
};

const defaultDeps: AgentDeps = {
  listAgents: (repoRoot) => new AgentConfigService(repoRoot).listAgents(),
  createAgent: (repoRoot, input) => new AgentConfigService(repoRoot).createAgent(input),
};

export async function runAgentCommand(args: string[], repoRoot: string, deps: AgentDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "create") return runCreate(rest, repoRoot, deps);
    throw new Error(`Unknown agent command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function runList(args: string[], repoRoot: string, deps: AgentDeps): number {
  const report = deps.listAgents(repoRoot);
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `${renderAgents(report)}\n`);
  return 0;
}

function runCreate(args: string[], repoRoot: string, deps: AgentDeps): number {
  const id = readFlag(args, "--id");
  const mode = readFlag(args, "--mode");
  const prompt = readFlag(args, "--prompt");
  const permission = readFlag(args, "--permission");
  if (!id) throw new Error("dh agent create requires --id <id>.");
  if (!mode) throw new Error("dh agent create requires --mode <primary|subagent>.");
  if (!isAgentMode(mode)) throw new Error("--mode must be primary or subagent.");
  if (!prompt) throw new Error("dh agent create requires --prompt <text>.");
  let parsedPermission: AgentPermissionPolicy | undefined;
  if (permission) {
    if (!isAgentPermission(permission)) {
      throw new Error("--permission must be read_only, standard, builder, or restricted.");
    }
    parsedPermission = permission;
  }

  const report = deps.createAgent(repoRoot, {
    id,
    mode,
    prompt,
    model: readFlag(args, "--model"),
    permission: parsedPermission,
  });
  process.stdout.write(args.includes("--json") ? `${JSON.stringify(report, null, 2)}\n` : `created agent: ${report.agent.agentId}\n`);
  return 0;
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}

function isAgentMode(value: string): value is AgentMode {
  return value === "primary" || value === "subagent";
}

function isAgentPermission(value: string): value is AgentPermissionPolicy {
  return value === "read_only" || value === "standard" || value === "builder" || value === "restricted";
}

function renderAgents(report: AgentListReport): string {
  if (report.agents.length === 0) return "no agents";
  return report.agents
    .map((agent) => `${agent.agentId}  ${agent.mode}  role=${agent.role}  permission=${agent.permission}  source=${agent.source}`)
    .join("\n");
}
