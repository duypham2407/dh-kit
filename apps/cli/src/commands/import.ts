import fs from "node:fs";
import { importSessionDocument, parseSessionExportJson } from "../../../../packages/runtime/src/session/session-import.js";

type ImportDeps = {
  parseSessionExportJson: typeof parseSessionExportJson;
  importSessionDocument: typeof importSessionDocument;
};

const defaultDeps: ImportDeps = { parseSessionExportJson, importSessionDocument };

export async function runImportCommand(args: string[], repoRoot: string, deps: ImportDeps = defaultDeps): Promise<number> {
  try {
    const file = args[0];
    if (!file) throw new Error("dh import requires <file>.");
    const document = deps.parseSessionExportJson(fs.readFileSync(file, "utf8"));
    const report = deps.importSessionDocument(repoRoot, document);
    process.stdout.write([
      `imported session: ${report.sessionId}`,
      `runtime events: ${report.imported.runtimeEvents}`,
      `summaries: ${report.imported.summaries}`,
      `checkpoints: ${report.imported.checkpoints}`,
      `reverts: ${report.imported.reverts}`,
    ].join("\n") + "\n");
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}
