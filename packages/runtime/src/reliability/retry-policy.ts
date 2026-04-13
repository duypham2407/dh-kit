import type { ChatProviderError } from "../../../providers/src/chat/types.js";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 8_000;

export function isRetryable(error: unknown): boolean {
  const chatError = asChatProviderError(error);
  if (!chatError) {
    return false;
  }

  if (chatError.retryable === true) {
    return true;
  }

  if (chatError.kind === "semantic" || chatError.kind === "overflow") {
    return false;
  }

  if (chatError.statusCode === undefined) {
    return chatError.kind === "network" || chatError.kind === "rate_limit" || chatError.kind === "transient";
  }

  return chatError.statusCode === 408
    || chatError.statusCode === 409
    || chatError.statusCode === 425
    || chatError.statusCode === 429
    || (chatError.statusCode >= 500 && chatError.statusCode <= 599);
}

export function computeRetryDelay(
  attempt: number,
  metadata?: {
    retryAfterMs?: number;
    retryAfter?: string;
    nowMs?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
  },
): number {
  const baseDelayMs = metadata?.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const maxDelayMs = metadata?.maxDelayMs ?? DEFAULT_MAX_DELAY_MS;

  if (typeof metadata?.retryAfterMs === "number" && Number.isFinite(metadata.retryAfterMs) && metadata.retryAfterMs > 0) {
    return Math.min(Math.floor(metadata.retryAfterMs), maxDelayMs);
  }

  if (metadata?.retryAfter) {
    const parsed = parseRetryAfter(metadata.retryAfter, metadata.nowMs);
    if (parsed !== undefined) {
      return Math.min(parsed, maxDelayMs);
    }
  }

  const safeAttempt = Math.max(1, attempt);
  const exp = baseDelayMs * Math.pow(2, safeAttempt - 1);
  return Math.min(exp, maxDelayMs);
}

export function defaultMaxRetries(): number {
  return DEFAULT_MAX_RETRIES;
}

export function extractRetryHints(error: unknown): { retryAfterMs?: number; retryAfter?: string } {
  const chatError = asChatProviderError(error);
  if (!chatError) {
    return {};
  }
  return {
    retryAfterMs: chatError.retryAfterMs,
    retryAfter: chatError.retryAfter,
  };
}

function parseRetryAfter(value: string, nowMs = Date.now()): number | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.floor(asSeconds * 1000);
  }

  const asDate = Date.parse(trimmed);
  if (Number.isNaN(asDate)) {
    return undefined;
  }

  return Math.max(0, asDate - nowMs);
}

function asChatProviderError(error: unknown): ChatProviderError | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const kind = (error as { kind?: unknown }).kind;
  const message = (error as { message?: unknown }).message;
  if (typeof kind !== "string" || typeof message !== "string") {
    return undefined;
  }
  return error as ChatProviderError;
}
