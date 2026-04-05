import type { HookInvocationLog } from "../../../../shared/src/types/audit.js";
import { openDhDatabase } from "../db.js";

type RawHookLog = {
  id: string;
  session_id: string;
  envelope_id: string;
  hook_name: string;
  input_json: string;
  output_json: string;
  decision: string;
  reason: string;
  duration_ms: number;
  timestamp: string;
};

function toHookLog(raw: RawHookLog): HookInvocationLog {
  return {
    id: raw.id,
    sessionId: raw.session_id,
    envelopeId: raw.envelope_id,
    hookName: raw.hook_name as HookInvocationLog["hookName"],
    input: JSON.parse(raw.input_json) as Record<string, unknown>,
    output: JSON.parse(raw.output_json) as Record<string, unknown>,
    decision: raw.decision as HookInvocationLog["decision"],
    reason: raw.reason,
    durationMs: raw.duration_ms,
    timestamp: raw.timestamp,
  };
}

export class HookInvocationLogsRepo {
  constructor(private readonly repoRoot: string) {}

  save(record: HookInvocationLog): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO hook_invocation_logs (
        id, session_id, envelope_id, hook_name, input_json, output_json, decision, reason, duration_ms, timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.envelopeId,
      record.hookName,
      JSON.stringify(record.input),
      JSON.stringify(record.output),
      record.decision,
      record.reason,
      record.durationMs,
      record.timestamp,
    );
  }

  /**
   * Retrieve the most recent hook invocation log for a given session,
   * envelope, and hook name. Used by the Go runtime to read the TS-side
   * enforcement decision.
   */
  findLatestDecision(
    sessionId: string,
    envelopeId: string,
    hookName: HookInvocationLog["hookName"],
  ): HookInvocationLog | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database
      .prepare(
        `SELECT * FROM hook_invocation_logs
         WHERE session_id = ? AND envelope_id = ? AND hook_name = ?
         ORDER BY timestamp DESC
         LIMIT 1`,
      )
      .get(sessionId, envelopeId, hookName) as RawHookLog | undefined;
    return row ? toHookLog(row) : undefined;
  }

  /**
   * List all hook logs for a session, ordered newest-first.
   * Useful for diagnostics and the doctor command.
   */
  listBySession(sessionId: string): HookInvocationLog[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database
      .prepare(
        "SELECT * FROM hook_invocation_logs WHERE session_id = ? ORDER BY timestamp DESC",
      )
      .all(sessionId) as RawHookLog[];
    return rows.map(toHookLog);
  }
}
