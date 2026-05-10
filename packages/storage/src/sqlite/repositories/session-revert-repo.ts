import type { SessionRevertRecord } from "../../../../shared/src/types/session-runtime.js";
import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";

export class SessionRevertRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: {
    id?: string;
    sessionId: string;
    checkpointId: string;
    previousCheckpointId?: string;
    reason: string;
    createdAt?: string;
  }): SessionRevertRecord {
    const record: SessionRevertRecord = {
      id: input.id ?? createId("session-revert"),
      sessionId: input.sessionId,
      checkpointId: input.checkpointId,
      previousCheckpointId: input.previousCheckpointId,
      reason: input.reason,
      createdAt: input.createdAt ?? nowIso(),
    };

    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO session_reverts (
        id, session_id, checkpoint_id, previous_checkpoint_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.checkpointId,
      record.previousCheckpointId ?? null,
      record.reason,
      record.createdAt,
    );

    return record;
  }

  saveRecord(record: SessionRevertRecord): SessionRevertRecord {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO session_reverts (
        id, session_id, checkpoint_id, previous_checkpoint_id, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        checkpoint_id = excluded.checkpoint_id,
        previous_checkpoint_id = excluded.previous_checkpoint_id,
        reason = excluded.reason,
        created_at = excluded.created_at
    `).run(
      record.id,
      record.sessionId,
      record.checkpointId,
      record.previousCheckpointId ?? null,
      record.reason,
      record.createdAt,
    );
    return record;
  }

  findLatestBySession(sessionId: string): SessionRevertRecord | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT id, session_id, checkpoint_id, previous_checkpoint_id, reason, created_at
      FROM session_reverts
      WHERE session_id = ?
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(sessionId) as {
      id: string;
      session_id: string;
      checkpoint_id: string;
      previous_checkpoint_id: string | null;
      reason: string;
      created_at: string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      checkpointId: row.checkpoint_id,
      previousCheckpointId: row.previous_checkpoint_id ?? undefined,
      reason: row.reason,
      createdAt: row.created_at,
    };
  }

  listBySession(sessionId: string): SessionRevertRecord[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT id, session_id, checkpoint_id, previous_checkpoint_id, reason, created_at
      FROM session_reverts
      WHERE session_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(sessionId) as Array<{
      id: string;
      session_id: string;
      checkpoint_id: string;
      previous_checkpoint_id: string | null;
      reason: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      checkpointId: row.checkpoint_id,
      previousCheckpointId: row.previous_checkpoint_id ?? undefined,
      reason: row.reason,
      createdAt: row.created_at,
    }));
  }

  deleteBySession(sessionId: string): number {
    const database = openDhDatabase(this.repoRoot);
    const result = database.prepare("DELETE FROM session_reverts WHERE session_id = ?").run(sessionId) as { changes: number };
    return result.changes;
  }
}
