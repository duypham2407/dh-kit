import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { loadModelCatalog, loadProviderRegistry } from "./provider-config-loader.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-provider-config-loader-"));
  repos.push(repo);
  return repo;
}

afterEach(() => {
  for (const repo of repos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  repos.length = 0;
});

describe("provider config loader", () => {
  it("merges catalog providers with opencode.json overrides and credential status", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
      provider: {
        openai: { name: "OpenAI Custom", options: { apiKey: "config-secret" } },
        localai: {
          name: "LocalAI",
          npm: "@ai-sdk/openai-compatible",
          options: { baseURL: "http://localhost:8080/v1" },
          models: { "local-model": { name: "Local Model" } },
        },
      },
    }));

    const report = await loadProviderRegistry(repo, {
      catalog: {
        openai: {
          id: "openai",
          name: "OpenAI",
          env: ["OPENAI_API_KEY"],
          npm: "@ai-sdk/openai",
          models: { "gpt-test": { name: "GPT Test" } },
        },
      } as never,
    });

    expect(report.providers.find((provider) => provider.providerId === "openai")).toMatchObject({
      name: "OpenAI Custom",
      credentialStatus: "config",
      modelCount: 1,
      runtimeAvailable: true,
    });
    expect(report.providers.find((provider) => provider.providerId === "localai")).toMatchObject({
      name: "LocalAI",
      modelCount: 1,
      runtimeAvailable: true,
    });
    expect(JSON.stringify(report)).not.toContain("config-secret");
  });

  it("respects enabled and disabled provider filters", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
      enabled_providers: ["openai"],
      disabled_providers: ["anthropic"],
    }));

    const report = await loadProviderRegistry(repo, {
      catalog: {
        openai: { id: "openai", name: "OpenAI", env: [], npm: "@ai-sdk/openai", models: {} },
        anthropic: { id: "anthropic", name: "Anthropic", env: [], npm: "@ai-sdk/anthropic", models: {} },
      } as never,
    });

    expect(report.providers.map((provider) => provider.providerId)).toEqual(["openai"]);
  });

  it("throws a clear error for malformed opencode.json", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), "{");

    await expect(loadProviderRegistry(repo, { catalog: {} as never })).rejects.toThrow("Failed to parse opencode.json:");
  });

  it("builds a model catalog from custom opencode providers", async () => {
    const repo = makeRepo();
    fs.writeFileSync(path.join(repo, "opencode.json"), JSON.stringify({
      provider: {
        localai: {
          name: "LocalAI",
          npm: "@ai-sdk/openai-compatible",
          models: {
            "local-model": {
              name: "Local Model",
              status: "beta",
              release_date: "2026-05-10",
            },
          },
        },
      },
    }));

    const report = await loadModelCatalog(repo, { providerId: "localai", verbose: true, catalog: {} as never });

    expect(report.refreshed).toBe(false);
    expect(report.cache.path).toContain("models.json");
    expect(report.models).toEqual([{
      providerId: "localai",
      modelId: "local-model",
      name: "Local Model",
      available: true,
      status: "beta",
      releaseDate: "2026-05-10",
      limit: undefined,
      cost: undefined,
      modalities: undefined,
    }]);
  });
});
