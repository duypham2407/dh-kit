import { renderKnowledgeCommandJson, renderKnowledgeCommandText } from "../presenters/knowledge-command.js";
import { createRuntimeClient } from "../runtime-client.js";

export async function runExplainCommand(args: string[], repoRoot: string): Promise<number> {
  const wantsJson = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");
  const runtime = createRuntimeClient();
  const report = await runtime.runKnowledge({ kind: "explain", input: filteredArgs.join(" ").trim(), repoRoot });
  const output = wantsJson ? renderKnowledgeCommandJson(report) : renderKnowledgeCommandText(report);
  if (report.exitCode === 0) {
    process.stdout.write(`${output}\n`);
  } else {
    process.stderr.write(`${output}\n`);
  }
  return report.exitCode;
}
