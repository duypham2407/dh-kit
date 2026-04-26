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

const HELP = `dh <command> [args]\n\nCommands:\n  quick <task> [--json]       (TypeScript-hosted workflow compatibility path)\n  delivery <goal> [--json]    (TypeScript-hosted workflow compatibility path)\n  migrate <goal> [--json]     (TypeScript-hosted workflow compatibility path)\n  ask <question> [--json]     (Rust-hosted first-wave knowledge path)\n  explain <symbol> [--json]   (Rust-hosted first-wave knowledge path)\n  trace <target> [--json]     (Rust-hosted first-wave lifecycle path; trace result may be unsupported)\n  semantic-cleanup --mode <dry-run|apply> [--since <iso>] [--until <iso>] [--batch-size <n>] [--examples <n>] [--json]\n  operator-safe-maintenance <list|inspect|prune|cleanup> [options]\n  index\n  doctor [--json] [--debug-dump [path]]\n  clean --yes\n  config --agent\n  config --verify-agent [quick|delivery|migration]\n  config --semantic [always|auto|off]\n  config --embedding\n  config --show\n  --version\n\nLifecycle boundary:\n  Rust-host lifecycle authority currently covers first-wave knowledge commands only: ask, explain, trace.\n  Bounded broad ask can use Rust-authored query.buildEvidence only for finite static repository subjects.\n  Narrow ask/explain keep search, definition, or relationship methods when those are the truthful surface.\n  Legacy retrieval packets and TypeScript-hosted bridge paths are compatibility surfaces, not canonical authority for touched Rust-hosted build-evidence flows.\n  Supported target platforms are Linux and macOS only.\n  No universal repository reasoning, runtime tracing support, daemon mode, worker pool, remote/local socket control plane, Windows platform support, or full workflow-lane parity is claimed.\n\nFirst-time setup:\n  1. dh doctor\n  2. dh index\n  3. dh ask "how does auth work?"\n\nExamples:\n  dh ask "where is session state persisted?"\n  dh ask "how does auth work?"  # bounded Rust query.buildEvidence when a finite static subject is available\n  dh explain "runIndexWorkflow"   # definition-oriented query path\n  dh trace "authentication flow"   # Rust-hosted lifecycle envelope; result may be unsupported\n  dh semantic-cleanup --mode dry-run --json\n  dh operator-safe-maintenance list --family all\n  dh operator-safe-maintenance prune --mode dry-run\n  dh quick "fix semantic search ordering bug"\n  dh clean --yes`;

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
      "works: doctor and indexing commands are available",
      "limited: ask/explain are limited before indexing; bounded broad ask needs Rust query.buildEvidence packet truth; trace currently remains unsupported in bounded mode",
      "next: run dh doctor, then dh index",
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
      "surface: CLI home/onboarding",
      "condition: ready",
      "why: repository index already exists",
      "works: ask/explain commands can use indexed data, including bounded Rust query.buildEvidence for finite broad-understanding asks",
      "limited: no universal reasoning or runtime tracing is claimed; trace currently remains unsupported in bounded mode; provider-backed quality still depends on doctor/config state",
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
