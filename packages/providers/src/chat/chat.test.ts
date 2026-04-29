import { describe, it, expect } from "vitest";
import { createMockChatProvider } from "./mock-chat.js";
import { createChatProvider } from "./create-chat-provider.js";
import type { ChatRequest } from "./types.js";
import { createRetryingChatProvider } from "../../../runtime/src/reliability/retrying-chat-provider.js";
import { createChatProviderError } from "./types.js";
import { vi } from "vitest";

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
    const openai = await createChatProvider("", {
      providerId: "openai",
      modelId: "gpt-4o",
      variantId: "default",
    });
    expect(openai.providerId).toBe("openai");

    const anthropic = await createChatProvider("", {
      providerId: "anthropic",
      modelId: "claude-opus",
      variantId: "default",
    });
    expect(anthropic.providerId).toBe("anthropic");
  });

  it("creates provider even for unknown providerId", async () => {
    const provider = await createChatProvider("", {
      providerId: "unknown-provider",
      modelId: "x",
      variantId: "y",
    });
    expect(provider.providerId).toBe("unknown-provider");
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
