import {
  type AuditQueryFilter,
  type McpRouteAudit,
} from "../../../../shared/src/types/audit.js";
import { buildAuditWhereClause, normalizeAuditQueryLimit } from "./audit-query-utils.js";
import { openDhDatabase } from "../db.js";

export class McpRouteAuditRepo {
  constructor(private readonly repoRoot: string) {}

  save(record: McpRouteAudit): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO mcp_route_audit (
        id, session_id, envelope_id, role, mcp_name, route_reason, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.envelopeId,
      record.role,
      record.mcpName,
      record.routeReason,
      record.timestamp,
    );
  }

  list(filter: AuditQueryFilter = {}): McpRouteAudit[] {
    const database = openDhDatabase(this.repoRoot);
    const normalizedLimit = normalizeAuditQueryLimit(filter.limit);
    const { whereSql, params } = buildAuditWhereClause(filter);
    const rows = database.prepare(`
      SELECT id, session_id, envelope_id, role, mcp_name, route_reason, timestamp
      FROM mcp_route_audit
      ${whereSql}
      ORDER BY timestamp DESC, rowid DESC
      LIMIT ?
    `).all(...params, normalizedLimit) as Array<{
      id: string;
      session_id: string;
      envelope_id: string;
      role: McpRouteAudit["role"];
      mcp_name: string;
      route_reason: string;
      timestamp: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      envelopeId: row.envelope_id,
      role: row.role,
      mcpName: row.mcp_name,
      routeReason: row.route_reason,
      timestamp: row.timestamp,
    }));
  }

  listBySession(sessionId: string, limit?: number): McpRouteAudit[] {
    return this.list({ sessionId, limit });
  }
}
