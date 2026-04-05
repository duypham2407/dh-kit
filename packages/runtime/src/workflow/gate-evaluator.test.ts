import { describe, expect, it } from "vitest";
import { evaluateGate } from "./gate-evaluator.js";

describe("evaluateGate", () => {
  it("passes intake gate when objective exists", () => {
    const result = evaluateGate({
      workflow: { lane: "quick", stage: "quick_intake", stageStatus: "in_progress", gateStatus: "pending", blockers: [] },
      objective: "fix bug",
    });
    expect(result.pass).toBe(true);
    expect(result.gate).toBe("intake");
  });

  it("fails analysis gate when requirements are missing", () => {
    const result = evaluateGate({
      workflow: { lane: "delivery", stage: "delivery_analysis", stageStatus: "in_progress", gateStatus: "pending", blockers: [] },
      objective: "feature",
      evidence: { requirementsClear: true, acceptanceCriteriaDefined: false },
    });
    expect(result.pass).toBe(false);
    expect(result.gate).toBe("analysis");
  });

  it("passes verification gate when evidence exists", () => {
    const result = evaluateGate({
      workflow: { lane: "migration", stage: "migration_verify", stageStatus: "in_progress", gateStatus: "pending", blockers: [] },
      objective: "upgrade",
      evidence: { verificationEvidencePresent: true },
    });
    expect(result.pass).toBe(true);
    expect(result.gate).toBe("verification");
  });
});
