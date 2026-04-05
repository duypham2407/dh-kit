import { describe, expect, it } from "vitest";
import { buildHandoff } from "./handoff-manager.js";

describe("buildHandoff", () => {
  it("emits expected architect->implementer artifacts", () => {
    const handoff = buildHandoff({
      lane: "delivery",
      fromRole: "architect",
      toRole: "implementer",
      stage: "delivery_task_split",
    });

    expect(handoff.requiredArtifacts).toContain("solution_summary");
    expect(handoff.requiredArtifacts).toContain("work_items");
    expect(handoff.notes.join(" ")).toContain("Solution direction is approved");
  });

  it("falls back for unknown transitions", () => {
    const handoff = buildHandoff({
      lane: "quick",
      fromRole: "quick",
      toRole: "complete",
      stage: "quick_complete",
    });
    expect(handoff.requiredArtifacts).toEqual(["handoff_notes"]);
  });

  it("includes migration invariants for architect->implementer handoff", () => {
    const handoff = buildHandoff({
      lane: "migration",
      fromRole: "architect",
      toRole: "implementer",
      stage: "migration_upgrade",
    });

    expect(handoff.requiredArtifacts).toContain("migration_invariants");
  });

  it("includes preserve behavior evidence for migration reviewer->tester handoff", () => {
    const handoff = buildHandoff({
      lane: "migration",
      fromRole: "reviewer",
      toRole: "tester",
      stage: "migration_verify",
    });

    expect(handoff.requiredArtifacts).toContain("preserve_behavior_evidence");
    expect(handoff.notes.join(" ")).toContain("preserve-behavior invariants");
  });
});
