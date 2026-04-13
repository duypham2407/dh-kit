import { describe, expect, it } from "vitest";
import { compactSessionContext } from "./session-compaction.js";

describe("session-compaction", () => {
  it("does not compact small context", () => {
    const result = compactSessionContext({
      sessionId: "sess-1",
      workflowSummary: ["a", "b", "c"],
      runtimeEvents: [],
    });

    expect(result.overflow).toBe(false);
    expect(result.trimmedWorkflowSummary).toHaveLength(3);
  });

  it("compacts long context and keeps continuation summary", () => {
    const workflowSummary = Array.from({ length: 30 }, (_, i) => `line-${i}`);
    const result = compactSessionContext({
      sessionId: "sess-1",
      workflowSummary,
      runtimeEvents: [],
      maxSummaryEntries: 10,
    });

    expect(result.overflow).toBe(true);
    expect(result.trimmedWorkflowSummary.length).toBeLessThan(workflowSummary.length);
    expect(result.continuationSummary).toContain("Continuation summary");
  });

  it("caps runtime events used by heuristic to avoid age growth", () => {
    const workflowSummary = ["short", "still short"];
    const runtimeEvents = Array.from({ length: 1000 }, (_, i) => ({
      id: `ev-${i}`,
      sessionId: "sess-1",
      eventType: "retry" as const,
      eventJson: { idx: i, payload: "x".repeat(100) },
      createdAt: new Date().toISOString(),
    }));

    const sampled = compactSessionContext({
      sessionId: "sess-1",
      workflowSummary,
      runtimeEvents,
      maxRuntimeEventsInHeuristic: 8,
      maxSerializedBytes: 3_000,
    });

    const unsampled = compactSessionContext({
      sessionId: "sess-1",
      workflowSummary,
      runtimeEvents,
      maxRuntimeEventsInHeuristic: 1000,
      maxSerializedBytes: 3_000,
    });

    expect(sampled.overflow).toBe(false);
    expect(unsampled.overflow).toBe(true);
  });
});
