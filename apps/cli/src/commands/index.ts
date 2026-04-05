import { createRuntimeClient } from "../runtime-client.js";

export async function runIndexCommand(repoRoot: string): Promise<number> {
  const runtime = createRuntimeClient();
  const result = await runtime.runIndex(repoRoot);
  process.stdout.write(`${result.summary}\n`);
  process.stdout.write(`diagnostics: refreshed=${result.diagnostics.filesRefreshed} unchanged=${result.diagnostics.filesUnchanged}\n`);

  if (result.filesScanned === 0) {
    process.stdout.write(`next steps: make sure you are in the root of a source repository, then run dh index again\n`);
  } else {
    process.stdout.write(`next steps: try dh ask \"how does this project work?\"\n`);
  }

  return 0;
}
