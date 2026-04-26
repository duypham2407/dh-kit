import { describe, expect, it } from "vitest";
import * as bridgeRuntimeProbe from "./bridge-runtime-probe.js";

describe("bridge-runtime-probe RHBE scope boundary", () => {
  it("does not expose runtime/file/tool utility probe execution from diagnostics", () => {
    expect(bridgeRuntimeProbe).not.toHaveProperty("runBridgeFileUtilityProbes");
  });
});
