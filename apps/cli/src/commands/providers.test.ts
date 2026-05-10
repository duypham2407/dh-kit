import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runProvidersCommand } from "./providers.js";
import { closeDhDatabase } from "../../../../packages/storage/src/sqlite/db.js";

const repos: string[] = [];
const originalEnv = { ...process.env };

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-cli-providers-test-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
    provider: {
      openai: {
        name: "OpenAI",
        npm: "@ai-sdk/openai",
        env: [],
        models: { "gpt-test": { name: "GPT Test" } },
      },
    },
  }));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos.length = 0;
});

describe("runProvidersCommand", () => {
  it("renders provider list JSON without secrets", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runProvidersCommand(["list", "--json"], "/repo", {
      listProviders: async () => ({
        providers: [{
          providerId: "openai",
          name: "OpenAI",
          enabled: true,
          credentialStatus: "stored",
          modelCount: 1,
          runtimeAvailable: true,
        }],
      }),
      loginProvider: () => { throw new Error("unused"); },
      logoutProvider: () => { throw new Error("unused"); },
      verifyProvider: async () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).providers[0].credentialStatus).toBe("stored");
    expect(String(stdout.mock.calls[0]?.[0])).not.toContain("sk-");
  });

  it("rejects login without exactly one credential input", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitCode = await runProvidersCommand(["login", "openai"], "/repo");

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("Use exactly one of --api-key-env or --api-key.");
  });

  it("renders verify JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runProvidersCommand(["verify", "openai", "--model", "gpt-test", "--json"], "/repo", {
      listProviders: async () => ({ providers: [] }),
      loginProvider: () => { throw new Error("unused"); },
      logoutProvider: () => { throw new Error("unused"); },
      verifyProvider: async () => ({
        providerId: "openai",
        modelId: "gpt-test",
        ok: false,
        reason: "missing_credential",
        message: "missing credential",
      }),
    });

    expect(exitCode).toBe(1);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).reason).toBe("missing_credential");
  });

  it("uses the real verification service by default", async () => {
    const repo = makeRepo();
    delete process.env.OPENAI_API_KEY;
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);

    const exitCode = await runProvidersCommand(["verify", "openai", "--model", "gpt-test", "--json"], repo);

    const payload = JSON.parse(String(stdout.mock.calls[0]?.[0]));
    expect(exitCode).toBe(1);
    expect(payload.reason).toBe("missing_credential");
    expect(payload.message).toContain("has no credential");
    expect(payload.message).not.toContain("provider verification is unavailable");
  });
});
