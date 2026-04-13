import fs from "node:fs/promises";
import path from "node:path";
import type { OperatorSafeTempWorkspaceResult } from "../../../shared/src/types/operator-worktree.js";
import {
  ensureOperatorSafeArtifactDirs,
  resolveOperatorSafeTempDir,
} from "./operator-safe-execution-report.js";

export const DEFAULT_OPERATOR_SAFE_TEMP_TTL_MS = 4 * 60 * 60 * 1000;

export async function prepareOperatorSafeTempWorkspace(input: {
  repoRoot: string;
  operation: string;
  mode: "check" | "dry_run" | "execute";
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

  return {
    created: true,
    path: tempPath,
    staleAfterMs,
    note: "Provisioned bounded temp workspace for operator-safe execution.",
  };
}
