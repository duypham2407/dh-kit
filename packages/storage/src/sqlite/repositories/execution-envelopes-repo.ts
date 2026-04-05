import type { ExecutionEnvelopeState } from "../../../../shared/src/types/execution-envelope.js";
import { openDhDatabase } from "../db.js";

export class ExecutionEnvelopesRepo {
  constructor(private readonly repoRoot: string) {}

  save(envelope: ExecutionEnvelopeState): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO execution_envelopes (
        id, session_id, lane, role, agent_id, stage, work_item_id, resolved_model_json,
        active_skills_json, active_mcps_json, required_tools_json, semantic_mode, evidence_policy, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        lane = excluded.lane,
        role = excluded.role,
        agent_id = excluded.agent_id,
        stage = excluded.stage,
        work_item_id = excluded.work_item_id,
        resolved_model_json = excluded.resolved_model_json,
        active_skills_json = excluded.active_skills_json,
        active_mcps_json = excluded.active_mcps_json,
        required_tools_json = excluded.required_tools_json,
        semantic_mode = excluded.semantic_mode,
        evidence_policy = excluded.evidence_policy,
        created_at = excluded.created_at
    `).run(
      envelope.id,
      envelope.sessionId,
      envelope.lane,
      envelope.role,
      envelope.agentId,
      envelope.stage,
      envelope.workItemId ?? null,
      JSON.stringify(envelope.resolvedModel),
      JSON.stringify(envelope.activeSkills),
      JSON.stringify(envelope.activeMcps),
      JSON.stringify(envelope.requiredTools),
      envelope.semanticMode,
      envelope.evidencePolicy,
      envelope.createdAt,
    );
  }
}
