import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeWriteTool } from "./write-tool.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-write-tool-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("executeWriteTool", () => {
  it("writes UTF-8 content inside the repository", () => {
    const repo = makeRepo();

    const result = executeWriteTool({
      repoRoot: repo,
      input: { path: "nested/out.txt", content: "hello", createDirs: true },
    });

    expect(result).toMatchObject({
      toolName: "write",
      status: "succeeded",
      output: { path: "nested/out.txt", bytesWritten: 5 },
    });
    expect(fs.readFileSync(path.join(repo, "nested", "out.txt"), "utf8")).toBe("hello");
  });

  it("rejects writes outside the repository", () => {
    const repo = makeRepo();

    const result = executeWriteTool({
      repoRoot: repo,
      input: { path: "../out.txt", content: "no" },
    });

    expect(result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("outside the repository"),
    });
  });
});
