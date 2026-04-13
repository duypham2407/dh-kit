import fs from "node:fs/promises";
import type { OperatorWorktreeMaintenanceSummary } from "../../../shared/src/types/operator-worktree.js";
import {
  ensureOperatorSafeArtifactDirs,
  resolveOperatorSafeReportsDir,
  resolveOperatorSafeSnapshotsDir,
  resolveOperatorSafeTempDir,
} from "./operator-safe-execution-report.js";

export async function listOperatorSafeArtifacts(repoRoot: string): Promise<OperatorWorktreeMaintenanceSummary> {
  await ensureOperatorSafeArtifactDirs(repoRoot);

  const [reports, snapshots, tempWorkspaces] = await Promise.all([
    fs.readdir(resolveOperatorSafeReportsDir(repoRoot)),
    fs.readdir(resolveOperatorSafeSnapshotsDir(repoRoot)),
    fs.readdir(resolveOperatorSafeTempDir(repoRoot)),
  ]);

  return {
    reports: reports.sort((left, right) => left.localeCompare(right)),
    snapshots: snapshots.sort((left, right) => left.localeCompare(right)),
    tempWorkspaces: tempWorkspaces.sort((left, right) => left.localeCompare(right)),
  };
}

export async function pruneOperatorSafeArtifacts(input: {
  repoRoot: string;
  olderThanMs: number;
}): Promise<{
  reportsRemoved: number;
  snapshotsRemoved: number;
  tempRemoved: number;
}> {
  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const now = Date.now();

  async function pruneDir(dir: string): Promise<number> {
    const entries = await fs.readdir(dir);
    let removed = 0;

    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      const stat = await fs.stat(fullPath);
      if (now - stat.mtimeMs <= input.olderThanMs) {
        continue;
      }
      await fs.rm(fullPath, { recursive: true, force: true });
      removed += 1;
    }

    return removed;
  }

  const [reportsRemoved, snapshotsRemoved, tempRemoved] = await Promise.all([
    pruneDir(resolveOperatorSafeReportsDir(input.repoRoot)),
    pruneDir(resolveOperatorSafeSnapshotsDir(input.repoRoot)),
    pruneDir(resolveOperatorSafeTempDir(input.repoRoot)),
  ]);

  return {
    reportsRemoved,
    snapshotsRemoved,
    tempRemoved,
  };
}
