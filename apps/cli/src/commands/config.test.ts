import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runConfigCommand } from "./config.js";
import { closeDhDatabase } from "../../../../packages/storage/src/sqlite/db.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-config-test-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  repos.push(repo);
  return repo;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos.length = 0;
});

describe("runConfigCommand", () => {
  it("shows provider credential status without raw provider secrets", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
      provider: {
        openai: {
          name: "OpenAI",
          options: { apiKey: "sk-config-secret" },
          models: { "gpt-test": { name: "GPT Test" } },
        },
      },
    }));
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runConfigCommand(["--show"], repo);

    const output = String(stdout.mock.calls[0]?.[0] ?? "");
    expect(exitCode).toBe(0);
    expect(output).toContain("Provider registry:");
    expect(output).toContain("openai");
    expect(output).toContain("credential: config");
    expect(output).not.toContain("sk-config-secret");
  });
});
