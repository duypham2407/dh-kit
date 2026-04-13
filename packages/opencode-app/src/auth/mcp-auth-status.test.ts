import { describe, expect, it } from "vitest";
import { getMcpRuntimeSnapshot } from "./mcp-auth-status.js";

describe("getMcpRuntimeSnapshot", () => {
  it("returns lifecycle metadata for fresh status", () => {
    const now = new Date("2026-04-12T10:00:00.000Z");
    const snapshot = getMcpRuntimeSnapshot({
      statusByMcp: { playwright: "available" },
      serverIdentityByMcp: { playwright: "server-a" },
      authReadyByServerKey: { "playwright::server-a": true },
      observedAtByMcp: { playwright: "2026-04-12T09:59:40.000Z" },
      freshnessWindowMs: 60_000,
      now,
    });

    expect(snapshot?.playwright.status).toBe("available");
    expect(snapshot?.playwright.serverKey).toBe("playwright::server-a");
    expect(snapshot?.playwright.authReady).toBe(true);
    expect(snapshot?.playwright.stale).toBe(false);
    expect(snapshot?.playwright.transitionReason).toBe("status_observed");
    expect(snapshot?.playwright.signalMissing).toBe(false);
  });

  it("marks stale runtime status", () => {
    const now = new Date("2026-04-12T10:10:00.000Z");
    const snapshot = getMcpRuntimeSnapshot({
      statusByMcp: { playwright: "available" },
      observedAtByMcp: { playwright: "2026-04-12T10:00:00.000Z" },
      freshnessWindowMs: 60_000,
      now,
    });

    expect(snapshot?.playwright.stale).toBe(true);
    expect(snapshot?.playwright.transitionReason).toBe("status_stale");
  });

  it("uses previous snapshot and marks missing signal fail-safe", () => {
    const now = new Date("2026-04-12T10:00:00.000Z");
    const snapshot = getMcpRuntimeSnapshot({
      serverIdentityByMcp: { playwright: "server-a" },
      previousSnapshot: {
        playwright: {
          status: "available",
          serverKey: "playwright::server-a",
        },
      },
      now,
    });

    expect(snapshot?.playwright.status).toBe("available");
    expect(snapshot?.playwright.signalMissing).toBe(true);
    expect(snapshot?.playwright.transitionReason).toBe("missing_runtime_signal");
  });

  it("captures transition reason when status changes", () => {
    const snapshot = getMcpRuntimeSnapshot({
      statusByMcp: { playwright: "needs_auth" },
      previousSnapshot: {
        playwright: {
          status: "available",
        },
      },
    });

    expect(snapshot?.playwright.transitionFrom).toBe("available");
    expect(snapshot?.playwright.transitionReason).toBe("status_transition:available->needs_auth");
  });
});
