import { createId } from "../../../../shared/src/utils/ids.js";
import { nowIso } from "../../../../shared/src/utils/time.js";
import { openDhDatabase } from "../db.js";
import type { DatabaseSync } from "node:sqlite";

export type KnowledgeCommandRuntimeEventType = "compaction";

export type KnowledgeCommandRuntimeEventRecord = {
  id: string;
  knowledgeSessionId: string;
  eventType: KnowledgeCommandRuntimeEventType;
  eventJson: Record<string, unknown>;
  createdAt: string;
};

export class KnowledgeCommandRuntimeEventsRepo {
  constructor(private readonly repoRoot: string) {}

  save(input: {
    knowledgeSessionId: string;
    eventType: KnowledgeCommandRuntimeEventType;
    eventJson?: Record<string, unknown>;
    createdAt?: string;
    database?: DatabaseSync;
  }): KnowledgeCommandRuntimeEventRecord {
    const record: KnowledgeCommandRuntimeEventRecord = {
      id: createId("knowledge-runtime-event"),
      knowledgeSessionId: input.knowledgeSessionId,
      eventType: input.eventType,
      eventJson: input.eventJson ?? {},
      createdAt: input.createdAt ?? nowIso(),
    };
    const database = input.database ?? openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO knowledge_command_runtime_events (
        id, knowledge_session_id, event_type, event_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
    `).run(
      record.id,
      record.knowledgeSessionId,
      record.eventType,
      JSON.stringify(record.eventJson),
      record.createdAt,
    );

    return record;
  }

  listByKnowledgeSession(knowledgeSessionId: string): KnowledgeCommandRuntimeEventRecord[] {
    const database = openDhDatabase(this.repoRoot);
    const rows = database.prepare(`
      SELECT id, knowledge_session_id, event_type, event_json, created_at
      FROM knowledge_command_runtime_events
      WHERE knowledge_session_id = ?
      ORDER BY created_at DESC, rowid DESC
    `).all(knowledgeSessionId) as Array<{
      id: string;
      knowledge_session_id: string;
      event_type: KnowledgeCommandRuntimeEventType;
      event_json: string;
      created_at: string;
    }>;

    return rows.map((row) => ({
      id: row.id,
      knowledgeSessionId: row.knowledge_session_id,
      eventType: row.event_type,
      eventJson: JSON.parse(row.event_json) as Record<string, unknown>,
      createdAt: row.created_at,
    }));
  }
}
