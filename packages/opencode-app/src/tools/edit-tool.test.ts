import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeEditTool } from "./edit-tool.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-edit-tool-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("executeEditTool", () => {
  it("replaces exact text once by default", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "a.txt"), "alpha beta alpha");

    const result = executeEditTool({
      repoRoot: repo,
      input: { path: "a.txt", oldText: "alpha", newText: "omega" },
    });

    expect(result).toMatchObject({
      toolName: "edit",
      status: "succeeded",
      output: { path: "a.txt", replacements: 1 },
    });
    expect(fs.readFileSync(path.join(repo, "a.txt"), "utf8")).toBe("omega beta alpha");
  });

  it("fails when oldText is absent", () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "a.txt"), "alpha");

    const result = executeEditTool({
      repoRoot: repo,
      input: { path: "a.txt", oldText: "missing", newText: "omega" },
    });

    expect(result).toMatchObject({
      status: "failed",
      error: "Text to replace was not found in a.txt.",
    });
  });
});
