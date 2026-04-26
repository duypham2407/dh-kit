import { describe, expect, it } from "vitest";
import { createRuntimeClient } from "./runtime-client.js";

describe("createRuntimeClient", () => {
  it("exposes lane, knowledge, doctor, index, and maintenance runners", () => {
    const client = createRuntimeClient();
    expect(typeof client.runLane).toBe("function");
    expect(typeof client.runKnowledge).toBe("function");
    expect(typeof client.runDoctor).toBe("function");
    expect(typeof client.runIndex).toBe("function");
    expect(typeof client.listOperatorSafeMaintenance).toBe("function");
    expect(typeof client.inspectOperatorSafeMaintenance).toBe("function");
    expect(typeof client.pruneOperatorSafeMaintenance).toBe("function");
    expect(typeof client.cleanupOperatorSafeMaintenance).toBe("function");
  });
});
