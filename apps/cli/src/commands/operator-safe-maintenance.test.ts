import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOperatorSafeMaintenanceCommand } from "./operator-safe-maintenance.js";
import { runOperatorSafeProjectWorktreeLifecycle } from "../../../../packages/runtime/src/workspace/operator-safe-project-worktree-utils.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-operator-safe-maintenance-test-"));
  fs.mkdirSync(path.join(dir, ".dh"), { recursive: true });
  fs.mkdirSync(path.join(dir, "src"), { recursive: true });
  fs.writeFileSync(path.join(dir, "package.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(dir, "src", "a.ts"), "export const a = 1;\n", "utf8");
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tmpDirs = [];
});

describe("runOperatorSafeMaintenanceCommand", () => {
  it("lists inventory as JSON", async () => {
    const repo = makeTmpRepo();
    await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const code = await runOperatorSafeMaintenanceCommand(["list", "--json"], repo);
    expect(code).toBe(0);
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0] ?? "{}"));
    expect(payload.totalCount).toBeGreaterThan(0);
    expect(payload.families.report.length).toBeGreaterThan(0);
    expect(payload.families.snapshot.length).toBeGreaterThan(0);
    expect(payload.families.temp_workspace.length).toBeGreaterThan(0);
  });

  it("inspects report artifact", async () => {
    const repo = makeTmpRepo();
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const code = await runOperatorSafeMaintenanceCommand([
      "inspect",
      "--family",
      "report",
      "--id",
      lifecycle.report.id,
      "--json",
    ], repo);

    expect(code).toBe(0);
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0] ?? "{}"));
    expect(payload.found).toBe(true);
    expect(payload.family).toBe("report");
    expect(payload.details.family).toBe("report");
    expect(payload.details.operation).toBe("index_workspace");
  });

  it("returns not found on missing inspect artifact", async () => {
    const repo = makeTmpRepo();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runOperatorSafeMaintenanceCommand([
      "inspect",
      "--family",
      "snapshot",
      "--id",
      "missing-snapshot-id",
    ], repo);
    expect(code).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0] ?? "")).toContain("artifact_not_found");
  });

  it("prunes with dry-run and apply modes", async () => {
    const repo = makeTmpRepo();
    await runOperatorSafeProjectWorktreeLifecycle({
      mode: "dry_run",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: false,
    });

    const dryRunStdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const dryRunCode = await runOperatorSafeMaintenanceCommand(["prune", "--mode", "dry-run", "--json"], repo);
    expect(dryRunCode).toBe(0);
    const dryRunPayload = JSON.parse(String(dryRunStdout.mock.calls[0]?.[0] ?? "{}"));
    expect(dryRunPayload.action).toBe("prune");
    expect(dryRunPayload.mode).toBe("dry_run");

    dryRunStdout.mockClear();
    const applyCode = await runOperatorSafeMaintenanceCommand(["prune", "--mode", "apply", "--json"], repo);
    expect(applyCode).toBe(0);
    const applyPayload = JSON.parse(String(dryRunStdout.mock.calls[0]?.[0] ?? "{}"));
    expect(applyPayload.action).toBe("prune");
    expect(applyPayload.mode).toBe("apply");
  });

  it("performs cleanup by report for degraded run residue", async () => {
    const repo = makeTmpRepo();
    const lifecycle = await runOperatorSafeProjectWorktreeLifecycle({
      mode: "check",
      operation: "index_workspace",
      repoRoot: repo,
      targetPath: path.join(repo, "src", "a.ts"),
      requireVcs: true,
    });

    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const code = await runOperatorSafeMaintenanceCommand([
      "cleanup",
      "--mode",
      "dry-run",
      "--report",
      lifecycle.report.id,
      "--json",
    ], repo);

    expect(code).toBe(0);
    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0] ?? "{}"));
    expect(payload.action).toBe("cleanup");
    expect(payload.mode).toBe("dry_run");
    expect(payload.evaluated.length).toBeGreaterThan(0);
  });

  it("refuses cleanup without explicit target selector", async () => {
    const repo = makeTmpRepo();
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const code = await runOperatorSafeMaintenanceCommand(["cleanup", "--mode", "dry-run"], repo);
    expect(code).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0] ?? "")).toContain("cleanup requires either");
  });
});
