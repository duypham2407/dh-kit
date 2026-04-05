import { createRuntimeClient } from "../runtime-client.js";

export async function runIndexCommand(repoRoot: string): Promise<number> {
  const runtime = createRuntimeClient();
  const result = await runtime.runIndex(repoRoot);
  process.stdout.write(`${result.summary}\n`);
  process.stdout.write(`diagnostics: refreshed=${result.diagnostics.filesRefreshed} unchanged=${result.diagnostics.filesUnchanged}\n`);
  return 0;
}
