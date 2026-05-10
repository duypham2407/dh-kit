import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeShellTool } from "./shell-tool.js";

let repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-shell-tool-"));
  repos.push(repo);
  return repo;
}

function nodeCommand(script: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos = [];
});

describe("executeShellTool", () => {
  it("streams stdout chunks and returns command output", async () => {
    const repo = makeRepo();
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];

    const result = await executeShellTool({
      repoRoot: repo,
      input: { command: nodeCommand("process.stdout.write('hello')") },
      permissionLevel: "allow",
      onEvent: (type, payload) => events.push({ type, payload }),
    });

    expect(result).toMatchObject({
      toolName: "shell",
      status: "succeeded",
      output: { stdout: "hello", stderr: "", exitCode: 0 },
      metadata: { truncated: false, exitCode: 0 },
    });
    expect(events).toEqual([
      { type: "tool.delta", payload: { toolName: "shell", stream: "stdout", text: "hello" } },
    ]);
  });

  it("blocks automatic approval when bash guard recommends a structured substitute", async () => {
    const repo = makeRepo();

    const result = await executeShellTool({
      repoRoot: repo,
      input: { command: "grep -r alpha src" },
      permissionLevel: "auto_approve_with_policy",
    });

    expect(result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Blocked by bash guard"),
    });
  });

  it("fails timed-out commands", async () => {
    const repo = makeRepo();

    const result = await executeShellTool({
      repoRoot: repo,
      input: { command: nodeCommand("setTimeout(() => {}, 1000)"), timeoutMs: 25 },
      permissionLevel: "allow",
    });

    expect(result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("timed out"),
    });
  });

  it("truncates large output explicitly", async () => {
    const repo = makeRepo();

    const result = await executeShellTool({
      repoRoot: repo,
      input: { command: nodeCommand("process.stdout.write('abcdef')"), maxOutputBytes: 3 },
      permissionLevel: "allow",
    });

    expect(result.output?.stdout).toBe("abc");
    expect(result.metadata).toMatchObject({
      truncated: true,
      bytesReturned: 3,
      omittedBytes: 3,
    });
  });
});
