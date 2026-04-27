/**
 * Chat completion provider abstraction.
 *
 * Every provider (OpenAI, Anthropic, mock) implements the same ChatProvider
 * interface. This keeps the team agent layer provider-agnostic.
 */

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatRequest = {
  messages: ChatMessage[];
  model: string;
  /** Max tokens to generate. Defaults to provider-specific limit. */
  maxTokens?: number;
  /** Temperature 0–2. */
  temperature?: number;
  /** Optional JSON schema to request structured output. */
  responseFormat?: { type: "json_object" } | { type: "text" };
};

export type ChatResponse = {
  content: string;
  model: string;
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | "unknown";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
};

export type ChatProviderErrorKind =
  | "network"
  | "rate_limit"
  | "transient"
  | "overflow"
  | "semantic"
  | "auth"
  | "unknown";

export type ChatProviderError = Error & {
  kind: ChatProviderErrorKind;
  providerId: string;
  retryable?: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  retryAfter?: string;
};

export function createChatProviderError(input: {
  message: string;
  providerId: string;
  kind: ChatProviderErrorKind;
  retryable?: boolean;
  statusCode?: number;
  retryAfterMs?: number;
  retryAfter?: string;
}): ChatProviderError {
  const error = new Error(input.message) as ChatProviderError;
  error.kind = input.kind;
  error.providerId = input.providerId;
  error.retryable = input.retryable;
  error.statusCode = input.statusCode;
  error.retryAfterMs = input.retryAfterMs;
  error.retryAfter = input.retryAfter;
  return error;
}

export type ChatProvider = {
  readonly providerId: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
  chatStream?(request: ChatRequest, onChunk: (chunk: string) => void): Promise<ChatResponse>;
};
