import fs from "node:fs/promises";
import path from "node:path";
import type {
  OperatorSafeTempWorkspaceManifest,
  OperatorSafeTempWorkspaceResult,
  OperatorWorktreeOperation,
} from "../../../shared/src/types/operator-worktree.js";
import {
  ensureOperatorSafeArtifactDirs,
  resolveOperatorSafeTempDir,
} from "./operator-safe-execution-report.js";

export const DEFAULT_OPERATOR_SAFE_TEMP_TTL_MS = 4 * 60 * 60 * 1000;

export async function prepareOperatorSafeTempWorkspace(input: {
  repoRoot: string;
  operation: OperatorWorktreeOperation;
  mode: "check" | "dry_run" | "execute";
  executionId: string;
  reportId: string;
  ttlMs?: number;
}): Promise<OperatorSafeTempWorkspaceResult> {
  const staleAfterMs = input.ttlMs ?? DEFAULT_OPERATOR_SAFE_TEMP_TTL_MS;
  if (input.mode === "check") {
    return {
      created: false,
      staleAfterMs,
      note: "Check mode is advisory-only; temp workspace is not provisioned.",
    };
  }

  await ensureOperatorSafeArtifactDirs(input.repoRoot);
  const tempRoot = resolveOperatorSafeTempDir(input.repoRoot);
  const prefix = `${input.operation}-${Date.now().toString(36)}-`;
  const tempPath = await fs.mkdtemp(path.join(tempRoot, prefix));
  const now = new Date().toISOString();
  const id = path.basename(tempPath);
  const manifest: OperatorSafeTempWorkspaceManifest = {
    id,
    executionId: input.executionId,
    reportId: input.reportId,
    createdAt: now,
    lastTouchedAt: now,
    operation: input.operation,
    mode: input.mode,
    repoRoot: input.repoRoot,
    tempPath,
    staleAfterMs,
  };
  const manifestPath = path.join(tempPath, "manifest.json");
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  return {
    created: true,
    id,
    executionId: input.executionId,
    reportId: input.reportId,
    path: tempPath,
    manifestPath,
    createdAt: now,
    lastTouchedAt: now,
    staleAfterMs,
    note: "Provisioned bounded temp workspace for operator-safe execution.",
  };
}
