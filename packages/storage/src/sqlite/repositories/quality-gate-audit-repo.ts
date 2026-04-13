import {
  type AuditQueryFilter,
  type QualityGateAudit,
} from "../../../../shared/src/types/audit.js";
import { buildAuditWhereClause, normalizeAuditQueryLimit } from "./audit-query-utils.js";
import { openDhDatabase } from "../db.js";

export class QualityGateAuditRepo {
  constructor(private readonly repoRoot: string) {}

  save(record: QualityGateAudit): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO quality_gate_audit (
        id, session_id, envelope_id, role, gate_id, availability, result, reason, evidence_json, limitations_json, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.envelopeId,
      record.role,
      record.gateId,
      record.availability,
      record.result,
      record.reason,
      JSON.stringify(record.evidence),
      JSON.stringify(record.limitations),
      record.timestamp,
    );
  }

  list(filter: AuditQueryFilter = {}): QualityGateAudit[] {
    const database = openDhDatabase(this.repoRoot);
    const normalizedLimit = normalizeAuditQueryLimit(filter.limit);
    const { whereSql, params } = buildAuditWhereClause(filter);
    const rows = database.prepare(`
      SELECT id, session_id, envelope_id, role, gate_id, availability, result, reason, evidence_json, limitations_json, timestamp
      FROM quality_gate_audit
      ${whereSql}
      ORDER BY timestamp DESC, rowid DESC
      LIMIT ?
    `).all(...params, normalizedLimit) as Array<{
      id: string;
      session_id: string;
      envelope_id: string;
      role: QualityGateAudit["role"];
      gate_id: QualityGateAudit["gateId"];
      availability: QualityGateAudit["availability"];
      result: QualityGateAudit["result"];
      reason: string;
      evidence_json: string;
      limitations_json: string;
      timestamp: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      envelopeId: row.envelope_id,
      role: row.role,
      gateId: row.gate_id,
      availability: row.availability,
      result: row.result,
      reason: row.reason,
      evidence: parseJsonArray(row.evidence_json),
      limitations: parseJsonArray(row.limitations_json),
      timestamp: row.timestamp,
    }));
  }

  listBySession(sessionId: string, limit?: number): QualityGateAudit[] {
    return this.list({ sessionId, limit });
  }
}

function parseJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}
