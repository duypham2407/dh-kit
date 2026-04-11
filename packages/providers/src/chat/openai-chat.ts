/**
 * OpenAI chat completion provider — uses fetch directly, no SDK dependency.
 */

import {
  createChatProviderError,
  type ChatProvider,
  type ChatRequest,
  type ChatResponse,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export type OpenAIChatConfig = {
  apiKeyEnvVar?: string;
  baseUrl?: string;
};

export function createOpenAIChatProvider(config?: OpenAIChatConfig): ChatProvider {
  const apiKeyEnvVar = config?.apiKeyEnvVar ?? "OPENAI_API_KEY";
  const baseUrl = config?.baseUrl ?? DEFAULT_BASE_URL;

  return {
    providerId: "openai",

    async chat(request: ChatRequest): Promise<ChatResponse> {
      const apiKey = process.env[apiKeyEnvVar];
      if (!apiKey) {
        throw new Error(`Missing API key: set ${apiKeyEnvVar} in your environment.`);
      }

      const body: Record<string, unknown> = {
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      };

      if (request.maxTokens !== undefined) body.max_tokens = request.maxTokens;
      if (request.temperature !== undefined) body.temperature = request.temperature;
      if (request.responseFormat) body.response_format = request.responseFormat;

      let response: Response;
      try {
        response = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
        });
      } catch (error) {
        throw createChatProviderError({
          message: `OpenAI network error: ${(error as Error).message}`,
          providerId: "openai",
          kind: "network",
          retryable: true,
        });
      }

      if (!response.ok) {
        const text = await response.text();
        const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after-ms"));
        const retryAfter = response.headers.get("retry-after") ?? undefined;
        const kind = classifyOpenAiError(response.status, text);
        throw createChatProviderError({
          message: `OpenAI API error ${response.status}: ${text}`,
          providerId: "openai",
          statusCode: response.status,
          kind,
          retryable: kind === "rate_limit" || kind === "transient",
          retryAfterMs,
          retryAfter,
        });
      }

      const json = (await response.json()) as {
        choices: Array<{
          message: { role: string; content: string | null };
          finish_reason: string;
        }>;
        model: string;
        usage: {
          prompt_tokens: number;
          completion_tokens: number;
          total_tokens: number;
        };
      };

      const choice = json.choices[0];
      if (!choice) {
        throw new Error("OpenAI returned no choices.");
      }

      return {
        content: choice.message.content ?? "",
        model: json.model,
        finishReason: normalizeFinishReason(choice.finish_reason),
        usage: {
          promptTokens: json.usage.prompt_tokens,
          completionTokens: json.usage.completion_tokens,
          totalTokens: json.usage.total_tokens,
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

function classifyOpenAiError(status: number, text: string): "rate_limit" | "transient" | "semantic" | "auth" | "overflow" | "unknown" {
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
  if (message.includes("maximum context length") || message.includes("context_length_exceeded")) {
    return "overflow";
  }
  if (status >= 400 && status < 500) {
    return "semantic";
  }
  return "unknown";
}

function normalizeFinishReason(
  reason: string,
): ChatResponse["finishReason"] {
  switch (reason) {
    case "stop":
      return "stop";
    case "length":
      return "length";
    case "content_filter":
      return "content_filter";
    case "tool_calls":
      return "tool_calls";
    default:
      return "unknown";
  }
}
