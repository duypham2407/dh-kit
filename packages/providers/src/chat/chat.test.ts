import { afterEach, describe, it, expect } from "vitest";
import { createMockChatProvider } from "./mock-chat.js";
import { createChatProvider } from "./create-chat-provider.js";
import type { ChatRequest } from "./types.js";
import { createRetryingChatProvider } from "../../../runtime/src/reliability/retrying-chat-provider.js";
import { createChatProviderError } from "./types.js";
import { vi } from "vitest";
import { ProviderAuthStore } from "../auth/provider-auth-store.js";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpRepos: string[] = [];

function makeTmpRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-chat-provider-"));
  fs.mkdirSync(path.join(repo, ".dh"), { recursive: true });
  tmpRepos.push(repo);
  return repo;
}

function writeProviderConfig(repo: string, providerId: string, modelId: string, npm = "@ai-sdk/openai") {
  const configPath = path.join(repo, "opencode.json");
  const current = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
  fs.writeFileSync(configPath, JSON.stringify({
    ...current,
    provider: {
      ...(current.provider ?? {}),
      [providerId]: {
        name: providerId,
        npm,
        env: [],
        models: { [modelId]: { name: modelId } },
      },
    },
  }));
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const repo of tmpRepos) {
    closeDhDatabase(repo);
    fs.rmSync(repo, { recursive: true, force: true });
  }
  tmpRepos.length = 0;
});

describe("createMockChatProvider", () => {
  it("returns deterministic response based on user message", async () => {
    const provider = createMockChatProvider();
    const request: ChatRequest = {
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "What is 2+2?" },
      ],
      model: "mock",
    };

    const r1 = await provider.chat(request);
    const r2 = await provider.chat(request);

    expect(r1.content).toBe(r2.content);
    expect(r1.content).toContain("What is 2+2?");
    expect(r1.finishReason).toBe("stop");
    expect(r1.usage.totalTokens).toBeGreaterThan(0);
  });

  it("accepts custom response function", async () => {
    const provider = createMockChatProvider(() => '{"answer": 42}');
    const response = await provider.chat({
      messages: [{ role: "user", content: "test" }],
      model: "mock",
    });

    expect(response.content).toBe('{"answer": 42}');
  });
});

describe("createChatProvider", () => {
  it("creates providers with correct providerId", async () => {
    const repo = makeTmpRepo();
    writeProviderConfig(repo, "openai", "gpt-4o");
    writeProviderConfig(repo, "anthropic", "claude-opus", "@ai-sdk/anthropic");
    new ProviderAuthStore(repo).save({ providerId: "openai", type: "api_key", apiKey: "sk-openai" });
    new ProviderAuthStore(repo).save({ providerId: "anthropic", type: "api_key", apiKey: "sk-anthropic" });

    const deps = { modelFactory: () => ({}) as never };
    const openai = await createChatProvider(repo, {
      providerId: "openai",
      modelId: "gpt-4o",
      variantId: "default",
    }, deps);
    expect(openai.providerId).toBe("openai");

    const anthropic = await createChatProvider(repo, {
      providerId: "anthropic",
      modelId: "claude-opus",
      variantId: "default",
    }, deps);
    expect(anthropic.providerId).toBe("anthropic");
  });

  it("creates provider for a custom configured provider", async () => {
    const repo = makeTmpRepo();
    writeProviderConfig(repo, "localai", "x", "@ai-sdk/openai-compatible");
    new ProviderAuthStore(repo).save({ providerId: "localai", type: "api_key", apiKey: "sk-local" });

    const provider = await createChatProvider(repo, {
      providerId: "localai",
      modelId: "x",
      variantId: "y",
    }, { modelFactory: () => ({}) as never });
    expect(provider.providerId).toBe("localai");
  });

  it("fails with auth error when a configured provider has no credential", async () => {
    const repo = makeTmpRepo();
    writeProviderConfig(repo, "openai", "gpt-test");
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    try {
      await expect(createChatProvider(repo, {
        providerId: "openai",
        modelId: "gpt-test",
        variantId: "default",
      })).rejects.toMatchObject({
        kind: "auth",
        providerId: "openai",
      });
    } finally {
      if (original === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = original;
      }
    }
  });

  it("injects resolved api key into provider runtime options without exposing it", async () => {
    const repo = makeTmpRepo();
    writeProviderConfig(repo, "openai", "gpt-test");
    new ProviderAuthStore(repo).save({ providerId: "openai", type: "api_key", apiKey: "sk-secret" });
    const original = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    let observedApiKey: string | undefined;

    try {
      const provider = await createChatProvider(repo, {
        providerId: "openai",
        modelId: "gpt-test",
        variantId: "default",
      }, {
        generateText: async () => ({
          text: "OK",
          finishReason: "stop",
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }) as never,
        modelFactory: (_repo, _selection, input?: { apiKey: string }) => {
          observedApiKey = input?.apiKey;
          return {} as never;
        },
      });

      const response = await provider.chat({ model: "openai/gpt-test", messages: [{ role: "user", content: "hi" }] });
      expect(response.content).toBe("OK");
      expect(observedApiKey).toBe("sk-secret");
    } finally {
      if (original === undefined) {
        delete process.env.OPENAI_API_KEY;
      } else {
        process.env.OPENAI_API_KEY = original;
      }
    }
  });

  it("supports retry wrapper with provider metadata", async () => {
    let calls = 0;
    const flaky = {
      providerId: "flaky",
      async chat() {
        calls += 1;
        if (calls === 1) {
          throw createChatProviderError({
            message: "retry me",
            providerId: "flaky",
            kind: "rate_limit",
            statusCode: 429,
            retryAfterMs: 1,
          });
        }
        return {
          content: "ok",
          model: "mock",
          finishReason: "stop" as const,
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
          },
        };
      },
    };

    const sleep = vi.fn(async () => {});
    const wrapped = createRetryingChatProvider(flaky, { sleep, maxRetries: 2 })!;
    const result = await wrapped.chat({
      messages: [{ role: "user", content: "hello" }],
      model: "mock",
    });

    expect(result.content).toBe("ok");
    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});
