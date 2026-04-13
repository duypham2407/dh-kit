import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildExtensionStateDriftReport } from "./extension-drift-report.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-extension-drift-report-"));
  fs.mkdirSync(path.join(repo, ".dh", "runtime"), { recursive: true });
  repos.push(repo);
  return repo;
}

function storePath(repo: string): string {
  return path.join(repo, ".dh", "runtime", "extension-runtime-state.json");
}

afterEach(() => {
  for (const repo of repos) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("buildExtensionStateDriftReport", () => {
  it("returns clean no-warning report when store is absent", () => {
    const repo = makeRepo();

    const report = buildExtensionStateDriftReport({
      repoRoot: repo,
    });

    expect(report.summary.persistedExtensionCount).toBe(0);
    expect(report.summary.classifiedExtensionCount).toBe(0);
    expect(report.summary.firstCount).toBe(0);
    expect(report.summary.sameCount).toBe(0);
    expect(report.summary.updatedCount).toBe(0);
    expect(report.summary.driftedExtensionIds).toEqual([]);
    expect(report.extensions).toEqual([]);
    expect(report.warnings).toEqual([]);
  });

  it("builds deterministic report with aggregate counts", () => {
    const repo = makeRepo();
    fs.writeFileSync(
      storePath(repo),
      `${JSON.stringify({
        version: "v1",
        records: {
          augment_context_engine: {
            version: "v1",
            extensionId: "augment_context_engine",
            fingerprint: "fp-a",
            loadCount: 2,
            lastSeenAt: "2026-04-13T10:00:00.000Z",
          },
          playwright: {
            version: "v1",
            extensionId: "playwright",
            fingerprint: "fp-b",
            loadCount: 4,
            lastSeenAt: "2026-04-13T11:00:00.000Z",
          },
        },
      }, null, 2)}\n`,
      "utf8",
    );

    const report = buildExtensionStateDriftReport({
      repoRoot: repo,
      runtimeStates: {
        augment_context_engine: { state: "same", fingerprint: "fp-a" },
        playwright: { state: "updated", fingerprint: "fp-b2" },
        context7: { state: "first", fingerprint: "fp-c" },
      },
    });

    expect(report.summary.persistedExtensionCount).toBe(2);
    expect(report.summary.classifiedExtensionCount).toBe(3);
    expect(report.summary.firstCount).toBe(1);
    expect(report.summary.sameCount).toBe(1);
    expect(report.summary.updatedCount).toBe(1);
    expect(report.summary.driftedExtensionIds).toEqual(["playwright"]);
    expect(report.extensions.map((entry) => entry.extensionId)).toEqual([
      "augment_context_engine",
      "context7",
      "playwright",
    ]);
    expect(report.warnings).toEqual([]);
  });

  it("degrades with warning when state store is malformed", () => {
    const repo = makeRepo();
    fs.writeFileSync(storePath(repo), "{bad-json", "utf8");

    const report = buildExtensionStateDriftReport({
      repoRoot: repo,
      runtimeStates: {
        augment_context_engine: { state: "updated", fingerprint: "fp-z" },
      },
    });

    expect(report.summary.persistedExtensionCount).toBe(0);
    expect(report.summary.classifiedExtensionCount).toBe(1);
    expect(report.summary.updatedCount).toBe(1);
    expect(report.summary.driftedExtensionIds).toEqual(["augment_context_engine"]);
    expect(report.warnings).toHaveLength(1);
    expect(report.warnings[0]).toContain("degraded");
  });
});
