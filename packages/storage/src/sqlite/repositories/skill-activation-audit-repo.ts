import {
  type AuditQueryFilter,
  type SkillActivationAudit,
} from "../../../../shared/src/types/audit.js";
import { buildAuditWhereClause, normalizeAuditQueryLimit } from "./audit-query-utils.js";
import { openDhDatabase } from "../db.js";

export class SkillActivationAuditRepo {
  constructor(private readonly repoRoot: string) {}

  save(record: SkillActivationAudit): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO skill_activation_audit (
        id, session_id, envelope_id, role, skill_name, activation_reason, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.envelopeId,
      record.role,
      record.skillName,
      record.activationReason,
      record.timestamp,
    );
  }

  list(filter: AuditQueryFilter = {}): SkillActivationAudit[] {
    const database = openDhDatabase(this.repoRoot);
    const normalizedLimit = normalizeAuditQueryLimit(filter.limit);
    const { whereSql, params } = buildAuditWhereClause(filter);
    const rows = database.prepare(`
      SELECT id, session_id, envelope_id, role, skill_name, activation_reason, timestamp
      FROM skill_activation_audit
      ${whereSql}
      ORDER BY timestamp DESC, rowid DESC
      LIMIT ?
    `).all(...params, normalizedLimit) as Array<{
      id: string;
      session_id: string;
      envelope_id: string;
      role: SkillActivationAudit["role"];
      skill_name: string;
      activation_reason: string;
      timestamp: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      envelopeId: row.envelope_id,
      role: row.role,
      skillName: row.skill_name,
      activationReason: row.activation_reason,
      timestamp: row.timestamp,
    }));
  }

  listBySession(sessionId: string, limit?: number): SkillActivationAudit[] {
    return this.list({ sessionId, limit });
  }
}
