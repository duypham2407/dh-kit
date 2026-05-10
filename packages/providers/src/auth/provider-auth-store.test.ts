import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ProviderAuthStore } from "./provider-auth-store.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-provider-auth-store-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) fs.rmSync(repo, { recursive: true, force: true });
  repos.length = 0;
});

describe("ProviderAuthStore", () => {
  it("stores api keys in the local ignored auth file and returns redacted public records", () => {
    const repo = makeRepo();
    const store = new ProviderAuthStore(repo);

    store.save({ providerId: "openai", type: "api_key", apiKey: "sk-secret" });

    const raw = store.get("openai");
    const pub = store.getPublic("openai");
    expect(raw?.type).toBe("api_key");
    expect(raw && "apiKey" in raw ? raw.apiKey : "").toBe("sk-secret");
    expect(pub).toMatchObject({ providerId: "openai", type: "api_key", credentialStatus: "stored" });
    expect(JSON.stringify(pub)).not.toContain("sk-secret");
    expect(fs.existsSync(path.join(repo, ".dh", "auth", "providers.json"))).toBe(true);
  });

  it("stores env var references without reading the env value", () => {
    const repo = makeRepo();
    const store = new ProviderAuthStore(repo);

    store.save({ providerId: "anthropic", type: "api_key_env", apiKeyEnv: "ANTHROPIC_API_KEY" });

    expect(store.get("anthropic")).toMatchObject({ type: "api_key_env", apiKeyEnv: "ANTHROPIC_API_KEY" });
    expect(store.getPublic("anthropic")).toMatchObject({
      providerId: "anthropic",
      type: "api_key_env",
      credentialStatus: "env",
      credentialSource: "ANTHROPIC_API_KEY",
    });
  });

  it("deletes local provider credentials", () => {
    const repo = makeRepo();
    const store = new ProviderAuthStore(repo);
    store.save({ providerId: "openai", type: "api_key", apiKey: "sk-secret" });

    expect(store.delete("openai")).toBe(true);
    expect(store.get("openai")).toBeUndefined();
    expect(store.delete("openai")).toBe(false);
  });
});
