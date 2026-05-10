import { DhClient, type DhClientOptions } from "../../../../packages/sdk/src/client.js";
import { startDhServer, type DhServerOptions, type StartedDhServer } from "../../../../packages/server/src/server.js";
import { runTui, type TuiRuntimeOptions } from "../../../tui/src/main.js";
import type { TuiAppClient } from "../../../tui/src/app.js";

type StartedServerForTui = Pick<StartedDhServer, "url"> & Partial<Pick<StartedDhServer, "server">>;

type TuiDeps = {
  startServer: (input: DhServerOptions) => Promise<StartedServerForTui>;
  createClient: (options: DhClientOptions) => TuiAppClient;
  runTui: (options: TuiRuntimeOptions) => Promise<void>;
};

const defaultDeps: TuiDeps = {
  startServer: startDhServer,
  createClient: (options) => new DhClient(options),
  runTui,
};

type ParsedTuiArgs = {
  serverUrl?: string;
  password?: string;
};

export async function runTuiCommand(args: string[], repoRoot: string, deps: TuiDeps = defaultDeps): Promise<number> {
  const parsed = parseTuiArgs(args);
  if (!parsed.ok) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  let started: StartedServerForTui | undefined;

  try {
    let serverUrl = parsed.value.serverUrl;
    if (!serverUrl) {
      started = await startLocalServer(repoRoot, parsed.value.password, deps);
      serverUrl = started.url;
    }
    const client = deps.createClient({ baseUrl: serverUrl, password: parsed.value.password });
    await deps.runTui({ serverUrl, client });
    return 0;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  } finally {
    await closeStartedServer(started);
  }
}

function parseTuiArgs(args: string[]): { ok: true; value: ParsedTuiArgs } | { ok: false; error: string } {
  let serverUrl: string | undefined;
  let password: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--server") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { ok: false, error: "--server requires a value." };
      serverUrl = value;
      index += 1;
    } else if (arg === "--password") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) return { ok: false, error: "--password requires a value." };
      password = value;
      index += 1;
    } else {
      return { ok: false, error: `Unknown dh tui option: ${arg}` };
    }
  }

  return { ok: true, value: { serverUrl, password } };
}

async function startLocalServer(repoRoot: string, password: string | undefined, deps: TuiDeps): Promise<StartedServerForTui> {
  return await deps.startServer({
    repoRoot,
    host: "127.0.0.1",
    port: 0,
    password,
  });
}

async function closeStartedServer(started: StartedServerForTui | undefined): Promise<void> {
  if (!started?.server) return;
  await new Promise<void>((resolve, reject) => {
    started.server?.close((error?: Error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
