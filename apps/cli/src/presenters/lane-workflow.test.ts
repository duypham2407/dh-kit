import { describe, expect, it } from "vitest";
import { renderLaneWorkflowJson, renderLaneWorkflowText } from "./lane-workflow.js";
import type { LaneWorkflowReport } from "../../../../packages/opencode-app/src/workflows/run-lane-command.js";

function makeReport(overrides?: Partial<LaneWorkflowReport>): LaneWorkflowReport {
  return {
    exitCode: 0,
    lane: "delivery",
    sessionId: "sess-1",
    stage: "delivery_execute",
    agent: "Coordinator",
    model: "openai/gpt-5/default",
    objective: "ship feature",
    workflowSummary: ["ok"],
    runtimeAuthority: "rust",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

describe("lane workflow presenters", () => {
  it("renders text output for successful report", () => {
    const text = renderLaneWorkflowText(makeReport());
    expect(text).toContain("lane: delivery");
    expect(text).toContain("session: sess-1");
  });

  it("renders runtime authority metadata for lane workflows", () => {
    const text = renderLaneWorkflowText(makeReport({
      lane: "quick",
      sessionId: "session-1",
      stage: "quick_execute",
      agent: "Quick Agent",
      objective: "inspect",
      workflowSummary: ["done"],
      runtimeAuthority: "rust",
      finalStatus: "clean_success",
      degradedReason: null,
    }));

    expect(text).toContain("runtime authority: rust");
    expect(text).toContain("final status: clean_success");
    expect(text).not.toContain("degraded reason:");
  });

  it("renders text output for failure report", () => {
    const text = renderLaneWorkflowText(makeReport({ exitCode: 1, workflowSummary: ["bad input"] }));
    expect(text).toBe("bad input");
  });

  it("renders json payload", () => {
    const json = renderLaneWorkflowJson(makeReport());
    const parsed = JSON.parse(json) as LaneWorkflowReport;
    expect(parsed.lane).toBe("delivery");
    expect(parsed.model).toContain("gpt-5");
  });
});
