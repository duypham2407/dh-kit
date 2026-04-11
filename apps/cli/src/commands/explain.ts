import { renderKnowledgeCommandJson, renderKnowledgeCommandText } from "../presenters/knowledge-command.js";
import { createRuntimeClient } from "../runtime-client.js";
import { parseKnowledgeCommandArgs } from "./knowledge-command-args.js";

export async function runExplainCommand(args: string[], repoRoot: string): Promise<number> {
  const parsed = parseKnowledgeCommandArgs(args);
  if (parsed.error) {
    process.stderr.write(`${parsed.error}\n`);
    return 1;
  }

  const runtime = createRuntimeClient();
  const report = await runtime.runKnowledge({
    kind: "explain",
    input: parsed.queryInput,
    repoRoot,
    resumeSessionId: parsed.resumeSessionId,
  });
  const output = parsed.wantsJson ? renderKnowledgeCommandJson(report) : renderKnowledgeCommandText(report);
  if (report.exitCode === 0) {
    process.stdout.write(`${output}\n`);
  } else {
    process.stderr.write(`${output}\n`);
  }
  return report.exitCode;
}
