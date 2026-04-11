import { compactSessionContext } from "./session-compaction.js";
import {
  KnowledgeCommandSessionsRepo,
  type KnowledgeCommandSessionRecord,
} from "../../../storage/src/sqlite/repositories/knowledge-command-sessions-repo.js";
import { ConfigRepo } from "../../../storage/src/sqlite/repositories/config-repo.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { KnowledgeCommandRuntimePersistence } from "./knowledge-command-runtime-persistence.js";

export type KnowledgeCommandKind = "ask" | "explain" | "trace";

export type ResolveSessionInput = {
  kind: KnowledgeCommandKind;
  prompt: string;
  resumeSessionId?: string;
};

export type ResolveSessionResult =
  | {
      ok: true;
      session: KnowledgeCommandSessionRecord;
      resumed: boolean;
      compaction: {
        attempted: boolean;
        overflow: boolean;
        compacted: boolean;
        continuationSummaryGeneratedInMemory: boolean;
        continuationSummaryPersisted: boolean;
      };
      persistence: {
        attempted: boolean;
        persisted: boolean;
        warning?: string;
        eventId?: string;
      };
    }
  | {
      ok: false;
      reason: string;
    };

export class KnowledgeCommandSessionBridge {
  private readonly sessionsRepo: KnowledgeCommandSessionsRepo;
  private readonly configRepo: ConfigRepo;
  private readonly runtimePersistence: KnowledgeCommandRuntimePersistence;

  private static readonly MAX_PERSISTED_LAST_INPUT_CHARS = 2_000;

  constructor(private readonly repoRoot: string) {
    this.sessionsRepo = new KnowledgeCommandSessionsRepo(repoRoot);
    this.configRepo = new ConfigRepo(repoRoot);
    this.runtimePersistence = new KnowledgeCommandRuntimePersistence(repoRoot);
  }

  resolveSession(input: ResolveSessionInput): ResolveSessionResult {
    const requestedSessionId = input.resumeSessionId?.trim();
    if (requestedSessionId) {
      const existing = this.sessionsRepo.findById(requestedSessionId);
      if (!existing) {
        return {
          ok: false,
          reason: `Knowledge session '${requestedSessionId}' was not found.`,
        };
      }
      if (existing.repoRoot !== this.repoRoot) {
        return {
          ok: false,
          reason: `Knowledge session '${requestedSessionId}' belongs to a different repository and cannot be resumed here.`,
        };
      }
      if (existing.status !== "active") {
        return {
          ok: false,
          reason: `Knowledge session '${requestedSessionId}' is not resumable because it is '${existing.status}'.`,
        };
      }

      const compaction = this.runCompactionPreflight(existing, input.prompt);
      const postflight = this.persistPostflight({
        session: existing,
        kind: input.kind,
        prompt: input.prompt,
        compaction,
      });

      return {
        ok: true,
        session: postflight.session,
        resumed: true,
        compaction: {
          ...compaction,
          continuationSummaryPersisted:
            compaction.continuationSummaryGeneratedInMemory && postflight.persistence.persisted,
        },
        persistence: postflight.persistence,
      };
    }

    const created = this.sessionsRepo.create();
    const compaction = this.runCompactionPreflight(created, input.prompt);
    const postflight = this.persistPostflight({
      session: created,
      kind: input.kind,
      prompt: input.prompt,
      compaction,
    });

    return {
      ok: true,
      session: postflight.session,
      resumed: false,
      compaction: {
        ...compaction,
        continuationSummaryPersisted:
          compaction.continuationSummaryGeneratedInMemory && postflight.persistence.persisted,
      },
      persistence: postflight.persistence,
    };
  }

  private runCompactionPreflight(
    session: KnowledgeCommandSessionRecord,
    prompt: string,
  ): {
    attempted: boolean;
    overflow: boolean;
    compacted: boolean;
    continuationSummaryGeneratedInMemory: boolean;
    continuationSummaryPersisted: boolean;
    continuationSummary?: string;
  } {
    const workflowSummary = [
      session.lastInput ? `previous input: ${session.lastInput}` : "",
      `prompt: ${prompt}`,
      `prompt length: ${prompt.length}`,
    ].filter(Boolean);

    const result = compactSessionContext({
      sessionId: session.sessionId,
      workflowSummary,
      runtimeEvents: [],
    });
    const autoCompaction = this.configRepo.read<boolean>("session.auto_compaction") ?? false;

    return {
      attempted: true,
      overflow: result.overflow,
      compacted: autoCompaction && result.overflow,
      continuationSummaryGeneratedInMemory: Boolean(autoCompaction && result.continuationSummary),
      continuationSummaryPersisted: false,
      continuationSummary: autoCompaction ? result.continuationSummary : undefined,
    };
  }

  private persistPostflight(input: {
    session: KnowledgeCommandSessionRecord;
    kind: KnowledgeCommandKind;
    prompt: string;
    compaction: {
      attempted: boolean;
      overflow: boolean;
      compacted: boolean;
      continuationSummaryGeneratedInMemory: boolean;
      continuationSummaryPersisted: boolean;
      continuationSummary?: string;
    };
  }): {
    session: KnowledgeCommandSessionRecord;
    persistence: {
      attempted: boolean;
      persisted: boolean;
      warning?: string;
      eventId?: string;
    };
  } {
    const updated = this.buildUpdatedSessionRecord(input.session, input.kind, input.prompt, input.compaction.compacted);
    this.sessionsRepo.save(updated);

    const persistence = this.runtimePersistence.persistCompactionOutcome({
      knowledgeSessionId: updated.sessionId,
      commandKind: input.kind,
      lastRunAt: updated.lastRunAt ?? updated.updatedAt,
      compaction: {
        attempted: input.compaction.attempted,
        overflow: input.compaction.overflow,
        compacted: input.compaction.compacted,
        continuationSummary: input.compaction.continuationSummary,
      },
    });

    if (!persistence.ok) {
      return {
        session: updated,
        persistence: {
          attempted: true,
          persisted: false,
          warning: `Cross-surface persistence failed: ${persistence.reason}`,
        },
      };
    }

    return {
      session: updated,
      persistence: {
        attempted: true,
        persisted: true,
        eventId: persistence.event.id,
      },
    };
  }

  private buildUpdatedSessionRecord(
    session: KnowledgeCommandSessionRecord,
    kind: KnowledgeCommandKind,
    prompt: string,
    compacted = false,
  ): KnowledgeCommandSessionRecord {
    const now = nowIso();
    return {
      ...session,
      lastCommandKind: kind,
      lastInput: this.truncatePersistedLastInput(prompt),
      lastCompacted: compacted,
      lastRunAt: now,
      updatedAt: now,
    };
  }

  private truncatePersistedLastInput(input: string): string {
    if (input.length <= KnowledgeCommandSessionBridge.MAX_PERSISTED_LAST_INPUT_CHARS) {
      return input;
    }
    const kept = input.slice(0, KnowledgeCommandSessionBridge.MAX_PERSISTED_LAST_INPUT_CHARS);
    const dropped = input.length - kept.length;
    return `${kept}… [truncated ${dropped} chars]`;
  }
}
