import type { WorkflowState } from "../../../../shared/src/types/stage.js";
import { openDhDatabase } from "../db.js";

export class WorkflowStateRepo {
  constructor(private readonly repoRoot: string) {}

  save(sessionId: string, workflow: WorkflowState): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO workflow_state (
        session_id, lane, stage, stage_status, previous_stage, next_stage, gate_status, blockers_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        lane = excluded.lane,
        stage = excluded.stage,
        stage_status = excluded.stage_status,
        previous_stage = excluded.previous_stage,
        next_stage = excluded.next_stage,
        gate_status = excluded.gate_status,
        blockers_json = excluded.blockers_json
    `).run(
      sessionId,
      workflow.lane,
      workflow.stage,
      workflow.stageStatus,
      workflow.previousStage ?? null,
      workflow.nextStage ?? null,
      workflow.gateStatus,
      JSON.stringify(workflow.blockers),
    );
  }
}
