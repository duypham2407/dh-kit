import { openDhDatabase } from "../../../storage/src/sqlite/db.js";
import {
  KnowledgeCommandRuntimeEventsRepo,
  type KnowledgeCommandRuntimeEventRecord,
} from "../../../storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.js";
import {
  KnowledgeCommandSummaryRepo,
  type KnowledgeCommandSummaryRecord,
} from "../../../storage/src/sqlite/repositories/knowledge-command-summary-repo.js";
import type { KnowledgeCommandKind } from "./knowledge-command-session-bridge.js";
import { nowIso } from "../../../shared/src/utils/time.js";

export type PersistKnowledgeRuntimeInput = {
  knowledgeSessionId: string;
  commandKind: KnowledgeCommandKind;
  lastRunAt: string;
  compaction: {
    attempted: boolean;
    overflow: boolean;
    compacted: boolean;
    continuationSummary?: string;
  };
};

export type PersistKnowledgeRuntimeResult =
  | {
      ok: true;
      event: KnowledgeCommandRuntimeEventRecord;
      summary: KnowledgeCommandSummaryRecord;
    }
  | {
      ok: false;
      reason: string;
    };

export class KnowledgeCommandRuntimePersistence {
  private readonly eventsRepo: KnowledgeCommandRuntimeEventsRepo;
  private readonly summaryRepo: KnowledgeCommandSummaryRepo;

  constructor(private readonly repoRoot: string) {
    this.eventsRepo = new KnowledgeCommandRuntimeEventsRepo(repoRoot);
    this.summaryRepo = new KnowledgeCommandSummaryRepo(repoRoot);
  }

  persistCompactionOutcome(input: PersistKnowledgeRuntimeInput): PersistKnowledgeRuntimeResult {
    const database = openDhDatabase(this.repoRoot);
    database.exec("BEGIN");
    try {
      const continuationCreatedAt = input.compaction.continuationSummary ? nowIso() : undefined;
      const event = this.eventsRepo.save({
        knowledgeSessionId: input.knowledgeSessionId,
        eventType: "compaction",
        eventJson: {
          commandKind: input.commandKind,
          attempted: input.compaction.attempted,
          overflow: input.compaction.overflow,
          compacted: input.compaction.compacted,
          continuationSummaryGeneratedInMemory: Boolean(input.compaction.continuationSummary),
          continuationCreatedAt: continuationCreatedAt ?? null,
        },
        database,
      });

      const summary = this.summaryRepo.save({
        knowledgeSessionId: input.knowledgeSessionId,
        lastCommandKind: input.commandKind,
        lastRunAt: input.lastRunAt,
        compactionAttempted: input.compaction.attempted,
        compactionOverflow: input.compaction.overflow,
        compactionApplied: input.compaction.compacted,
        continuationSummary: input.compaction.continuationSummary,
        continuationCreatedAt,
        compactionEventId: event.id,
        database,
      });

      database.exec("COMMIT");
      return {
        ok: true,
        event,
        summary,
      };
    } catch (error) {
      database.exec("ROLLBACK");
      const reason = error instanceof Error ? error.message : "Unknown persistence failure";
      return {
        ok: false,
        reason,
      };
    }
  }
}
