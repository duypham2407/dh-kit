/**
 * Mock chat provider for tests.
 *
 * Returns deterministic responses so unit tests can run without API keys.
 * Can be configured with a custom response generator for specific test scenarios.
 */

import type { ChatProvider, ChatRequest, ChatResponse } from "./types.js";

export type MockResponseFn = (request: ChatRequest) => string;

const DEFAULT_RESPONSE: MockResponseFn = (request) => {
  const lastUser = [...request.messages].reverse().find((m) => m.role === "user");
  return lastUser
    ? `Mock response to: ${lastUser.content.slice(0, 100)}`
    : "Mock response (no user message)";
};

export function createMockChatProvider(responseFn?: MockResponseFn): ChatProvider {
  const fn = responseFn ?? DEFAULT_RESPONSE;

  return {
    providerId: "mock",

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const content = fn(request);
      const promptTokens = request.messages.reduce(
        (sum, m) => sum + Math.ceil(m.content.length / 4),
        0,
      );
      const completionTokens = Math.ceil(content.length / 4);

      return {
        content,
        model: request.model,
        finishReason: "stop",
        usage: {
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
        },
      };
    },
  };
}
