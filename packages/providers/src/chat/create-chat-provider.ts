/**
 * Chat provider factory — creates the appropriate ChatProvider based on
 * the resolved model selection (provider ID).
 */

import type { ResolvedModelSelection } from "../../../shared/src/types/model.js";
import type { ChatProvider, ChatRequest, ChatResponse } from "./types.js";
import { generateText, streamText } from "ai";
import { Effect } from "effect";
import { Provider } from "../provider/index.js";
import type { ProviderID, ModelID } from "../schema.js";

/**
 * Create a ChatProvider for the given model selection.
 *
 * This is a compatibility wrapper during the migration to Vercel AI SDK.
 */
export async function createChatProvider(
  repoRoot: string,
  selection: ResolvedModelSelection
): Promise<ChatProvider> {
  const model = await Effect.runPromise(
    Effect.provide(
      Effect.gen(function* () {
        const service = yield* Provider.Service;
        const modelDef = yield* service.getModel(selection.providerId as ProviderID, selection.modelId as ModelID);
        return yield* service.getLanguage(modelDef);
      }),
      Provider.layer
    )
  );

  return {
    providerId: selection.providerId,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const response = await generateText({
        model,
        messages: request.messages.map((m) => ({
          role: m.role as "user" | "system" | "assistant",
          content: m.content,
        })),
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      });

      return {
        content: response.text,
        model: request.model,
        finishReason: mapFinishReason(response.finishReason),
        usage: {
          promptTokens: response.usage.inputTokens ?? 0,
          completionTokens: response.usage.outputTokens ?? 0,
          totalTokens: response.usage.totalTokens ?? 0,
        },
      };
    },

    async chatStream(request: ChatRequest, onChunk: (chunk: string) => void): Promise<ChatResponse> {
      const response = streamText({
        model,
        messages: request.messages.map((m) => ({
          role: m.role as "user" | "system" | "assistant",
          content: m.content,
        })),
        maxOutputTokens: request.maxTokens,
        temperature: request.temperature,
      });

      for await (const chunk of response.textStream) {
        onChunk(chunk);
      }

      const text = await response.text;
      const usage = await response.usage;
      const finishReason = await response.finishReason;

      return {
        content: text,
        model: request.model,
        finishReason: mapFinishReason(finishReason),
        usage: {
          promptTokens: usage.inputTokens ?? 0,
          completionTokens: usage.outputTokens ?? 0,
          totalTokens: usage.totalTokens ?? 0,
        },
      };
    }
  };
}

function mapFinishReason(reason: string): "stop" | "length" | "content_filter" | "tool_calls" | "unknown" {
  switch (reason) {
    case "stop":
    case "length":
    case "content-filter":
    case "tool-calls":
    case "unknown":
      if (reason === "content-filter") return "content_filter";
      if (reason === "tool-calls") return "tool_calls";
      return reason as "stop" | "length" | "unknown";
    default:
      return "unknown";
  }
}

