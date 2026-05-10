import { afterEach, describe, expect, it, vi } from "vitest";
import { runProvidersCommand } from "./providers.js";

afterEach(() => vi.restoreAllMocks());

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
});
