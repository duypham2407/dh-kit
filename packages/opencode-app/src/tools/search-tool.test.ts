import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeGlobTool, executeGrepTool } from "./search-tool.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-search-tool-"));
  fs.mkdirSync(path.join(repo, "src"), { recursive: true });
  fs.writeFileSync(path.join(repo, "src", "a.ts"), "export const alpha = 1;\n");
  fs.writeFileSync(path.join(repo, "src", "b.md"), "alpha docs\n");
  fs.mkdirSync(path.join(repo, "node_modules", "x"), { recursive: true });
  fs.writeFileSync(path.join(repo, "node_modules", "x", "ignored.ts"), "alpha ignored\n");
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("executeGlobTool", () => {
  it("returns repository paths matching a glob pattern", () => {
    const repo = makeRepo();

    const result = executeGlobTool({
      repoRoot: repo,
      input: { pattern: "src/**/*.ts" },
    });

    expect(result).toMatchObject({
      status: "succeeded",
      output: { matches: ["src/a.ts"] },
      metadata: { truncated: false },
    });
  });
});

describe("executeGrepTool", () => {
  it("returns bounded text matches and skips dependency folders", () => {
    const repo = makeRepo();

    const result = executeGrepTool({
      repoRoot: repo,
      input: { pattern: "alpha", include: "**/*", limit: 2 },
    });

    expect(result.output?.matches).toEqual([
      { path: "src/a.ts", line: 1, text: "export const alpha = 1;" },
      { path: "src/b.md", line: 1, text: "alpha docs" },
    ]);
    expect(result.metadata.truncated).toBe(false);
  });
});
