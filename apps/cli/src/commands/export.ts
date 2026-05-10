import { buildSessionExport } from "../../../../packages/runtime/src/session/session-export.js";
import { DH_VERSION } from "../version.js";

type ExportDeps = { buildSessionExport: typeof buildSessionExport };

const defaultDeps: ExportDeps = { buildSessionExport };

export async function runExportCommand(args: string[], repoRoot: string, deps: ExportDeps = defaultDeps): Promise<number> {
  try {
    const sanitize = args.includes("--sanitize");
    const sessionId = args.find((arg) => !arg.startsWith("--"));
    const document = deps.buildSessionExport(repoRoot, { sessionId, sanitize, version: DH_VERSION });
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}
