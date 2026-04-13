import fs from "node:fs/promises";
import path from "node:path";
import type {
  OperatorWorktreePreflightResult,
  OperatorWorktreeSnapshotManifest,
  OperatorWorktreeSnapshotResult,
} from "../../../shared/src/types/operator-worktree.js";
import {
  ensureOperatorSafeArtifactDirs,
  resolveOperatorSafeSnapshotsDir,
} from "./operator-safe-execution-report.js";

function makeSnapshotId(): string {
  return `snapshot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSnapshotManifest(input: {
  preflight: OperatorWorktreePreflightResult;
}): OperatorWorktreeSnapshotManifest {
  const id = makeSnapshotId();
  const workspaceRoot = input.preflight.context.workspace?.root;
  const targetRelativePath = input.preflight.context.workspace?.targetRelativePath;

  return {
    id,
    createdAt: new Date().toISOString(),
    operation: input.preflight.operation,
    mode: input.preflight.mode,
    repoRoot: input.preflight.context.canonicalRepoRoot,
    targetPath: input.preflight.context.canonicalTargetPath,
    workspaceRoot,
    targetRelativePath,
    files: targetRelativePath ? [targetRelativePath] : [],
    metadata: {
      warningCodes: input.preflight.warnings.map((warning) => warning.code),
      idempotentSkip: input.preflight.context.idempotentSkip,
    },
  };
}

export async function captureOperatorSafeSnapshot(input: {
  repoRoot: string;
  preflight: OperatorWorktreePreflightResult;
}): Promise<OperatorWorktreeSnapshotResult> {
  const requiresSnapshot = input.preflight.mode !== "check";
  if (!requiresSnapshot) {
    return {
      required: false,
      captured: false,
      warnings: [],
    };
  }

  const manifest = buildSnapshotManifest({ preflight: input.preflight });
  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const artifactPath = path.join(resolveOperatorSafeSnapshotsDir(input.repoRoot), `${manifest.id}.json`);
  await fs.writeFile(artifactPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    required: true,
    captured: true,
    artifactPath,
    manifest,
    warnings: [],
  };
}
