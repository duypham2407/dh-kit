import { describe, expect, it } from "vitest";
import { planWorkItems } from "./work-item-planner.js";
import type { WorkItemState } from "../../../shared/src/types/work-item.js";

function makeItem(overrides: Partial<WorkItemState> & Pick<WorkItemState, "id">): WorkItemState {
  return {
    sessionId: "sess-1",
    lane: "delivery",
    title: overrides.id,
    description: overrides.id,
    ownerRole: "implementer",
    dependencies: [],
    parallelizable: false,
    status: "pending",
    targetAreas: [],
    acceptance: [],
    validationPlan: [],
    reviewStatus: "pending",
    testStatus: "pending",
    ...overrides,
  };
}

describe("planWorkItems", () => {
  it("separates ready and blocked items by dependency status", () => {
    const items = [
      makeItem({ id: "a", status: "done" }),
      makeItem({ id: "b", dependencies: ["a"] }),
      makeItem({ id: "c", dependencies: ["missing"] }),
    ];

    const plan = planWorkItems(items);
    expect(plan.ready.map((item) => item.id)).toEqual(["b"]);
    expect(plan.blocked.map((item) => item.id)).toEqual(["c"]);
  });

  it("groups parallelizable ready items together", () => {
    const items = [
      makeItem({ id: "a", parallelizable: true, executionGroup: "grp-1" }),
      makeItem({ id: "b", parallelizable: true, executionGroup: "grp-1" }),
      makeItem({ id: "c", parallelizable: false }),
    ];

    const plan = planWorkItems(items);
    expect(plan.parallelizableGroups).toHaveLength(2);
    expect(plan.parallelizableGroups[0]?.map((item) => item.id)).toEqual(["a", "b"]);
    expect(plan.parallelizableGroups[1]?.map((item) => item.id)).toEqual(["c"]);
  });

  it("keeps separate execution groups apart and sorts execution order by dependency depth", () => {
    const items = [
      makeItem({ id: "a", parallelizable: true, executionGroup: "grp-1" }),
      makeItem({ id: "b", parallelizable: true, executionGroup: "grp-2", dependencies: ["done-1"] }),
      makeItem({ id: "done-1", status: "done" }),
      makeItem({ id: "c", parallelizable: false }),
    ];

    const plan = planWorkItems(items);
    expect(plan.parallelizableGroups).toHaveLength(3);
    expect(plan.executionOrder[0]?.map((item) => item.id)).toEqual(["a"]);
  });

  it("builds dependency-aware execution layers", () => {
    const items = [
      makeItem({ id: "a", parallelizable: true, executionGroup: "grp-1" }),
      makeItem({ id: "b", dependencies: ["a"], parallelizable: true, executionGroup: "grp-2" }),
      makeItem({ id: "c", dependencies: ["a"], parallelizable: false }),
      makeItem({ id: "d", dependencies: ["b", "c"], parallelizable: false }),
    ];

    const plan = planWorkItems(items);
    expect(plan.ready.map((item) => item.id)).toEqual(["a"]);
    expect(plan.executionOrder.map((group) => group.map((item) => item.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
      ["d"],
    ]);
  });

  it("keeps cyclic dependency items blocked", () => {
    const items = [
      makeItem({ id: "a", dependencies: ["b"] }),
      makeItem({ id: "b", dependencies: ["a"] }),
    ];

    const plan = planWorkItems(items);
    expect(plan.ready).toHaveLength(0);
    expect(plan.executionOrder).toHaveLength(0);
    expect(plan.blocked.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });
});
