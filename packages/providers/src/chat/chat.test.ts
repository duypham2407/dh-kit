import { describe, it, expect } from "vitest";
import { createMockChatProvider } from "./mock-chat.js";
import { createChatProvider } from "./create-chat-provider.js";
import type { ChatRequest } from "./types.js";

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
  it("falls back to mock when no API keys are set", () => {
    const original = {
      openai: process.env.OPENAI_API_KEY,
      anthropic: process.env.ANTHROPIC_API_KEY,
    };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    const openai = createChatProvider({
      providerId: "openai",
      modelId: "gpt-4o",
      variantId: "default",
    });
    expect(openai.providerId).toBe("mock");

    const anthropic = createChatProvider({
      providerId: "anthropic",
      modelId: "claude-opus",
      variantId: "default",
    });
    expect(anthropic.providerId).toBe("mock");

    // Restore
    if (original.openai !== undefined) process.env.OPENAI_API_KEY = original.openai;
    if (original.anthropic !== undefined) process.env.ANTHROPIC_API_KEY = original.anthropic;
  });

  it("returns mock for unknown provider", () => {
    const provider = createChatProvider({
      providerId: "unknown-provider",
      modelId: "x",
      variantId: "y",
    });
    expect(provider.providerId).toBe("mock");
  });
});
