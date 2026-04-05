import { describe, expect, it } from "vitest";
import { createRuntimeClient } from "./runtime-client.js";

describe("createRuntimeClient", () => {
  it("exposes lane, knowledge, doctor, and index runners", () => {
    const client = createRuntimeClient();
    expect(typeof client.runLane).toBe("function");
    expect(typeof client.runKnowledge).toBe("function");
    expect(typeof client.runDoctor).toBe("function");
    expect(typeof client.runIndex).toBe("function");
  });
});
