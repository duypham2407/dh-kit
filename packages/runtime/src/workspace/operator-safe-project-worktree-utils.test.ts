import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateOperatorSafeProjectWorktree } from "./operator-safe-project-worktree-utils.js";
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
});
