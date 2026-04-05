import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runLaneWorkflow } from "./run-lane-command.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";

let tmpDirs: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-lane-run-test-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpDirs.push(repo);
  return repo;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tmpDirs) {
    closeDhDatabase(dir);
  }
  tmpDirs = [];
});

describe("runLaneWorkflow", () => {
  it("fails with exit code 1 when objective is missing", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "quick",
      objective: "",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(1);
    expect(report.workflowSummary[0]).toContain("Missing objective");
  });

  it("runs delivery lane and returns structured summary output", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "delivery",
      objective: "deliver browser feature",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.lane).toBe("delivery");
    expect(report.objective).toContain("deliver browser feature");
    expect(report.workflowSummary.some((line) => line.includes("Executed work items:"))).toBe(true);
  });

  it("runs migration lane and enforces migration summary semantics", async () => {
    const repo = makeTmpRepo();

    const report = await runLaneWorkflow({
      lane: "migration",
      objective: "migrate frontend build",
      repoRoot: repo,
    });

    expect(report.exitCode).toBe(0);
    expect(report.lane).toBe("migration");
    expect(report.workflowSummary[0]).toContain("Migration mode preserves behavior by default.");
  });
});
