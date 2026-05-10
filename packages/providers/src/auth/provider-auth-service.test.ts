import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderAuthStore } from "./provider-auth-store.js";
import { loginProvider, logoutProvider, redactProviderSecrets, resolveProviderCredential, verifyProvider } from "./provider-auth-service.js";

const repos: string[] = [];
const originalEnv = { ...process.env };

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-provider-auth-service-"));
  repos.push(repo);
  return repo;
}

function writeProviderConfig(repo: string) {
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
}

afterEach(() => {
  vi.restoreAllMocks();
  process.env = { ...originalEnv };
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("provider auth service", () => {
  it("resolves credentials with env before store before config", () => {
    const repo = makeRepo();
    process.env.OPENAI_API_KEY = "env-secret";
    new ProviderAuthStore(repo).save({ providerId: "openai", type: "api_key", apiKey: "stored-secret" });

    const resolved = resolveProviderCredential(repo, {
      providerId: "openai",
      env: ["OPENAI_API_KEY"],
      configApiKey: "config-secret",
    });

    expect(resolved).toMatchObject({ status: "env", source: "OPENAI_API_KEY", apiKey: "env-secret" });
  });

  it("logs in with env references and raw keys without leaking secrets in reports", () => {
    const repo = makeRepo();

    const envReport = loginProvider(repo, { providerId: "openai", apiKeyEnv: "OPENAI_API_KEY" });
    const keyReport = loginProvider(repo, { providerId: "anthropic", apiKey: "sk-secret" });

    expect(envReport).toEqual({ providerId: "openai", credentialStatus: "env", credentialSource: "OPENAI_API_KEY" });
    expect(keyReport).toEqual({ providerId: "anthropic", credentialStatus: "stored" });
    expect(JSON.stringify({ envReport, keyReport })).not.toContain("sk-secret");
  });

  it("logs out local credentials", () => {
    const repo = makeRepo();
    loginProvider(repo, { providerId: "openai", apiKey: "sk-secret" });

    expect(logoutProvider(repo, "openai")).toEqual({ providerId: "openai", removed: true });
    expect(() => logoutProvider(repo, "openai")).toThrow("No local credential found for provider 'openai'.");
  });

  it("redacts nested secret keys and secret-looking values", () => {
    const redacted = redactProviderSecrets({
      apiKey: "sk-secret",
      nested: { authorization: "Bearer token-secret", safe: "visible" },
    });

    expect(redacted).toEqual({
      apiKey: "[REDACTED_SECRET]",
      nested: { authorization: "[REDACTED_SECRET]", safe: "visible" },
    });
  });

  it("classifies missing credentials during provider verification", async () => {
    const repo = makeRepo();
    writeProviderConfig(repo);
    delete process.env.OPENAI_API_KEY;

    const report = await verifyProvider(repo, {
      providerId: "openai",
      modelId: "gpt-test",
      createChatProvider: async () => {
        throw new Error("should not create provider without credentials");
      },
    });

    expect(report).toMatchObject({
      providerId: "openai",
      ok: false,
      reason: "missing_credential",
    });
  });

  it("returns ok when tiny non-streaming verification succeeds", async () => {
    const repo = makeRepo();
    writeProviderConfig(repo);
    delete process.env.OPENAI_API_KEY;
    loginProvider(repo, { providerId: "openai", apiKey: "sk-secret" });

    const report = await verifyProvider(repo, {
      providerId: "openai",
      modelId: "gpt-test",
      createChatProvider: async () => ({
        providerId: "openai",
        chat: async () => ({
          content: "OK",
          model: "gpt-test",
          finishReason: "stop",
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
        }),
      }),
    });

    expect(report).toMatchObject({ ok: true, providerId: "openai", modelId: "gpt-test" });
    expect(JSON.stringify(report)).not.toContain("sk-secret");
  });
});
