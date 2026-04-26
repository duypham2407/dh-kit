import { runDoctor } from "../../../packages/runtime/src/diagnostics/doctor.js";
import { runIndexWorkflow } from "../../../packages/runtime/src/jobs/index-job-runner.js";
import {
  cleanupOperatorSafeArtifacts,
  inspectOperatorSafeArtifact,
  listOperatorSafeArtifacts,
  pruneOperatorSafeArtifacts,
} from "../../../packages/runtime/src/workspace/operator-safe-maintenance-utils.js";
import { runKnowledgeCommand } from "../../../packages/opencode-app/src/workflows/run-knowledge-command.js";
import { runLaneWorkflow } from "../../../packages/opencode-app/src/workflows/run-lane-command.js";
import type { WorkflowLane } from "../../../packages/shared/src/types/lane.js";
import type {
  OperatorSafeArtifactFamily,
  OperatorSafeArtifactFamilySelector,
  OperatorSafeCleanupRequest,
  OperatorSafePruneRequest,
} from "../../../packages/shared/src/types/operator-worktree.js";

export type RuntimeClient = {
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
    runLane: runLaneWorkflow,
    runKnowledge: runKnowledgeCommand,
    runDoctor,
    runIndex: runIndexWorkflow,
    listOperatorSafeMaintenance: listOperatorSafeArtifacts,
    inspectOperatorSafeMaintenance: inspectOperatorSafeArtifact,
    pruneOperatorSafeMaintenance: pruneOperatorSafeArtifacts,
    cleanupOperatorSafeMaintenance: cleanupOperatorSafeArtifacts,
  };
}
