import { runDoctor } from "../../../packages/runtime/src/diagnostics/doctor.js";
import { runIndexWorkflow } from "../../../packages/runtime/src/jobs/index-job-runner.js";
import { runRustHostedDirectCommand } from "../../../packages/opencode-app/src/workflows/run-rust-hosted-direct-command.js";
import { runRustHostedLaneWorkflow } from "../../../packages/opencode-app/src/workflows/run-rust-hosted-lane-command.js";
import {
  cleanupOperatorSafeArtifacts,
  inspectOperatorSafeArtifact,
  listOperatorSafeArtifacts,
  pruneOperatorSafeArtifacts,
} from "../../../packages/runtime/src/workspace/operator-safe-maintenance-utils.js";
import { runKnowledgeCommand } from "../../../packages/opencode-app/src/workflows/run-knowledge-command.js";
import { runLaneWorkflow } from "../../../packages/opencode-app/src/workflows/run-lane-command.js";
import type { RunDirectInput, RunDirectReport } from "../../../packages/shared/src/types/run.js";
import type { WorkflowLane } from "../../../packages/shared/src/types/lane.js";
import type {
  OperatorSafeArtifactFamily,
  OperatorSafeArtifactFamilySelector,
  OperatorSafeCleanupRequest,
  OperatorSafePruneRequest,
} from "../../../packages/shared/src/types/operator-worktree.js";

export type RuntimeClient = {
  runDirect: (input: RunDirectInput) => Promise<RunDirectReport>;
  runLane: (input: { lane: WorkflowLane; objective: string; repoRoot: string; resumeSessionId?: string }) => ReturnType<typeof runLaneWorkflow>;
  runKnowledge: (input: { kind: "ask" | "explain" | "trace"; input: string; repoRoot: string; resumeSessionId?: string }) => ReturnType<typeof runKnowledgeCommand>;
  runDoctor: (repoRoot: string) => ReturnType<typeof runDoctor>;
  runIndex: (repoRoot: string) => ReturnType<typeof runIndexWorkflow>;
  listOperatorSafeMaintenance: (input: {
    repoRoot: string;
    family?: OperatorSafeArtifactFamilySelector;
    limit?: number;
  }) => ReturnType<typeof listOperatorSafeArtifacts>;
  inspectOperatorSafeMaintenance: (input: {
    repoRoot: string;
    family: OperatorSafeArtifactFamily;
    artifactId: string;
  }) => ReturnType<typeof inspectOperatorSafeArtifact>;
  pruneOperatorSafeMaintenance: (input: {
    repoRoot: string;
    request: OperatorSafePruneRequest;
  }) => ReturnType<typeof pruneOperatorSafeArtifacts>;
  cleanupOperatorSafeMaintenance: (input: {
    repoRoot: string;
    request: OperatorSafeCleanupRequest;
  }) => ReturnType<typeof cleanupOperatorSafeArtifacts>;
};

export function createRuntimeClient(): RuntimeClient {
  return {
    runDirect: runRustHostedDirectCommand,
    runLane: (input) => {
      if (process.env.DH_ENABLE_TS_LANE_COMPAT === "1") {
        return runLaneWorkflow(input);
      }
      return runRustHostedLaneWorkflow(input);
    },
    runKnowledge: runKnowledgeCommand,
    runDoctor,
    runIndex: runIndexWorkflow,
    listOperatorSafeMaintenance: listOperatorSafeArtifacts,
    inspectOperatorSafeMaintenance: inspectOperatorSafeArtifact,
    pruneOperatorSafeMaintenance: pruneOperatorSafeArtifacts,
    cleanupOperatorSafeMaintenance: cleanupOperatorSafeArtifacts,
  };
}
