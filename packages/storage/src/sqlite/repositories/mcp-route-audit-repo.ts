import type { McpRouteAudit } from "../../../../shared/src/types/audit.js";
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
}
