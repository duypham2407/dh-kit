import type { SessionSummaryRecord } from "../../../../shared/src/types/session-runtime.js";
import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";

export class SessionSummaryRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: {
    id?: string;
    sessionId: string;
    filesChanged: number;
    additions: number;
    deletions: number;
    lastDiffAt?: string;
    latestStage?: string;
    latestCheckpointId?: string;
    continuationSummary?: string;
    continuationCreatedAt?: string;
    updatedAt?: string;
  }): SessionSummaryRecord {
    // Summary records are treated as append-only snapshots in runtime usage.
    // Callers should omit `id` so each save creates a new row; explicit `id`
    // upsert exists for deterministic tests/migrations only.
    const record: SessionSummaryRecord = {
      id: input.id ?? createId("session-summary"),
      sessionId: input.sessionId,
      filesChanged: input.filesChanged,
      additions: input.additions,
      deletions: input.deletions,
      lastDiffAt: input.lastDiffAt,
      latestStage: input.latestStage as SessionSummaryRecord["latestStage"],
      latestCheckpointId: input.latestCheckpointId,
      continuationSummary: input.continuationSummary,
      continuationCreatedAt: input.continuationCreatedAt,
      updatedAt: input.updatedAt ?? nowIso(),
    };

    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO session_summaries (
        id, session_id, files_changed, additions, deletions,
        last_diff_at, latest_stage, latest_checkpoint_id, continuation_summary, continuation_created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        files_changed = excluded.files_changed,
        additions = excluded.additions,
        deletions = excluded.deletions,
        last_diff_at = excluded.last_diff_at,
        latest_stage = excluded.latest_stage,
        latest_checkpoint_id = excluded.latest_checkpoint_id,
        continuation_summary = excluded.continuation_summary,
        continuation_created_at = excluded.continuation_created_at,
        updated_at = excluded.updated_at
    `).run(
      record.id,
      record.sessionId,
      record.filesChanged,
      record.additions,
      record.deletions,
      record.lastDiffAt ?? null,
      record.latestStage ?? null,
      record.latestCheckpointId ?? null,
      record.continuationSummary ?? null,
      record.continuationCreatedAt ?? null,
      record.updatedAt,
    );

    return record;
  }

  findLatestBySession(sessionId: string): SessionSummaryRecord | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT id, session_id, files_changed, additions, deletions, last_diff_at,
             latest_stage, latest_checkpoint_id, continuation_summary, continuation_created_at, updated_at
      FROM session_summaries
      WHERE session_id = ?
      ORDER BY updated_at DESC, rowid DESC
      LIMIT 1
    `).get(sessionId) as {
      id: string;
      session_id: string;
      files_changed: number;
      additions: number;
      deletions: number;
      last_diff_at: string | null;
      latest_stage: string | null;
      latest_checkpoint_id: string | null;
      continuation_summary: string | null;
      continuation_created_at: string | null;
      updated_at: string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      filesChanged: row.files_changed,
      additions: row.additions,
      deletions: row.deletions,
      lastDiffAt: row.last_diff_at ?? undefined,
      latestStage: row.latest_stage as SessionSummaryRecord["latestStage"] | undefined,
      latestCheckpointId: row.latest_checkpoint_id ?? undefined,
      continuationSummary: row.continuation_summary ?? undefined,
      continuationCreatedAt: row.continuation_created_at ?? undefined,
      updatedAt: row.updated_at,
    };
  }
}
