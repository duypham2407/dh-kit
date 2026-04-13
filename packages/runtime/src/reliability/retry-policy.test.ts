import { describe, expect, it } from "vitest";
import { computeRetryDelay, isRetryable } from "./retry-policy.js";

describe("retry-policy", () => {
  it("classifies retryable transient errors", () => {
    expect(
      isRetryable({
        kind: "transient",
        message: "temporary",
        providerId: "openai",
        statusCode: 500,
      }),
    ).toBe(true);
  });

  it("classifies overflow and semantic errors as no-retry", () => {
    expect(
      isRetryable({
        kind: "overflow",
        message: "context too long",
        providerId: "openai",
      }),
    ).toBe(false);
    expect(
      isRetryable({
        kind: "semantic",
        message: "bad request",
        providerId: "openai",
        statusCode: 400,
      }),
    ).toBe(false);
  });

  it("uses retry-after-ms when present", () => {
    expect(computeRetryDelay(1, { retryAfterMs: 1500 })).toBe(1500);
  });

  it("uses retry-after seconds and date headers", () => {
    expect(computeRetryDelay(1, { retryAfter: "2" })).toBe(2000);
    const now = Date.UTC(2026, 3, 11, 0, 0, 0);
    const future = new Date(now + 3000).toUTCString();
    expect(computeRetryDelay(1, { retryAfter: future, nowMs: now })).toBe(3000);
  });

  it("falls back to exponential backoff when no header", () => {
    expect(computeRetryDelay(1)).toBe(500);
    expect(computeRetryDelay(2)).toBe(1000);
    expect(computeRetryDelay(5)).toBe(8000);
  });
});
