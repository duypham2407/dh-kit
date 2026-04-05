/**
 * Chat provider factory — creates the appropriate ChatProvider based on
 * the resolved model selection (provider ID).
 */

import type { ResolvedModelSelection } from "../../../shared/src/types/model.js";
import type { ChatProvider } from "./types.js";
import { createOpenAIChatProvider } from "./openai-chat.js";
import { createAnthropicChatProvider } from "./anthropic-chat.js";
import { createMockChatProvider } from "./mock-chat.js";

/**
 * Create a ChatProvider for the given model selection.
 *
 * Falls back to mock when the required API key is not set.
 */
export function createChatProvider(selection: ResolvedModelSelection): ChatProvider {
  switch (selection.providerId) {
    case "openai": {
      if (isKeyAvailable("OPENAI_API_KEY")) {
        return createOpenAIChatProvider();
      }
      return createMockChatProvider();
    }
    case "anthropic": {
      if (isKeyAvailable("ANTHROPIC_API_KEY")) {
        return createAnthropicChatProvider();
      }
      return createMockChatProvider();
    }
    default:
      return createMockChatProvider();
  }
}

function isKeyAvailable(envVar: string): boolean {
  const value = process.env[envVar];
  return typeof value === "string" && value.length > 0;
}
