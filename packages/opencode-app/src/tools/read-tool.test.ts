import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeReadTool } from "./read-tool.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-read-tool-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("executeReadTool", () => {
  it("reads line slices from files inside the repository", () => {
    const repo = makeRepo();
    fs.mkdirSync(path.join(repo, "src"), { recursive: true });
    fs.writeFileSync(path.join(repo, "src", "a.txt"), "one\ntwo\nthree\nfour\n");

    const result = executeReadTool({
      repoRoot: repo,
      input: { path: "src/a.txt", offset: 1, limit: 2 },
    });

    expect(result).toMatchObject({
      toolName: "read",
      status: "succeeded",
      output: {
        path: "src/a.txt",
        content: "two\nthree",
        startLine: 2,
        endLine: 3,
      },
      metadata: { truncated: true },
    });
  });

  it("truncates returned content by maxBytes", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "README.md"), "abcdef");

    const result = executeReadTool({
      repoRoot: repo,
      input: { path: "README.md", maxBytes: 3 },
    });

    expect(result.output?.content).toBe("abc");
    expect(result.metadata).toMatchObject({
      truncated: true,
      bytesRead: 6,
      bytesReturned: 3,
      omittedBytes: 3,
    });
  });

  it("rejects paths outside the repository", () => {
    const repo = makeRepo();

    const result = executeReadTool({
      repoRoot: repo,
      input: { path: "../secret.txt" },
    });

    expect(result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("outside the repository"),
    });
  });
});
