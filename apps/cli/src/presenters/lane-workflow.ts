import type { LaneWorkflowReport } from "../../../../packages/opencode-app/src/workflows/run-lane-command.js";

export function renderLaneWorkflowText(report: LaneWorkflowReport): string {
  if (report.exitCode !== 0) {
    return [...report.workflowSummary].join("\n");
  }

  return [
    `lane: ${report.lane}`,
    `session: ${report.sessionId}`,
    `stage: ${report.stage}`,
    `agent: ${report.agent}`,
    `model: ${report.model}`,
    `objective: ${report.objective}`,
    ...report.workflowSummary,
  ].join("\n");
}

export function renderLaneWorkflowJson(report: LaneWorkflowReport): string {
  return JSON.stringify(report, null, 2);
}
