import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOperatorSafeProjectWorktreeLifecycle } from "./operator-safe-project-worktree-utils.js";
import {
  cleanupOperatorSafeArtifacts,
  inspectOperatorSafeArtifact,
  listOperatorSafeArtifacts,
  pruneOperatorSafeArtifacts,
  resolveOperatorSafePruneRetentionPolicyMs,
} from "./operator-safe-maintenance-utils.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-maintenance-utils-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;\n", "utf8");
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe("operator-safe-maintenance-utils", () => {
  it("returns explicit empty inventory when no artifacts exist", async () => {
    const repo = makeTmpRepo();
    const inventory = await listOperatorSafeArtifacts({ repoRoot: repo });
    expect(inventory.totalCount).toBe(0);
    expect(inventory.families.report).toHaveLength(0);
    expect(inventory.families.snapshot).toHaveLength(0);
    expect(inventory.families.temp_workspace).toHaveLength(0);
  });

  it("lists and inspects report/snapshot/temp artifacts with meaningful details", async () => {
    const repo = makeTmpRepo();
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const inventory = await listOperatorSafeArtifacts({ repoRoot: repo });
    expect(inventory.families.report.length).toBeGreaterThan(0);
    expect(inventory.families.snapshot.length).toBeGreaterThan(0);
    expect(inventory.families.temp_workspace.length).toBeGreaterThan(0);

    const reportInspect = await inspectOperatorSafeArtifact({
      repoRoot: repo,
      family: "report",
      artifactId: lifecycle.report.id,
    });
    expect(reportInspect.found).toBe(true);
    expect(reportInspect.details?.family).toBe("report");
    if (reportInspect.details?.family === "report") {
      expect(reportInspect.details.operation).toBe("index_workspace");
      expect(reportInspect.details.mode).toBe("dry_run");
      expect(reportInspect.details.outcome).toBe("dry_run");
    }

    const snapshotId = inventory.families.snapshot[0]!.artifactId;
    const snapshotInspect = await inspectOperatorSafeArtifact({
      repoRoot: repo,
      family: "snapshot",
      artifactId: snapshotId,
    });
    expect(snapshotInspect.found).toBe(true);
    expect(snapshotInspect.details?.family).toBe("snapshot");

    const tempId = inventory.families.temp_workspace[0]!.artifactId;
    const tempInspect = await inspectOperatorSafeArtifact({
      repoRoot: repo,
      family: "temp_workspace",
      artifactId: tempId,
    });
    expect(tempInspect.found).toBe(true);
    expect(tempInspect.details?.family).toBe("temp_workspace");
  });

  it("returns artifact_not_found on missing inspect target", async () => {
    const repo = makeTmpRepo();
    const result = await inspectOperatorSafeArtifact({
      repoRoot: repo,
      family: "report",
      artifactId: "missing-report-id",
    });
    expect(result.found).toBe(false);
    expect(result.reason).toBe("artifact_not_found");
  });

  it("prune keeps recent artifacts by default policy and can remove with override", async () => {
    const repo = makeTmpRepo();
    await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const dryRun = await pruneOperatorSafeArtifacts({
      repoRoot: repo,
      request: {
        mode: "dry_run",
      },
    });
    expect(dryRun.retained.length).toBeGreaterThan(0);
    expect(dryRun.retained.some((item) => item.reason === "artifact_too_recent_for_policy_prune")).toBe(true);

    const apply = await pruneOperatorSafeArtifacts({
      repoRoot: repo,
      request: {
        mode: "apply",
        retentionOverridesMs: {
          report: -1,
          snapshot: -1,
          temp_workspace: -1,
        },
      },
    });
    expect(apply.removed.length).toBeGreaterThan(0);

    const after = await listOperatorSafeArtifacts({ repoRoot: repo });
    expect(after.totalCount).toBe(0);
  });

  it("cleanup report dry-run returns targeted plan for degraded run", async () => {
    const repo = makeTmpRepo();
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "check",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: true,
    });

    const result = await cleanupOperatorSafeArtifacts({
      repoRoot: repo,
      request: {
        mode: "dry_run",
        reportId: lifecycle.report.id,
      },
    });
    expect(result.action).toBe("cleanup");
    expect(result.mode).toBe("dry_run");
    expect(result.evaluated.length).toBeGreaterThan(0);
    expect(result.planned.length).toBeGreaterThan(0);
  });

  it("cleanup refuses recent successful report targets", async () => {
    const repo = makeTmpRepo();
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const result = await cleanupOperatorSafeArtifacts({
      repoRoot: repo,
      request: {
        mode: "dry_run",
        reportId: lifecycle.report.id,
      },
    });
    expect(result.retained.some((item) => item.reason === "report_outcome_not_cleanup_eligible")).toBe(true);
    expect(result.warnings.some((warning) => warning.reason === "cleanup_eligibility_unproven")).toBe(true);
  });

  it("cleanup by explicit temp id removes orphan target", async () => {
    const repo = makeTmpRepo();
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const reportPath = path.join(repo, ".dh", "runtime", "operator-safe-worktree", "reports", `${lifecycle.report.id}.json`);
    fs.rmSync(reportPath, { force: true });

    const inventory = await listOperatorSafeArtifacts({ repoRoot: repo, family: "temp_workspace" });
    const temp = inventory.families.temp_workspace[0];
    expect(temp).toBeDefined();

    const result = await cleanupOperatorSafeArtifacts({
      repoRoot: repo,
      request: {
        mode: "apply",
        family: "temp_workspace",
        artifactId: temp!.artifactId,
      },
    });
    expect(result.removed.some((item) => item.family === "temp_workspace" && item.artifactId === temp!.artifactId)).toBe(true);
  });

  it("exposes stable default retention policy", () => {
    const policy = resolveOperatorSafePruneRetentionPolicyMs();
    expect(policy.report).toBe(7 * 24 * 60 * 60 * 1000);
    expect(policy.snapshot).toBe(3 * 24 * 60 * 60 * 1000);
    expect(policy.temp_workspace).toBe(24 * 60 * 60 * 1000);
  });
});
