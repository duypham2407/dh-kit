import {
  DEFAULT_AUDIT_QUERY_LIMIT,
  MAX_AUDIT_QUERY_LIMIT,
  type AuditQueryFilter,
} from "../../../../shared/src/types/audit.js";

export function normalizeAuditQueryLimit(limit?: number): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_AUDIT_QUERY_LIMIT;
  }
  const parsed = Math.trunc(limit);
  if (parsed <= 0) {
    return DEFAULT_AUDIT_QUERY_LIMIT;
  }
  return Math.min(parsed, MAX_AUDIT_QUERY_LIMIT);
}

export function buildAuditWhereClause(filter: AuditQueryFilter): { whereSql: string; params: string[] } {
  const where: string[] = [];
  const params: string[] = [];

  if (filter.sessionId) {
    where.push("session_id = ?");
    params.push(filter.sessionId);
  }
  if (filter.role) {
    where.push("role = ?");
    params.push(filter.role);
  }
  if (filter.envelopeId) {
    where.push("envelope_id = ?");
    params.push(filter.envelopeId);
  }
  if (filter.fromTimestamp) {
    where.push("timestamp >= ?");
    params.push(filter.fromTimestamp);
  }
  if (filter.toTimestamp) {
    where.push("timestamp <= ?");
    params.push(filter.toTimestamp);
  }

  return {
    whereSql: where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    params,
  };
}
