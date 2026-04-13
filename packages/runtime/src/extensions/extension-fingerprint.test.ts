import { describe, expect, it } from "vitest";
import type { ExtensionSpec } from "../../../opencode-sdk/src/index.js";
import { deriveExtensionFingerprint, toExtensionFingerprintPayload } from "./extension-fingerprint.js";

function makeSpec(overrides?: Partial<ExtensionSpec>): ExtensionSpec {
  return {
    id: "augment_context_engine",
    contractVersion: "v1",
    entry: "tool:augment_context_engine",
    capabilities: ["code_search", "impact_analysis", "traceability"],
    priority: 100,
    lanes: ["quick", "delivery", "migration"],
    roles: ["quick", "analyst", "architect", "implementer", "reviewer"],
    ...overrides,
  };
}

describe("extension fingerprint", () => {
  it("normalizes array ordering deterministically", () => {
    const first = makeSpec({
      capabilities: ["b", "a", "b"],
      lanes: ["migration", "quick"],
      roles: ["reviewer", "analyst", "reviewer"],
    });
    const second = makeSpec({
      capabilities: ["a", "b"],
      lanes: ["quick", "migration"],
      roles: ["analyst", "reviewer"],
    });

    expect(toExtensionFingerprintPayload(first)).toEqual(toExtensionFingerprintPayload(second));
    expect(deriveExtensionFingerprint(first)).toBe(deriveExtensionFingerprint(second));
  });

  it("changes fingerprint when stable contract field changes", () => {
    const base = makeSpec();
    const changed = makeSpec({ entry: "tool:augment_context_engine_v2" });

    expect(deriveExtensionFingerprint(base)).not.toBe(deriveExtensionFingerprint(changed));
  });
});
