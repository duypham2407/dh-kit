import type { SkillActivationAudit } from "../../../../shared/src/types/audit.js";
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
}
