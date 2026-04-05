import type { ToolUsageAudit } from "../../../../shared/src/types/audit.js";
import { openDhDatabase } from "../db.js";

export class ToolUsageAuditRepo {
  constructor(private readonly repoRoot: string) {}

  save(record: ToolUsageAudit): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO tool_usage_audit (
        id, session_id, envelope_id, role, intent, tool_name, status, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.envelopeId,
      record.role,
      record.intent,
      record.toolName,
      record.status,
      record.timestamp,
    );
  }
}
