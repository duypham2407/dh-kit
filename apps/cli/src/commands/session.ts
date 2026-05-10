import { deleteSession } from "../../../../packages/runtime/src/session/session-delete.js";
import { forkSession } from "../../../../packages/runtime/src/session/session-fork.js";
import { listSessions, showSession } from "../../../../packages/runtime/src/session/session-query.js";

type SessionCommandDeps = {
  listSessions: typeof listSessions;
  showSession: typeof showSession;
  deleteSession: typeof deleteSession;
  forkSession: typeof forkSession;
};

const defaultDeps: SessionCommandDeps = { listSessions, showSession, deleteSession, forkSession };

export async function runSessionCommand(args: string[], repoRoot: string, deps: SessionCommandDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "show") return runShow(rest, repoRoot, deps);
    if (subcommand === "delete") return runDelete(rest, repoRoot, deps);
    if (subcommand === "fork") return runFork(rest, repoRoot, deps);
    throw new Error(`Unknown session command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function runList(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const json = args.includes("--json");
  const limit = readPositiveIntFlag(args, "--limit", 20);
  const report = deps.listSessions(repoRoot, { limit });
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderList(report.sessions)}\n`);
  return 0;
}

function runShow(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const json = args.includes("--json");
  const sessionId = readPositional(args);
  if (!sessionId) throw new Error("dh session show requires <id>.");
  const report = deps.showSession(repoRoot, sessionId);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderShow(report)}\n`);
  return 0;
}

function runDelete(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const sessionId = readPositional(args);
  if (!sessionId) throw new Error("dh session delete requires <id>.");
  if (!args.includes("--yes")) throw new Error(`Refusing to delete session '${sessionId}' without --yes.`);
  const report = deps.deleteSession(repoRoot, sessionId);
  process.stdout.write(`deleted session: ${report.sessionId}\n`);
  return 0;
}

function runFork(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const json = args.includes("--json");
  const sessionId = readPositional(args, new Set(["--title"]));
  if (!sessionId) throw new Error("dh session fork requires <id>.");
  const title = readStringFlag(args, "--title");
  const report = deps.forkSession(repoRoot, sessionId, { title });
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `forked session: ${report.sessionId}\n`);
  return 0;
}

function readPositiveIntFlag(args: string[], flag: string, fallback: number): number {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer.`);
  return value;
}

function readStringFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function readPositional(args: string[], flagsWithValues = new Set<string>()): string | undefined {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (flagsWithValues.has(arg)) {
      index += 1;
      continue;
    }
    if (!arg.startsWith("--")) return arg;
  }
  return undefined;
}

function renderList(sessions: Array<{ sessionId: string; lane: string; status: string; currentStage: string; updatedAt: string }>): string {
  if (sessions.length === 0) return "no sessions";
  return [
    "SESSION ID  LANE  STATUS  STAGE  UPDATED",
    ...sessions.map((session) => `${session.sessionId}  ${session.lane}  ${session.status}  ${session.currentStage}  ${session.updatedAt}`),
  ].join("\n");
}

function renderShow(report: ReturnType<typeof showSession>): string {
  return [
    `session: ${report.session.sessionId}`,
    `lane: ${report.session.lane}`,
    `status: ${report.session.status}`,
    `stage: ${report.session.currentStage}`,
    `runtime events: ${report.counts.runtimeEvents}`,
    `summaries: ${report.counts.summaries}`,
    `checkpoints: ${report.counts.checkpoints}`,
    `reverts: ${report.counts.reverts}`,
  ].join("\n");
}
