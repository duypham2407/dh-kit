import { renderLaneWorkflowJson, renderLaneWorkflowText } from "../presenters/lane-workflow.js";
import { createRuntimeClient } from "../runtime-client.js";

export async function runQuickCommand(args: string[], repoRoot: string): Promise<number> {
  const wantsJson = args.includes("--json");
  const filteredArgs = args.filter((arg) => arg !== "--json");
  const runtime = createRuntimeClient();
  const report = await runtime.runLane({ lane: "quick", objective: filteredArgs.join(" ").trim(), repoRoot });
  const output = wantsJson ? renderLaneWorkflowJson(report) : renderLaneWorkflowText(report);
  if (report.exitCode === 0) {
    process.stdout.write(`${output}\n`);
  } else {
    process.stderr.write(`${output}\n`);
  }
  return report.exitCode;
}
