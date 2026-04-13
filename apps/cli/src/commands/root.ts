import { runAskCommand } from "./ask.js";
import { runCleanCommand } from "./clean.js";
import { runConfigCommand } from "./config.js";
import { runDeliveryCommand } from "./delivery.js";
import { runDoctorCommand } from "./doctor.js";
import { runExplainCommand } from "./explain.js";
import { runIndexCommand } from "./index.js";
import { runMigrateCommand } from "./migrate.js";
import { runQuickCommand } from "./quick.js";
import { runSemanticCleanupCommand } from "./semantic-cleanup.js";
import { runTraceCommand } from "./trace.js";
import { DH_VERSION } from "../version.js";
import { ChunksRepo } from "../../../../packages/storage/src/sqlite/repositories/chunks-repo.js";
import { ConfigRepo } from "../../../../packages/storage/src/sqlite/repositories/config-repo.js";

const HELP = `dh <command> [args]\n\nCommands:\n  quick <task> [--json]\n  delivery <goal> [--json]\n  migrate <goal> [--json]\n  ask <question> [--json]\n  explain <symbol> [--json]\n  trace <target> [--json]\n  semantic-cleanup --mode <dry-run|apply> [--since <iso>] [--until <iso>] [--batch-size <n>] [--examples <n>] [--json]\n  index\n  doctor [--json] [--debug-dump [path]]\n  clean --yes\n  config --agent\n  config --verify-agent [quick|delivery|migration]\n  config --semantic [always|auto|off]\n  config --embedding\n  config --show\n  --version\n\nFirst-time setup:\n  1. dh doctor\n  2. dh index\n  3. dh ask "how does auth work?"\n\nExamples:\n  dh ask "where is session state persisted?"\n  dh explain "runIndexWorkflow"\n  dh trace "authentication flow"\n  dh semantic-cleanup --mode dry-run --json\n  dh quick "fix semantic search ordering bug"\n  dh clean --yes`;

export async function runCli(args: string[], repoRoot: string): Promise<number> {
  const [command, ...rest] = args;

  switch (command) {
    case "quick":
      return runQuickCommand(rest, repoRoot);
    case "delivery":
      return runDeliveryCommand(rest, repoRoot);
    case "migrate":
      return runMigrateCommand(rest, repoRoot);
    case "ask":
      return runAskCommand(rest, repoRoot);
    case "explain":
      return runExplainCommand(rest, repoRoot);
    case "trace":
      return runTraceCommand(rest, repoRoot);
    case "semantic-cleanup":
      return runSemanticCleanupCommand(rest, repoRoot);
    case "index":
      return runIndexCommand(repoRoot);
    case "doctor":
      return runDoctorCommand(repoRoot, rest);
    case "clean":
      return runCleanCommand(rest, repoRoot);
    case "config":
      return runConfigCommand(rest, repoRoot);
    case "--version":
    case "-v":
      process.stdout.write(`${DH_VERSION}\n`);
      return 0;
    case "help":
    case "--help":
    case undefined:
      process.stdout.write(`${buildHomeScreen(repoRoot)}\n`);
      return 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}\n`);
      return 1;
  }
}

function buildHomeScreen(repoRoot: string): string {
  let chunkCount = 0;
  let semanticMode = "always";

  try {
    chunkCount = new ChunksRepo(repoRoot).count();
  } catch {
    chunkCount = 0;
  }

  try {
    semanticMode = new ConfigRepo(repoRoot).read<string>("semantic.mode") ?? "always";
  } catch {
    semanticMode = "always";
  }

  const lines = [HELP, "", `version: ${DH_VERSION}`, `repo: ${repoRoot}`, `semantic mode: ${semanticMode}`];

  if (chunkCount === 0) {
    lines.push(
      "",
      "first-run onboarding:",
      "  looks like this repo has not been indexed yet.",
      "  run these commands:",
      "    1. dh doctor",
      "    2. dh index",
      "    3. dh ask \"how does this project work?\"",
    );
  } else {
    lines.push(
      "",
      "ready to use:",
      "  try:",
      "    dh ask \"how does this project work?\"",
      "    dh explain \"runIndexWorkflow\"",
      "    dh trace \"authentication flow\"",
    );
  }

  return lines.join("\n");
}
