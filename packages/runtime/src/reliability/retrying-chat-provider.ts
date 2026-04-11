import type { ChatProvider, ChatRequest, ChatResponse } from "../../../providers/src/chat/types.js";
import { computeRetryDelay, defaultMaxRetries, extractRetryHints, isRetryable } from "./retry-policy.js";

export type RetryAuditSink = {
  onRetryAttempt?: (input: {
    providerId: string;
    attempt: number;
    delayMs: number;
    errorMessage: string;
  }) => void | Promise<void>;
  onRetryGiveUp?: (input: {
    providerId: string;
    attempt: number;
    errorMessage: string;
  }) => void | Promise<void>;
};

export function createRetryingChatProvider(
  base: ChatProvider,
  options?: {
    maxRetries?: number;
    sleep?: (ms: number) => Promise<void>;
    audit?: RetryAuditSink;
  },
): ChatProvider {
  const maxRetries = options?.maxRetries ?? defaultMaxRetries();
  const sleep = options?.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  return {
    providerId: `${base.providerId}:retry`,
    async chat(request: ChatRequest): Promise<ChatResponse> {
      let attempt = 0;
      while (true) {
        attempt += 1;
        try {
          return await base.chat(request);
        } catch (error) {
          const shouldRetry = isRetryable(error) && attempt <= maxRetries;
          if (!shouldRetry) {
            if (options?.audit?.onRetryGiveUp) {
              await options.audit.onRetryGiveUp({
                providerId: base.providerId,
                attempt,
                errorMessage: error instanceof Error ? error.message : String(error),
              });
            }
            throw error;
          }

          const hints = extractRetryHints(error);
          const delayMs = computeRetryDelay(attempt, hints);
          if (options?.audit?.onRetryAttempt) {
            await options.audit.onRetryAttempt({
              providerId: base.providerId,
              attempt,
              delayMs,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          }
          await sleep(delayMs);
        }
      }
    },
  };
}
