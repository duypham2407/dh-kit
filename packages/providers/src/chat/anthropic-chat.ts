/**
 * Anthropic chat completion provider — uses fetch, no SDK dependency.
 *
 * Anthropic's Messages API differs from OpenAI:
 * - System messages go in a separate `system` field, not in `messages`.
 * - The response shape uses `content` blocks instead of `choices`.
 */

import {
  createChatProviderError,
  type ChatProvider,
  type ChatRequest,
  type ChatResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_API_VERSION = "2023-06-01";

export type AnthropicChatConfig = {
  apiKeyEnvVar?: string;
  baseUrl?: string;
  apiVersion?: string;
};

export function createAnthropicChatProvider(config?: AnthropicChatConfig): ChatProvider {
  const apiKeyEnvVar = config?.apiKeyEnvVar ?? "ANTHROPIC_API_KEY";
  const baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL;
  const apiVersion = config?.apiVersion ?? DEFAULT_API_VERSION;

  return {
    providerId: "anthropic",

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) {
        throw new Error(`Missing API key: set ${apiKeyEnvVar} in your environment.`);
      }

      // Separate system messages from user/assistant messages
      const systemMessages = request.messages.filter((m) => m.role === "system");
      const conversationMessages = request.messages.filter((m) => m.role !== "system");

      const body: Record<string, unknown> = {
        model: request.model,
        messages: conversationMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: request.maxTokens ?? 4096,
      };

      if (systemMessages.length > 0) {
        body.system = systemMessages.map((m) => m.content).join("\n\n");
      }

      if (request.temperature !== undefined) body.temperature = request.temperature;

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/messages`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": apiVersion,
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw createChatProviderError({
          message: `Anthropic network error: ${(error as Error).message}`,
          providerId: "anthropic",
          kind: "network",
          retryable: true,
        });
      }

      if (!response.ok) {
        const text = await response.text();
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after-ms"));
        const retryAfter = response.headers.get("retry-after") ?? undefined;
        const kind = classifyAnthropicError(response.status, text);
        throw createChatProviderError({
          message: `Anthropic API error ${response.status}: ${text}`,
          providerId: "anthropic",
          statusCode: response.status,
          kind,
          retryable: kind === "rate_limit" || kind === "transient",
          retryAfterMs,
          retryAfter,
        });
      }

      const json = (await response.json()) as {
        content: Array<{ type: string; text?: string }>;
        model: string;
        stop_reason: string | null;
        usage: {
          input_tokens: number;
          output_tokens: number;
        };
      };

      const textContent = json.content
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text!)
        .join("");

      return {
        content: textContent,
        model: json.model,
        finishReason: normalizeStopReason(json.stop_reason),
        usage: {
          promptTokens: json.usage.input_tokens,
          completionTokens: json.usage.output_tokens,
          totalTokens: json.usage.input_tokens + json.usage.output_tokens,
        },
      };
    },
  };
}

function parseRetryAfterMs(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function classifyAnthropicError(status: number, text: string): "rate_limit" | "transient" | "semantic" | "auth" | "overflow" | "unknown" {
  const message = text.toLowerCase();
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status >= 500) {
    return "transient";
  }
  if (message.includes("maximum context") || message.includes("context window")) {
    return "overflow";
  }
  if (status >= 400 && status < 500) {
    return "semantic";
  }
  return "unknown";
}

function normalizeStopReason(
  reason: string | null,
): ChatResponse["finishReason"] {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    default:
      return "unknown";
  }
}
