import type { SessionCheckpointRecord } from "../../../../shared/src/types/session-runtime.js";
import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";

export class SessionCheckpointsRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: {
    id?: string;
    sessionId: string;
    checkpointType: SessionCheckpointRecord["checkpointType"];
    lane: SessionCheckpointRecord["lane"];
    stage: SessionCheckpointRecord["stage"];
    summarySnapshotJson?: Record<string, unknown>;
    workflowSnapshotJson?: Record<string, unknown>;
    continuationJson?: Record<string, unknown>;
    metadataJson?: Record<string, unknown>;
    createdAt?: string;
  }): SessionCheckpointRecord {
    const record: SessionCheckpointRecord = {
      id: input.id ?? createId("session-checkpoint"),
      sessionId: input.sessionId,
      checkpointType: input.checkpointType,
      lane: input.lane,
      stage: input.stage,
      summarySnapshotJson: input.summarySnapshotJson ?? {},
      workflowSnapshotJson: input.workflowSnapshotJson ?? {},
      continuationJson: input.continuationJson ?? {},
      metadataJson: input.metadataJson ?? {},
      createdAt: input.createdAt ?? nowIso(),
    };

    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO session_checkpoints (
        id, session_id, checkpoint_type, lane, stage,
        summary_snapshot_json, workflow_snapshot_json, continuation_json, metadata_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.sessionId,
      record.checkpointType,
      record.lane,
      record.stage,
      JSON.stringify(record.summarySnapshotJson),
      JSON.stringify(record.workflowSnapshotJson),
      JSON.stringify(record.continuationJson),
      JSON.stringify(record.metadataJson),
      record.createdAt,
    );

    return record;
  }

  findById(checkpointId: string): SessionCheckpointRecord | undefined {
    const database = openDhDatabase(this.repoRoot);
    const row = database.prepare(`
      SELECT id, session_id, checkpoint_type, lane, stage,
             summary_snapshot_json, workflow_snapshot_json, continuation_json, metadata_json, created_at
      FROM session_checkpoints
      WHERE id = ?
      LIMIT 1
    `).get(checkpointId) as {
      id: string;
      session_id: string;
      checkpoint_type: SessionCheckpointRecord["checkpointType"];
      lane: SessionCheckpointRecord["lane"];
      stage: SessionCheckpointRecord["stage"];
      summary_snapshot_json: string;
      workflow_snapshot_json: string;
      continuation_json: string;
      metadata_json: string;
      created_at: string;
    } | undefined;

    if (!row) {
      return undefined;
    }

    return {
      id: row.id,
      sessionId: row.session_id,
      checkpointType: row.checkpoint_type,
      lane: row.lane,
      stage: row.stage,
      summarySnapshotJson: JSON.parse(row.summary_snapshot_json) as Record<string, unknown>,
      workflowSnapshotJson: JSON.parse(row.workflow_snapshot_json) as Record<string, unknown>,
      continuationJson: JSON.parse(row.continuation_json) as Record<string, unknown>,
      metadataJson: JSON.parse(row.metadata_json) as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }

  listBySession(sessionId: string): SessionCheckpointRecord[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT id, session_id, checkpoint_type, lane, stage,
             summary_snapshot_json, workflow_snapshot_json, continuation_json, metadata_json, created_at
      FROM session_checkpoints
      WHERE session_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(sessionId) as Array<{
      id: string;
      session_id: string;
      checkpoint_type: SessionCheckpointRecord["checkpointType"];
      lane: SessionCheckpointRecord["lane"];
      stage: SessionCheckpointRecord["stage"];
      summary_snapshot_json: string;
      workflow_snapshot_json: string;
      continuation_json: string;
      metadata_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      checkpointType: row.checkpoint_type,
      lane: row.lane,
      stage: row.stage,
      summarySnapshotJson: JSON.parse(row.summary_snapshot_json) as Record<string, unknown>,
      workflowSnapshotJson: JSON.parse(row.workflow_snapshot_json) as Record<string, unknown>,
      continuationJson: JSON.parse(row.continuation_json) as Record<string, unknown>,
      metadataJson: JSON.parse(row.metadata_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }
}
