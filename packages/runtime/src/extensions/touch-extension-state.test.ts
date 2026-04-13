import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionSpec } from "../../../opencode-sdk/src/index.js";
import { touchExtensionState } from "./touch-extension-state.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-extension-touch-state-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

function storePath(repo: string): string {
  return path.join(repo, ".dh", "runtime", "extension-runtime-state.json");
}

function makeSpec(overrides?: Partial<ExtensionSpec>): ExtensionSpec {
  return {
    id: "augment_context_engine",
    contractVersion: "v1",
    entry: "tool:augment_context_engine",
    capabilities: ["code_search", "impact_analysis"],
    priority: 100,
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "analyst", "architect", "implementer", "reviewer"],
    ...overrides,
  };
}

afterEach(() => {
  for (const repo of repos) {
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos = [];
});

describe("touchExtensionState", () => {
  it("returns first when no prior record exists", () => {
    const repo = makeRepo();

    const result = touchExtensionState({ repoRoot: repo, spec: makeSpec() });

    expect(result.state).toBe("first");
    expect(typeof result.fingerprint).toBe("string");
    expect(result.fingerprint.length).toBeGreaterThan(0);
  });

  it("returns same when fingerprint is unchanged", () => {
    const repo = makeRepo();
    const spec = makeSpec();

    const first = touchExtensionState({ repoRoot: repo, spec });
    const second = touchExtensionState({ repoRoot: repo, spec });

    expect(first.state).toBe("first");
    expect(second.state).toBe("same");
    expect(second.fingerprint).toBe(first.fingerprint);
  });

  it("returns updated when fingerprint changes", () => {
    const repo = makeRepo();
    const spec = makeSpec();

    touchExtensionState({ repoRoot: repo, spec });
    const changed = touchExtensionState({
      repoRoot: repo,
      spec: makeSpec({ capabilities: ["code_search", "impact_analysis", "traceability"] }),
    });

    expect(changed.state).toBe("updated");
  });

  it("isolates state across multiple extension ids", () => {
    const repo = makeRepo();
    const firstA = touchExtensionState({ repoRoot: repo, spec: makeSpec({ id: "augment_context_engine" }) });
    const firstB = touchExtensionState({ repoRoot: repo, spec: makeSpec({ id: "context7", entry: "tool:context7" }) });
    const secondA = touchExtensionState({ repoRoot: repo, spec: makeSpec({ id: "augment_context_engine" }) });

    expect(firstA.state).toBe("first");
    expect(firstB.state).toBe("first");
    expect(secondA.state).toBe("same");
  });

  it("returns bounded warning when store is unreadable", () => {
    const repo = makeRepo();
    fs.mkdirSync(path.dirname(storePath(repo)), { recursive: true });
    fs.writeFileSync(storePath(repo), "{invalid", "utf8");

    const result = touchExtensionState({ repoRoot: repo, spec: makeSpec() });

    expect(result.state).toBe("first");
    expect(result.warning).toContain("read failed");
  });

  it("returns bounded warning when store write fails", () => {
    const repo = makeRepo();
    const runtimeStorePath = storePath(repo);
    const runtimeDir = path.dirname(runtimeStorePath);
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(
      runtimeStorePath,
      `${JSON.stringify({ version: "v1", records: {} }, null, 2)}\n`,
      "utf8",
    );
    fs.chmodSync(runtimeStorePath, 0o444);

    try {
      const result = touchExtensionState({ repoRoot: repo, spec: makeSpec() });
      expect(result.warning).toContain("write failed");
      expect(result.state).toBe("first");
    } finally {
      fs.chmodSync(runtimeStorePath, 0o644);
    }
  });
});
