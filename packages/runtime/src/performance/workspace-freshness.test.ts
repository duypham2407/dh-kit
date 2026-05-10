import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkWorkspaceFreshness, computeWorkspaceFingerprint } from "./workspace-freshness.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-freshness-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export const value = 1;\n");
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("workspace freshness", () => {
  it("detects first run, fresh workspace, and changed files by fingerprint", () => {
    const repo = makeRepo();

    const first = checkWorkspaceFreshness({ repoRoot: repo, update: true });
    const second = checkWorkspaceFreshness({ repoRoot: repo, update: true });
    fs.writeFileSync(path.join(repo, "src", "auth.ts"), "export const value = 2;\n");
    const changed = checkWorkspaceFreshness({ repoRoot: repo, update: false });

    expect(first.status).toBe("first_run");
    expect(second.status).toBe("fresh");
    expect(changed.status).toBe("changed");
    expect(changed.changedFiles).toEqual(["src/auth.ts"]);
  });

  it("computes stable workspace fingerprints", () => {
    const repo = makeRepo();
    const left = computeWorkspaceFingerprint(repo);
    const right = computeWorkspaceFingerprint(repo);

    expect(left.fingerprint).toBe(right.fingerprint);
    expect(left.files).toContain("src/auth.ts");
  });
});
