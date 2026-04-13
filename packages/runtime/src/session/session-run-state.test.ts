import { describe, expect, it } from "vitest";
import {
  __resetSessionRunStateForTests,
  assertNotBusy,
  cancel,
  getRunEntry,
  isCancelRequested,
  markBusy,
  markIdle,
  SessionBusyError,
  withSessionRunGuard,
} from "./session-run-state.js";
import { afterEach } from "vitest";

afterEach(() => {
  __resetSessionRunStateForTests();
});

describe("session-run-state", () => {
  it("blocks concurrent runs for the same session", () => {
    const sessionId = `sess-busy-${Date.now()}`;
    markBusy(sessionId);
    expect(() => assertNotBusy(sessionId)).toThrowError(SessionBusyError);
    markIdle(sessionId);
    expect(() => assertNotBusy(sessionId)).not.toThrow();
  });

  it("marks cancel and clears busy state after guard exits", async () => {
    const sessionId = `sess-cancel-${Date.now()}`;
    await withSessionRunGuard(sessionId, async () => {
      expect(cancel(sessionId, "test-cancel")).toBe(true);
      expect(isCancelRequested(sessionId)).toBe(true);
      const entry = getRunEntry(sessionId);
      expect(entry?.cancelReason).toBe("test-cancel");
    });
    expect(getRunEntry(sessionId)).toBeUndefined();
  });

  it("auto-cleans up busy state when guarded function throws", async () => {
    const sessionId = `sess-throw-${Date.now()}`;
    await expect(
      withSessionRunGuard(sessionId, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect(() => assertNotBusy(sessionId)).not.toThrow();
  });
});
