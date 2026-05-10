/**
 * Chat provider factory — creates the appropriate ChatProvider based on
 * the resolved model selection (provider ID).
 */

import type { ResolvedModelSelection } from "../../../shared/src/types/model.js";
import type { ChatProvider, ChatProviderError, ChatRequest, ChatResponse } from "./types.js";
import { createChatProviderError } from "./types.js";
import { generateText, streamText } from "ai";
import { loadProviderRuntimeConfig, type ProviderRuntimeConfig } from "../config/provider-config-loader.js";
import { redactProviderSecrets, resolveProviderCredential } from "../auth/provider-auth-service.js";
import { loadBundledProviderSdk } from "../provider/provider.js";

type RuntimeModelConfig = {
  id?: string;
  name?: string;
  api?: { npm?: string; url?: string; id?: string };
  provider?: { npm?: string; api?: string };
};

type CreateChatProviderModelFactoryInput = {
  runtime: ProviderRuntimeConfig;
  apiKey: string;
};

type CreateChatProviderDeps = {
  generateText?: typeof generateText;
  streamText?: typeof streamText;
  modelFactory?: (
    repoRoot: string,
    selection: ResolvedModelSelection,
    input: CreateChatProviderModelFactoryInput,
  ) => Promise<any> | any;
};

/**
 * Create a ChatProvider for the given model selection.
 *
 * This is a compatibility wrapper during the migration to Vercel AI SDK.
 */
export async function createChatProvider(
  repoRoot: string,
  selection: ResolvedModelSelection,
  deps: CreateChatProviderDeps = {},
): Promise<ChatProvider> {
  const generate = deps.generateText ?? generateText;
  const stream = deps.streamText ?? streamText;
  const model = await createRuntimeModel(repoRoot, selection, deps);

  return {
    providerId: selection.providerId,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      const response = await generate({
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
      const response = stream({
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

async function createRuntimeModel(
  repoRoot: string,
  selection: ResolvedModelSelection,
  deps: CreateChatProviderDeps,
): Promise<any> {
  try {
    const runtime = await loadProviderRuntimeConfig(repoRoot, selection.providerId);
    const credential = resolveProviderCredential(repoRoot, {
      providerId: selection.providerId,
      env: runtime.env,
      configApiKey: runtime.options?.apiKey,
    });

    if (!credential.apiKey) {
      throw createChatProviderError({
        message: `Provider '${selection.providerId}' is missing credentials.`,
        providerId: selection.providerId,
        kind: "auth",
        retryable: false,
      });
    }

    if (deps.modelFactory) return deps.modelFactory(repoRoot, selection, { runtime, apiKey: credential.apiKey });
    return createSdkLanguageModel(runtime, selection, credential.apiKey);
  } catch (error) {
    if (isChatProviderError(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw createChatProviderError({
      message: String(redactProviderSecrets(message)),
      providerId: selection.providerId,
      kind: "unknown",
      retryable: false,
    });
  }
}

async function createSdkLanguageModel(
  runtime: ProviderRuntimeConfig,
  selection: ResolvedModelSelection,
  apiKey: string,
): Promise<any> {
  const modelConfig = runtime.models[selection.modelId] as RuntimeModelConfig | undefined;
  if (!modelConfig) {
    throw new Error(`Model '${selection.modelId}' is not configured for provider '${selection.providerId}'.`);
  }

  const npm = modelConfig.api?.npm ?? modelConfig.provider?.npm ?? runtime.npm ?? "@ai-sdk/openai-compatible";
  const sdkCreator = await loadBundledProviderSdk(npm);
  const baseURL = runtime.options?.baseURL ?? modelConfig.api?.url ?? runtime.api;
  const options: Record<string, unknown> = {
    ...(runtime.options ?? {}),
    apiKey,
  };
  if (baseURL) options.baseURL = baseURL;
  if (npm === "@ai-sdk/openai-compatible" && !options.name) {
    options.name = runtime.name ?? selection.providerId;
  }

  const sdk = sdkCreator(options);
  const runtimeModelId = modelConfig.api?.id ?? modelConfig.provider?.api ?? modelConfig.id ?? selection.modelId;
  return sdk.languageModel(runtimeModelId);
}

function isChatProviderError(error: unknown): error is ChatProviderError {
  return Boolean(
    error &&
    typeof error === "object" &&
    "kind" in error &&
    "providerId" in error
  );
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
