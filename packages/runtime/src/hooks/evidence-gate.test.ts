import { describe, expect, it } from "vitest";
import { evaluateEvidence } from "./evidence-gate.js";

describe("evaluateEvidence", () => {
  it("blocks structural question when required graph tools are missing", () => {
    const decision = evaluateEvidence({
      userIntentText: "Who calls function alpha?",
      toolsUsed: ["grep"],
      evidenceScore: 0.9,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Missing structural graph-tool evidence");
  });

  it("blocks when evidence score is low", () => {
    const decision = evaluateEvidence({
      userIntentText: "What does file a.ts depend on?",
      toolsUsed: ["dh.find-dependencies"],
      evidenceScore: 0.2,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("below threshold");
  });

  it("allows when required tools and score are sufficient", () => {
    const decision = evaluateEvidence({
      userIntentText: "Show references of symbol X",
      toolsUsed: ["dh.find-references"],
      evidenceScore: 0.8,
    });
    expect(decision.allowed).toBe(true);
  });
});
