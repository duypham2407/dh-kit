import { startDhServer, type DhServerOptions, type StartedDhServer } from "../../../../packages/server/src/server.js";

type ServeDeps = {
  startServer: (input: DhServerOptions) => Promise<Pick<StartedDhServer, "url">>;
};

const defaultDeps: ServeDeps = {
  startServer: startDhServer,
};

export async function runServeCommand(args: string[], repoRoot: string, deps: ServeDeps = defaultDeps): Promise<number> {
  try {
    const host = readFlag(args, "--host") ?? "127.0.0.1";
    const portRaw = readFlag(args, "--port");
    const port = portRaw ? Number(portRaw) : 0;
    if (!Number.isInteger(port) || port < 0) throw new Error("--port must be a non-negative integer.");
    const started = await deps.startServer({
      repoRoot,
      host,
      port,
      password: readFlag(args, "--password"),
    });
    process.stdout.write(args.includes("--json") ? `${JSON.stringify({ url: started.url }, null, 2)}\n` : `server: ${started.url}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function readFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value.`);
  return value;
}
