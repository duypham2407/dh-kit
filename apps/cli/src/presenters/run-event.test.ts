import { describe, expect, it } from "vitest";
import type { RunDirectReport } from "../../../../packages/shared/src/types/run.js";
import { renderRunNdjson, renderRunText } from "./run-event.js";

function report(overrides: Partial<RunDirectReport> = {}): RunDirectReport {
  return {
    exitCode: 0,
    command: "run",
    sessionId: "session-run-1",
    model: "openai/gpt-5",
    agentId: "quick-agent",
    text: "hello world",
    events: [
      {
        type: "session.created",
        sessionId: "session-run-1",
        sequence: 1,
        timestamp: "2026-05-10T00:00:00.000Z",
        payload: { commandFamily: "run" },
      },
      {
        type: "text.delta",
        sessionId: "session-run-1",
        sequence: 2,
        timestamp: "2026-05-10T00:00:00.001Z",
        payload: { text: "hello world" },
      },
    ],
    files: [],
    runtimeAuthority: "rust",
    finalStatus: "clean_success",
    degradedReason: null,
    ...overrides,
  };
}

describe("run event presenters", () => {
  it("renders plain text with session and lifecycle metadata", () => {
    const text = renderRunText(report());
    expect(text).toContain("session: session-run-1");
    expect(text).toContain("model: openai/gpt-5");
    expect(text).toContain("hello world");
  });

  it("renders newline-delimited JSON events", () => {
    const ndjson = renderRunNdjson(report());
    const lines = ndjson.split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).type).toBe("session.created");
    expect(JSON.parse(lines[1]!).type).toBe("text.delta");
  });
});
