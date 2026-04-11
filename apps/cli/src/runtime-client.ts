import { runDoctor } from "../../../packages/runtime/src/diagnostics/doctor.js";
import { runIndexWorkflow } from "../../../packages/runtime/src/jobs/index-job-runner.js";
import { runKnowledgeCommand } from "../../../packages/opencode-app/src/workflows/run-knowledge-command.js";
import { runLaneWorkflow } from "../../../packages/opencode-app/src/workflows/run-lane-command.js";
import type { WorkflowLane } from "../../../packages/shared/src/types/lane.js";

export type RuntimeClient = {
  runLane: (input: { lane: WorkflowLane; objective: string; repoRoot: string; resumeSessionId?: string }) => ReturnType<typeof runLaneWorkflow>;
  runKnowledge: (input: { kind: "ask" | "explain" | "trace"; input: string; repoRoot: string; resumeSessionId?: string }) => ReturnType<typeof runKnowledgeCommand>;
  runDoctor: (repoRoot: string) => ReturnType<typeof runDoctor>;
  runIndex: (repoRoot: string) => ReturnType<typeof runIndexWorkflow>;
};

export function createRuntimeClient(): RuntimeClient {
  return {
    runLane: runLaneWorkflow,
    runKnowledge: runKnowledgeCommand,
    runDoctor,
    runIndex: runIndexWorkflow,
  };
}
