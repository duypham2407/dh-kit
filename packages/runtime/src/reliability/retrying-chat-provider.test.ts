import { describe, expect, it, vi } from "vitest";
import { createRetryingChatProvider } from "./retrying-chat-provider.js";
import { createChatProviderError, type ChatProvider } from "../../../providers/src/chat/types.js";

describe("retrying-chat-provider", () => {
  it("retries transient failures and then succeeds", async () => {
    let calls = 0;
    const base: ChatProvider = {
      providerId: "test-provider",
      async chat() {
        calls += 1;
        if (calls < 3) {
          throw createChatProviderError({
            message: "temporary",
            providerId: "test-provider",
            kind: "transient",
            statusCode: 500,
            retryAfterMs: 1,
          });
        }
        return {
          content: "ok",
          model: "mock",
          finishReason: "stop",
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
          },
        };
      },
    };

    const sleep = vi.fn(async () => {});
    const wrapped = createRetryingChatProvider(base, { sleep, maxRetries: 3 })!;
    const response = await wrapped.chat({ messages: [{ role: "user", content: "hi" }], model: "mock" });

    expect(response.content).toBe("ok");
    expect(calls).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("does not retry no-retry errors", async () => {
    const base: ChatProvider = {
      providerId: "test-provider",
      async chat() {
        throw createChatProviderError({
          message: "context overflow",
          providerId: "test-provider",
          kind: "overflow",
          statusCode: 400,
          retryable: false,
        });
      },
    };

    const sleep = vi.fn(async () => {});
    const wrapped = createRetryingChatProvider(base, { sleep, maxRetries: 3 })!;
    await expect(wrapped.chat({ messages: [{ role: "user", content: "hi" }], model: "mock" })).rejects.toThrow("context overflow");
    expect(sleep).not.toHaveBeenCalled();
  });

  it("emits retry attempt audit events with the base provider id", async () => {
    let calls = 0;
    const base: ChatProvider = {
      providerId: "audited-provider",
      async chat() {
        calls += 1;
        if (calls === 1) {
          throw createChatProviderError({
            message: "rate limited",
            providerId: "audited-provider",
            kind: "rate_limit",
            statusCode: 429,
            retryAfterMs: 1,
          });
        }
        return {
          content: "ok",
          model: "mock",
          finishReason: "stop",
          usage: {
            promptTokens: 1,
            completionTokens: 1,
            totalTokens: 2,
          },
        };
      },
    };

    const onRetryAttempt = vi.fn(async () => {});
    const onRetryGiveUp = vi.fn(async () => {});
    const wrapped = createRetryingChatProvider(base, {
      sleep: vi.fn(async () => {}),
      maxRetries: 2,
      audit: { onRetryAttempt, onRetryGiveUp },
    })!;

    await expect(wrapped.chat({ messages: [{ role: "user", content: "hi" }], model: "mock" })).resolves.toMatchObject({ content: "ok" });
    expect(wrapped.providerId).toBe("audited-provider:retry");
    expect(onRetryAttempt).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "audited-provider",
      attempt: 1,
      errorMessage: "rate limited",
    }));
    expect(onRetryGiveUp).not.toHaveBeenCalled();
  });

  it("emits retry give-up audit events when retry budget is exhausted", async () => {
    const base: ChatProvider = {
      providerId: "exhausted-provider",
      async chat() {
        throw createChatProviderError({
          message: "still unavailable",
          providerId: "exhausted-provider",
          kind: "transient",
          statusCode: 503,
          retryAfterMs: 1,
        });
      },
    };

    const onRetryAttempt = vi.fn(async () => {});
    const onRetryGiveUp = vi.fn(async () => {});
    const wrapped = createRetryingChatProvider(base, {
      sleep: vi.fn(async () => {}),
      maxRetries: 1,
      audit: { onRetryAttempt, onRetryGiveUp },
    })!;

    await expect(wrapped.chat({ messages: [{ role: "user", content: "hi" }], model: "mock" })).rejects.toThrow("still unavailable");
    expect(onRetryAttempt).toHaveBeenCalledTimes(1);
    expect(onRetryGiveUp).toHaveBeenCalledWith(expect.objectContaining({
      providerId: "exhausted-provider",
      attempt: 2,
      errorMessage: "still unavailable",
    }));
  });
});
