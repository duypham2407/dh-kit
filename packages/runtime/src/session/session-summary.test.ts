import { describe, expect, it } from "vitest";
import { summarizeWorkflowArtifacts } from "./session-summary.js";

describe("session-summary", () => {
  it("extracts summary stats from workflow summary lines", () => {
    const summary = summarizeWorkflowArtifacts({
      workflowSummary: [
        "files changed: 3",
        "additions: 10",
        "deletions: 2",
      ],
      stage: "delivery_execute",
    });

    expect(summary.filesChanged).toBe(3);
    expect(summary.additions).toBe(10);
    expect(summary.deletions).toBe(2);
    expect(summary.lastDiffAt).toBeDefined();
  });

  it("accumulates against previous summary", () => {
    const summary = summarizeWorkflowArtifacts({
      workflowSummary: ["additions: 4", "deletions: 1"],
      previous: {
        id: "s1",
        sessionId: "sess-1",
        filesChanged: 2,
        additions: 6,
        deletions: 3,
        updatedAt: new Date().toISOString(),
      },
      stage: "delivery_review",
    });

    expect(summary.filesChanged).toBe(2);
    expect(summary.additions).toBe(10);
    expect(summary.deletions).toBe(4);
  });
});
