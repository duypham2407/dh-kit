import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateOperatorSafeProjectWorktree, runOperatorSafeProjectWorktreeLifecycle } from "./operator-safe-project-worktree-utils.js";
import {
  listOperatorSafeArtifacts,
  pruneOperatorSafeArtifacts,
} from "./operator-safe-maintenance-utils.js";
import { detectProjects } from "../../../intelligence/src/workspace/detect-projects.js";

function makeRepo(input?: { withMarker?: boolean; withGit?: boolean }): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dh-operator-safe-worktree-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "a.ts"), "export const a = 1;\n", "utf8");
  if (input?.withMarker !== false) {
    fs.writeFileSync(path.join(root, "package.json"), "{}\n", "utf8");
  }
  if (input?.withGit) {
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  }
  return root;
}

describe("evaluateOperatorSafeProjectWorktree", () => {
  it("allows valid in-repo target with marker in check mode", async () => {
    const repo = makeRepo({ withMarker: true });
    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "check",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.blockingReasons).toEqual([]);
    expect(result.context.workspace?.targetRelativePath).toBe("src/a.ts");
    expect(result.recommendedAction).toBe("run_dry_run");
  });

  it("blocks target path outside repository boundary", async () => {
    const repo = makeRepo({ withMarker: true });
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), "dh-operator-safe-worktree-outside-"));
    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: outside,
      requireVcs: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.code === "target_outside_repo")).toBe(true);
    expect(result.recommendedAction).toBe("adjust_target");
  });

  it("blocks when vcs is required but .git is missing", async () => {
    const repo = makeRepo({ withMarker: true, withGit: false });
    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: repo,
      requireVcs: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.code === "vcs_required_but_missing")).toBe(true);
  });

  it("triggers idempotency guard when target file id is already indexed", async () => {
    const repo = makeRepo({ withMarker: true });
    const baseline = await evaluateOperatorSafeProjectWorktree({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const workspaceRoot = baseline.context.workspace?.root;
    expect(workspaceRoot).toBeDefined();

    const workspaces = await detectProjects(repo);
    const workspace = workspaces.find((item) => item.root === workspaceRoot);
    const file = workspace?.files.find((item) => item.path === "src/a.ts");
    expect(file).toBeDefined();

    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "execute",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
      alreadyIndexedFileIds: [file!.id],
    });

    expect(result.allowed).toBe(false);
    expect(result.context.idempotentSkip).toBe(true);
    expect(result.blockingReasons.some((reason) => reason.code === "already_indexed")).toBe(true);
    expect(result.recommendedAction).toBe("run_full_index");
  });

  it("emits distinct workspace_missing_markers warning code", async () => {
    const repo = makeRepo({ withMarker: false });

    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "check",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    expect(result.allowed).toBe(true);
    expect(result.warnings.some((warning) => warning.code === "workspace_missing_markers")).toBe(true);
    expect(result.recommendedAction).toBe("add_workspace_marker");
  });

  it("creates bounded execution report and artifacts for dry_run lifecycle", async () => {
    const repo = makeRepo({ withMarker: true });
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    expect(lifecycle.preflight.allowed).toBe(true);
    expect(lifecycle.report.mode).toBe("dry_run");
    expect(["dry_run", "rollback_degraded"]).toContain(lifecycle.report.outcome);
    expect(lifecycle.report.snapshot?.required).toBe(true);
    expect(lifecycle.report.snapshot?.captured).toBe(true);
    expect(lifecycle.report.tempWorkspace?.created).toBe(true);
    expect(lifecycle.reportPath).toContain(".dh/runtime/operator-safe-worktree/reports/");

    const artifacts = await listOperatorSafeArtifacts(repo);
    expect(artifacts.reports.length).toBeGreaterThan(0);
    expect(artifacts.snapshots.length).toBeGreaterThan(0);
    expect(artifacts.tempWorkspaces.length).toBeGreaterThan(0);
  });

  it("reports execute delegated flow as succeeded when rollback is unavailable", async () => {
    const repo = makeRepo({ withMarker: true });
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "execute",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    expect(lifecycle.preflight.allowed).toBe(true);
    expect(lifecycle.report.mode).toBe("execute");
    expect(lifecycle.report.outcome).toBe("succeeded");
    expect(lifecycle.report.failureClass).toBe("none");
    expect(lifecycle.report.rollback?.attempted).toBe(false);
    expect(lifecycle.report.rollback?.unavailable).toBe(true);
    expect(lifecycle.report.rollback?.degraded).toBe(false);
  });

  it("emits operation_not_supported for unsupported operation guard", async () => {
    const repo = makeRepo({ withMarker: true });
    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "check",
      operation: "unknown_operation" as unknown as "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.blockingReasons.some((reason) => reason.code === "operation_not_supported")).toBe(true);
  });

  it("prioritizes add_workspace_marker over idempotent run_full_index recommendation", async () => {
    const repo = makeRepo({ withMarker: false });
    const workspaces = await detectProjects(repo);
    const workspace = workspaces[0];
    const file = workspace?.files.find((item) => item.path === "src/a.ts");
    expect(file).toBeDefined();

    const result = await evaluateOperatorSafeProjectWorktree({
      mode: "execute",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
      alreadyIndexedFileIds: [file!.id],
      knownWorkspaces: workspaces,
    });

    expect(result.warnings.some((warning) => warning.code === "workspace_missing_markers")).toBe(true);
    expect(result.context.idempotentSkip).toBe(true);
    expect(result.recommendedAction).toBe("add_workspace_marker");
  });

  it("prunes stale operator-safe artifacts", async () => {
    const repo = makeRepo({ withMarker: true });
    await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const before = await listOperatorSafeArtifacts(repo);
    expect(before.reports.length).toBeGreaterThan(0);

    const pruned = await pruneOperatorSafeArtifacts({
      repoRoot: repo,
      olderThanMs: -1,
    });
    expect(pruned.reportsRemoved).toBeGreaterThanOrEqual(1);

    const after = await listOperatorSafeArtifacts(repo);
    expect(after.reports.length).toBe(0);
    expect(after.snapshots.length).toBe(0);
    expect(after.tempWorkspaces.length).toBe(0);
  });
});
