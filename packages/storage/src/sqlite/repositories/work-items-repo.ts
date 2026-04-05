import type { WorkItemState } from "../../../../shared/src/types/work-item.js";
import { openDhDatabase } from "../db.js";

export class WorkItemsRepo {
  constructor(private readonly repoRoot: string) {}

  save(workItem: WorkItemState): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO work_items (
        id, session_id, lane, title, description, owner_role, dependencies_json,
        parallelizable, execution_group, status, target_areas_json, acceptance_json, validation_plan_json,
        review_status, test_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        lane = excluded.lane,
        title = excluded.title,
        description = excluded.description,
        owner_role = excluded.owner_role,
        dependencies_json = excluded.dependencies_json,
        parallelizable = excluded.parallelizable,
        execution_group = excluded.execution_group,
        status = excluded.status,
        target_areas_json = excluded.target_areas_json,
        acceptance_json = excluded.acceptance_json,
        validation_plan_json = excluded.validation_plan_json,
        review_status = excluded.review_status,
        test_status = excluded.test_status
    `).run(
      workItem.id,
      workItem.sessionId,
      workItem.lane,
      workItem.title,
      workItem.description,
      workItem.ownerRole,
      JSON.stringify(workItem.dependencies),
      workItem.parallelizable ? 1 : 0,
      workItem.executionGroup ?? null,
      workItem.status,
      JSON.stringify(workItem.targetAreas),
      JSON.stringify(workItem.acceptance),
      JSON.stringify(workItem.validationPlan),
      workItem.reviewStatus,
      workItem.testStatus,
    );
  }

  listBySession(sessionId: string): WorkItemState[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT * FROM work_items WHERE session_id = ? ORDER BY title ASC
    `).all(sessionId) as Array<{
      id: string;
      session_id: string;
      lane: "delivery" | "migration";
      title: string;
      description: string;
      owner_role: "implementer" | "reviewer" | "tester";
      dependencies_json: string;
      parallelizable: number;
      execution_group: string | null;
      status: WorkItemState["status"];
      target_areas_json: string;
      acceptance_json: string;
      validation_plan_json: string;
      review_status: WorkItemState["reviewStatus"];
      test_status: WorkItemState["testStatus"];
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      lane: row.lane,
      title: row.title,
      description: row.description,
      ownerRole: row.owner_role,
      dependencies: JSON.parse(row.dependencies_json) as string[],
      parallelizable: row.parallelizable === 1,
      executionGroup: row.execution_group ?? undefined,
      status: row.status,
      targetAreas: JSON.parse(row.target_areas_json) as string[],
      acceptance: JSON.parse(row.acceptance_json) as string[],
      validationPlan: JSON.parse(row.validation_plan_json) as string[],
      reviewStatus: row.review_status,
      testStatus: row.test_status,
    }));
  }
}
