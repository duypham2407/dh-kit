/**
 * OpenAI chat completion provider — uses fetch directly, no SDK dependency.
 */

import type { ChatProvider, ChatRequest, ChatResponse, ChatMessage } from "./types.js";

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

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI API error ${response.status}: ${text}`);
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
