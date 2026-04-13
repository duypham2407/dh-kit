import {
  type AuditQueryFilter,
  type ToolUsageAudit,
} from "../../../../shared/src/types/audit.js";
import { buildAuditWhereClause, normalizeAuditQueryLimit } from "./audit-query-utils.js";
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

  list(filter: AuditQueryFilter = {}): ToolUsageAudit[] {
    const database = openDhDatabase(this.repoRoot);
    const normalizedLimit = normalizeAuditQueryLimit(filter.limit);
    const { whereSql, params } = buildAuditWhereClause(filter);
    const rows = database.prepare(`
      SELECT id, session_id, envelope_id, role, intent, tool_name, status, timestamp
      FROM tool_usage_audit
      ${whereSql}
      ORDER BY timestamp DESC, rowid DESC
      LIMIT ?
    `).all(...params, normalizedLimit) as Array<{
      id: string;
      session_id: string;
      envelope_id: string;
      role: ToolUsageAudit["role"];
      intent: string;
      tool_name: string;
      status: ToolUsageAudit["status"];
      timestamp: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      envelopeId: row.envelope_id,
      role: row.role,
      intent: row.intent,
      toolName: row.tool_name,
      status: row.status,
      timestamp: row.timestamp,
    }));
  }

  listBySession(sessionId: string, limit?: number): ToolUsageAudit[] {
    return this.list({ sessionId, limit });
  }
}
