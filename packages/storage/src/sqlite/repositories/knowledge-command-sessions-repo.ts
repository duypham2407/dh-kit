import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";

export type KnowledgeCommandSessionRecord = {
  sessionId: string;
  repoRoot: string;
  status: "active" | "closed";
  lastCommandKind?: "ask" | "explain" | "trace";
  lastInput?: string;
  lastCompacted: boolean;
  lastRunAt?: string;
  createdAt: string;
  updatedAt: string;
};

export class KnowledgeCommandSessionsRepo {
  constructor(private readonly repoRoot: string) {}

  create(): KnowledgeCommandSessionRecord {
    const now = nowIso();
    const record: KnowledgeCommandSessionRecord = {
      sessionId: createId("knowledge-session"),
      repoRoot: this.repoRoot,
      status: "active",
      lastCompacted: false,
      createdAt: now,
      updatedAt: now,
    };
    this.save(record);
    return record;
  }

  save(record: KnowledgeCommandSessionRecord): void {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO knowledge_command_sessions (
        session_id,
        repo_root,
        status,
        last_command_kind,
        last_input,
        last_compacted,
        last_run_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        repo_root = excluded.repo_root,
        status = excluded.status,
        last_command_kind = excluded.last_command_kind,
        last_input = excluded.last_input,
        last_compacted = excluded.last_compacted,
        last_run_at = excluded.last_run_at,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at
    `).run(
      record.sessionId,
      record.repoRoot,
      record.status,
      record.lastCommandKind ?? null,
      record.lastInput ?? null,
      record.lastCompacted ? 1 : 0,
      record.lastRunAt ?? null,
      record.createdAt,
      record.updatedAt,
    );
  }

  findById(sessionId: string): KnowledgeCommandSessionRecord | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT
        session_id,
        repo_root,
        status,
        last_command_kind,
        last_input,
        last_compacted,
        last_run_at,
        created_at,
        updated_at
      FROM knowledge_command_sessions
      WHERE session_id = ?
      LIMIT 1
    `).get(sessionId) as {
      session_id: string;
      repo_root: string;
      status: "active" | "closed";
      last_command_kind: "ask" | "explain" | "trace" | null;
      last_input: string | null;
      last_compacted: number;
      last_run_at: string | null;
      created_at: string;
      updated_at: string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      sessionId: row.session_id,
      repoRoot: row.repo_root,
      status: row.status,
      lastCommandKind: row.last_command_kind ?? undefined,
      lastInput: row.last_input ?? undefined,
      lastCompacted: row.last_compacted === 1,
      lastRunAt: row.last_run_at ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
