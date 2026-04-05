import { writeDebugDump } from "../../../../packages/runtime/src/diagnostics/debug-dump.js";
import { createRuntimeClient } from "../runtime-client.js";

export async function runDoctorCommand(repoRoot: string, args: string[] = []): Promise<number> {
  const wantsJson = args.includes("--json");
  const debugDumpIndex = args.indexOf("--debug-dump");
  let debugDumpPath: string | undefined;

  if (debugDumpIndex !== -1) {
    const nextArg = args[debugDumpIndex + 1];
    const outputPath = nextArg && !nextArg.startsWith("--") ? nextArg : `${repoRoot}/.dh/debug-dump.json`;
    debugDumpPath = await writeDebugDump(repoRoot, outputPath);

    if (!wantsJson) {
      process.stdout.write(`debug dump written: ${debugDumpPath}\n`);
      return 0;
    }
  }

  const runtime = createRuntimeClient();
  const report = await runtime.runDoctor(repoRoot);

  if (wantsJson) {
    process.stdout.write(`${JSON.stringify({ ...report, debugDumpPath }, null, 2)}\n`);
    return report.ok ? 0 : 1;
  }

  process.stdout.write(`${report.summary}\n`);
  return report.ok ? 0 : 1;
}
