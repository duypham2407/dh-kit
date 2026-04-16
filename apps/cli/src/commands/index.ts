import { createRuntimeClient } from "../runtime-client.js";

export async function runIndexCommand(repoRoot: string): Promise<number> {
  const runtime = createRuntimeClient();
  const result = await runtime.runIndex(repoRoot);
  process.stdout.write(`${result.summary}\n`);
  process.stdout.write(`diagnostics: refreshed=${result.diagnostics.filesRefreshed} unchanged=${result.diagnostics.filesUnchanged}\n`);

  process.stdout.write("surface: repository indexing and retrieval readiness (dh index)\n");
  if (result.filesScanned === 0) {
    process.stdout.write("condition: blocked\n");
    process.stdout.write("why: no source files were scanned\n");
    process.stdout.write("works: index command and diagnostics remain available\n");
    process.stdout.write("limited: semantic/structural retrieval is not ready yet\n");
    process.stdout.write("next: make sure you are in the root of a source repository, then run dh index again\n");
  } else {
    process.stdout.write("condition: ready\n");
    process.stdout.write(`why: scanned ${result.filesScanned} files\n`);
    process.stdout.write("works: ask/explain/trace can use refreshed index data\n");
    process.stdout.write("limited: provider-backed quality may still depend on doctor/config state\n");
    process.stdout.write("next: try dh ask \"how does this project work?\"\n");
  }

  return 0;
}
