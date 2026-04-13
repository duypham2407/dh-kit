import type { SessionState } from "../../../../shared/src/types/session.js";
import { openDhDatabase } from "../db.js";

export class SessionsRepo {
  constructor(private readonly repoRoot: string) {}

  save(session: SessionState): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO sessions (
        session_id, repo_root, lane, lane_locked, current_stage, status,
        created_at, updated_at, semantic_mode, tool_enforcement_level, active_work_item_ids_json,
        latest_summary_id, latest_checkpoint_id, latest_revert_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        repo_root = excluded.repo_root,
        lane = excluded.lane,
        lane_locked = excluded.lane_locked,
        current_stage = excluded.current_stage,
        status = excluded.status,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        semantic_mode = excluded.semantic_mode,
        tool_enforcement_level = excluded.tool_enforcement_level,
        active_work_item_ids_json = excluded.active_work_item_ids_json,
        latest_summary_id = excluded.latest_summary_id,
        latest_checkpoint_id = excluded.latest_checkpoint_id,
        latest_revert_id = excluded.latest_revert_id
    `).run(
      session.sessionId,
      session.repoRoot,
      session.lane,
      session.laneLocked ? 1 : 0,
      session.currentStage,
      session.status,
      session.createdAt,
      session.updatedAt,
      session.semanticMode,
      session.toolEnforcementLevel,
      JSON.stringify(session.activeWorkItemIds),
      session.latestSummaryId ?? null,
      session.latestCheckpointId ?? null,
      session.latestRevertId ?? null,
    );
  }

  findById(sessionId: string): SessionState | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT
        session_id,
        repo_root,
        lane,
        lane_locked,
        current_stage,
        status,
        created_at,
        updated_at,
        semantic_mode,
        tool_enforcement_level,
        active_work_item_ids_json,
        latest_summary_id,
        latest_checkpoint_id,
        latest_revert_id
      FROM sessions
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId) as {
      session_id: string;
      repo_root: string;
      lane: SessionState["lane"];
      lane_locked: number;
      current_stage: SessionState["currentStage"];
      status: SessionState["status"];
      created_at: string;
      updated_at: string;
      semantic_mode: SessionState["semanticMode"];
      tool_enforcement_level: SessionState["toolEnforcementLevel"];
      active_work_item_ids_json: string;
      latest_summary_id: string | null;
      latest_checkpoint_id: string | null;
      latest_revert_id: string | null;
    } | undefined;
    if (!row) {
      return undefined;
    }
    return {
      sessionId: row.session_id,
      repoRoot: row.repo_root,
      lane: row.lane,
      laneLocked: true,
      currentStage: row.current_stage,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      semanticMode: row.semantic_mode,
      toolEnforcementLevel: row.tool_enforcement_level,
      activeWorkItemIds: JSON.parse(row.active_work_item_ids_json) as string[],
      latestSummaryId: row.latest_summary_id ?? undefined,
      latestCheckpointId: row.latest_checkpoint_id ?? undefined,
      latestRevertId: row.latest_revert_id ?? undefined,
    };
  }
}
