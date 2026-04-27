import { runAskCommand } from "./ask.js";
import { runCleanCommand } from "./clean.js";
import { runConfigCommand } from "./config.js";
import { runDeliveryCommand } from "./delivery.js";
import { runDoctorCommand } from "./doctor.js";
import { runExplainCommand } from "./explain.js";
import { runIndexCommand } from "./index.js";
import { runMigrateCommand } from "./migrate.js";
import { runOperatorSafeMaintenanceCommand } from "./operator-safe-maintenance.js";
import { runQuickCommand } from "./quick.js";
import { runSemanticCleanupCommand } from "./semantic-cleanup.js";
import { runTraceCommand } from "./trace.js";
import { DH_VERSION } from "../version.js";
import { ChunksRepo } from "../../../../packages/storage/src/sqlite/repositories/chunks-repo.js";
import { ConfigRepo } from "../../../../packages/storage/src/sqlite/repositories/config-repo.js";

const HELP = `dh <command> [args]

Commands:
  quick <task> [--json]       (TypeScript-hosted workflow compatibility path)
  delivery <goal> [--json]    (TypeScript-hosted workflow compatibility path)
  migrate <goal> [--json]     (TypeScript-hosted workflow compatibility path)
  ask <question> [--json]     (Rust-hosted first-wave knowledge path)
  explain <symbol> [--json]   (Rust-hosted first-wave knowledge path)
  trace <target> [--json]     (Rust-hosted first-wave lifecycle path; trace result may be unsupported)
  semantic-cleanup --mode <dry-run|apply> [--since <iso>] [--until <iso>] [--batch-size <n>] [--examples <n>] [--json]
  operator-safe-maintenance <list|inspect|prune|cleanup> [options]
  index
  doctor [--json] [--debug-dump [path]]
  clean --yes
  config --agent
  config --verify-agent [quick|delivery|migration]
  config --semantic [always|auto|off]
  config --embedding
  config --show
  --version

Lifecycle boundary:
  Rust-host lifecycle authority currently covers first-wave knowledge commands only: ask, explain, trace.
  Bounded broad ask can use Rust-authored query.buildEvidence only for finite static repository subjects.
  Narrow ask/explain keep search, definition, or relationship methods when those are the truthful surface.
  Legacy retrieval packets and TypeScript-hosted bridge paths are compatibility surfaces, not canonical authority for touched Rust-hosted build-evidence flows.
  Supported target platforms are Linux and macOS only.
  No universal repository reasoning, runtime tracing support, daemon mode, worker pool, remote/local socket control plane, Windows platform support, or full workflow-lane parity is claimed.

TypeScript CLI setup:
  1. dh --help
  2. dh index
  3. dh ask "how does auth work?"

Examples:
  dh ask "where is session state persisted?"
  dh ask "how does auth work?"  # bounded Rust query.buildEvidence when a finite static subject is available
  dh explain "runIndexWorkflow"
  dh trace "authentication flow"`;

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
    case "operator-safe-maintenance":
      return runOperatorSafeMaintenanceCommand(rest, repoRoot);
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
      "surface: CLI home/onboarding",
      "condition: degraded",
      "why: repository index has not been created yet",
      "works: indexing and knowledge commands are available",
      "limited: ask/explain are limited before indexing; bounded broad ask needs Rust query.buildEvidence packet truth; trace currently remains unsupported in bounded mode",
      "next: run dh index, then dh ask",
      "",
      "first-run onboarding:",
      "  looks like this repo has not been indexed yet.",
      "  run these TypeScript CLI commands:",
      "    1. dh --help",
      "    2. dh index",
      "    3. dh ask \"how does this project work?\"",
    );
  } else {
    lines.push(
      "",
      "surface: CLI home/onboarding",
      "condition: ready",
      "why: repository index already exists",
      "works: ask/explain commands can use indexed data, including bounded Rust query.buildEvidence for finite broad-understanding asks",
      "limited: no universal reasoning or runtime tracing is claimed; trace currently remains unsupported in bounded mode; provider-backed quality still depends on config and indexed evidence state",
      "next: run a knowledge command such as dh ask",
      "",
      "ready to use:",
      "  try:",
      "    dh ask \"how does this project work?\"",
      "    dh explain \"runIndexWorkflow\"",
      "    dh trace \"authentication flow\"   # returns unsupported in bounded mode",
    );
  }

  return lines.join("\n");
}
