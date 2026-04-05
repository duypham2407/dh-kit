import type { WorkItemState } from "../../../shared/src/types/work-item.js";

export type WorkItemPlan = {
  ready: WorkItemState[];
  blocked: WorkItemState[];
  parallelizableGroups: WorkItemState[][];
  executionOrder: WorkItemState[][];
};

export function planWorkItems(items: WorkItemState[]): WorkItemPlan {
  const doneIds = new Set(items.filter((item) => item.status === "done").map((item) => item.id));
  const pendingItems = items.filter((item) => item.status === "pending");
  const byId = new Map(items.map((item) => [item.id, item]));

  const missingDependencyIdsByItem = new Map<string, string[]>();
  for (const item of pendingItems) {
    const missing = item.dependencies.filter((id) => !doneIds.has(id) && !byId.has(id));
    if (missing.length > 0) {
      missingDependencyIdsByItem.set(item.id, missing);
    }
  }

  const schedulable = pendingItems.filter((item) => !missingDependencyIdsByItem.has(item.id));
  const schedulableById = new Map(schedulable.map((item) => [item.id, item]));
  const unresolvedDepsByItem = new Map<string, Set<string>>();

  for (const item of schedulable) {
    const unresolved = item.dependencies.filter((id) => !doneIds.has(id) && schedulableById.has(id));
    unresolvedDepsByItem.set(item.id, new Set(unresolved));
  }

  const scheduled = new Set<string>();
  const executionOrder: WorkItemState[][] = [];

  while (scheduled.size < schedulable.length) {
    const layer = schedulable.filter((item) => {
      if (scheduled.has(item.id)) {
        return false;
      }
      const unresolved = unresolvedDepsByItem.get(item.id);
      if (!unresolved || unresolved.size === 0) {
        return true;
      }
      for (const depId of unresolved) {
        if (!scheduled.has(depId)) {
          return false;
        }
      }
      return true;
    });

    if (layer.length === 0) {
      break;
    }

    const groups = groupParallelizable(layer);
    for (const group of groups) {
      executionOrder.push(group);
      for (const item of group) {
        scheduled.add(item.id);
      }
    }
  }

  const ready = schedulable.filter((item) => {
    const unresolved = unresolvedDepsByItem.get(item.id);
    return !unresolved || unresolved.size === 0;
  });
  const parallelizableGroups = groupParallelizable(ready);
  const unscheduledIds = new Set(schedulable.filter((item) => !scheduled.has(item.id)).map((item) => item.id));
  const blocked = pendingItems.filter((item) => missingDependencyIdsByItem.has(item.id) || unscheduledIds.has(item.id));

  return { ready, blocked, parallelizableGroups, executionOrder };
}

function groupParallelizable(items: WorkItemState[]): WorkItemState[][] {
  const groupedByExecutionGroup = new Map<string, WorkItemState[]>();
  const parallelizable = items.filter((item) => item.parallelizable);
  const serial = items.filter((item) => !item.parallelizable);
  const groups: WorkItemState[][] = [];

  for (const item of parallelizable) {
    const key = item.executionGroup ?? `solo:${item.id}`;
    const existing = groupedByExecutionGroup.get(key) ?? [];
    existing.push(item);
    groupedByExecutionGroup.set(key, existing);
  }
  for (const group of groupedByExecutionGroup.values()) {
    if (group.length > 0) {
      groups.push(group);
    }
  }
  for (const item of serial) {
    groups.push([item]);
  }
  return groups;
}
