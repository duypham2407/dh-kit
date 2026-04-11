import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";
import type { DatabaseSync } from "node:sqlite";

export type KnowledgeCommandSummaryRecord = {
  knowledgeSessionId: string;
  lastCommandKind?: "ask" | "explain" | "trace";
  lastRunAt?: string;
  compactionAttempted: boolean;
  compactionOverflow: boolean;
  compactionApplied: boolean;
  continuationSummary?: string;
  continuationCreatedAt?: string;
  compactionEventId?: string;
  updatedAt: string;
};

export class KnowledgeCommandSummaryRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: {
    knowledgeSessionId: string;
    lastCommandKind?: "ask" | "explain" | "trace";
    lastRunAt?: string;
    compactionAttempted: boolean;
    compactionOverflow: boolean;
    compactionApplied: boolean;
    continuationSummary?: string;
    continuationCreatedAt?: string;
    compactionEventId?: string;
    updatedAt?: string;
    database?: DatabaseSync;
  }): KnowledgeCommandSummaryRecord {
    const record: KnowledgeCommandSummaryRecord = {
      knowledgeSessionId: input.knowledgeSessionId,
      lastCommandKind: input.lastCommandKind,
      lastRunAt: input.lastRunAt,
      compactionAttempted: input.compactionAttempted,
      compactionOverflow: input.compactionOverflow,
      compactionApplied: input.compactionApplied,
      continuationSummary: input.continuationSummary,
      continuationCreatedAt: input.continuationCreatedAt,
      compactionEventId: input.compactionEventId,
      updatedAt: input.updatedAt ?? nowIso(),
    };

    const database = input.database ?? openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO knowledge_command_summaries (
        knowledge_session_id,
        last_command_kind,
        last_run_at,
        compaction_attempted,
        compaction_overflow,
        compaction_applied,
        continuation_summary,
        continuation_created_at,
        compaction_event_id,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(knowledge_session_id) DO UPDATE SET
        last_command_kind = excluded.last_command_kind,
        last_run_at = excluded.last_run_at,
        compaction_attempted = excluded.compaction_attempted,
        compaction_overflow = excluded.compaction_overflow,
        compaction_applied = excluded.compaction_applied,
        continuation_summary = excluded.continuation_summary,
        continuation_created_at = excluded.continuation_created_at,
        compaction_event_id = excluded.compaction_event_id,
        updated_at = excluded.updated_at
    `).run(
      record.knowledgeSessionId,
      record.lastCommandKind ?? null,
      record.lastRunAt ?? null,
      record.compactionAttempted ? 1 : 0,
      record.compactionOverflow ? 1 : 0,
      record.compactionApplied ? 1 : 0,
      record.continuationSummary ?? null,
      record.continuationCreatedAt ?? null,
      record.compactionEventId ?? null,
      record.updatedAt,
    );

    return record;
  }

  findByKnowledgeSession(knowledgeSessionId: string): KnowledgeCommandSummaryRecord | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT
        knowledge_session_id,
        last_command_kind,
        last_run_at,
        compaction_attempted,
        compaction_overflow,
        compaction_applied,
        continuation_summary,
        continuation_created_at,
        compaction_event_id,
        updated_at
      FROM knowledge_command_summaries
      WHERE knowledge_session_id = ?
      LIMIT 1
    `).get(knowledgeSessionId) as {
      knowledge_session_id: string;
      last_command_kind: "ask" | "explain" | "trace" | null;
      last_run_at: string | null;
      compaction_attempted: number;
      compaction_overflow: number;
      compaction_applied: number;
      continuation_summary: string | null;
      continuation_created_at: string | null;
      compaction_event_id: string | null;
      updated_at: string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      knowledgeSessionId: row.knowledge_session_id,
      lastCommandKind: row.last_command_kind ?? undefined,
      lastRunAt: row.last_run_at ?? undefined,
      compactionAttempted: row.compaction_attempted === 1,
      compactionOverflow: row.compaction_overflow === 1,
      compactionApplied: row.compaction_applied === 1,
      continuationSummary: row.continuation_summary ?? undefined,
      continuationCreatedAt: row.continuation_created_at ?? undefined,
      compactionEventId: row.compaction_event_id ?? undefined,
      updatedAt: row.updated_at,
    };
  }
}
