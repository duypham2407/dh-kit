import { runAskCommand } from "./ask.js";
import { runCleanCommand } from "./clean.js";
import { runConfigCommand } from "./config.js";
import { runDeliveryCommand } from "./delivery.js";
import { runDoctorCommand } from "./doctor.js";
import { runExplainCommand } from "./explain.js";
import { runIndexCommand } from "./index.js";
import { runMigrateCommand } from "./migrate.js";
import { runQuickCommand } from "./quick.js";
import { runTraceCommand } from "./trace.js";
import { DH_VERSION } from "../version.js";

const HELP = `dh <command> [args]\n\nCommands:\n  quick <task> [--json]\n  delivery <goal> [--json]\n  migrate <goal> [--json]\n  ask <question> [--json]\n  explain <symbol> [--json]\n  trace <target> [--json]\n  index\n  doctor [--json] [--debug-dump [path]]\n  clean --yes\n  config --agent\n  config --verify-agent [quick|delivery|migration]\n  config --semantic [always|auto|off]\n  config --embedding\n  config --show\n  --version\n\nFirst-time setup:\n  1. dh doctor\n  2. dh index\n  3. dh ask "how does auth work?"\n\nExamples:\n  dh ask "where is session state persisted?"\n  dh explain "runIndexWorkflow"\n  dh trace "authentication flow"\n  dh quick "fix semantic search ordering bug"\n  dh clean --yes`;

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
      process.stdout.write(`${HELP}\n`);
      return 0;
    default:
      process.stderr.write(`Unknown command: ${command}\n\n${HELP}\n`);
      return 1;
  }
}
