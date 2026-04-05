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

export type ChatProvider = {
  readonly providerId: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
};
