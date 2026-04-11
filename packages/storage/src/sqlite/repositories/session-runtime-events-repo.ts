import type { SessionRuntimeEventRecord, SessionRuntimeEventType } from "../../../../shared/src/types/session-runtime.js";
import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";

export class SessionRuntimeEventsRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: {
    sessionId: string;
    eventType: SessionRuntimeEventType;
    eventJson?: Record<string, unknown>;
    createdAt?: string;
  }): SessionRuntimeEventRecord {
    const record: SessionRuntimeEventRecord = {
      id: createId("session-runtime-event"),
      sessionId: input.sessionId,
      eventType: input.eventType,
      eventJson: input.eventJson ?? {},
      createdAt: input.createdAt ?? nowIso(),
    };
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO session_runtime_events (
        id, session_id, event_type, event_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.eventType,
      JSON.stringify(record.eventJson),
      record.createdAt,
    );
    return record;
  }

  listBySession(sessionId: string): SessionRuntimeEventRecord[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT id, session_id, event_type, event_json, created_at
      FROM session_runtime_events
      WHERE session_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(sessionId) as Array<{
      id: string;
      session_id: string;
      event_type: SessionRuntimeEventType;
      event_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      eventType: row.event_type,
      eventJson: JSON.parse(row.event_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }
}
