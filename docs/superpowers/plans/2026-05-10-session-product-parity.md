# Session Product Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add local session list/show/delete/fork/export/import/stats commands so DH sessions are inspectable, portable, and safe to manage from the CLI.

**Architecture:** Build a TypeScript product surface over the existing `.dh/sqlite/dh.db` session tables. Storage repositories provide deterministic list/delete/upsert helpers; runtime session services own export/import/fork/delete/stats behavior; CLI commands only parse arguments, call services, and render text or JSON.

**Tech Stack:** TypeScript ESM, Vitest, Node `fs/path/os`, DH SQLite repositories under `packages/storage`, shared DTOs under `packages/shared`, CLI commands under `apps/cli`, existing Rust session manager kept as a regression guard only.

---

## File Structure

- Modify: `packages/shared/src/types/session.ts`
  - Add session export, import, show, list, and stats DTOs.
- Modify: `packages/storage/src/sqlite/repositories/sessions-repo.ts`
  - Add `list`, `findLatest`, `deleteById`, and row mapping helper.
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
  - Add `saveRecord` and `deleteBySession`.
- Modify: `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
  - Add `listBySession`, `saveRecord`, and `deleteBySession`.
- Modify: `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts`
  - Add `saveRecord` and `deleteBySession`.
- Modify: `packages/storage/src/sqlite/repositories/session-revert-repo.ts`
  - Add `listBySession`, `saveRecord`, and `deleteBySession`.
- Create: `packages/runtime/src/session/session-query.ts`
  - Read list/show reports.
- Create: `packages/runtime/src/session/session-export.ts`
  - Build versioned export documents and sanitize them.
- Create: `packages/runtime/src/session/session-import.ts`
  - Validate and import versioned export documents.
- Create: `packages/runtime/src/session/session-delete.ts`
  - Delete a session and all dependent local rows.
- Create: `packages/runtime/src/session/session-fork.ts`
  - Copy a session and dependent rows into a new local session id.
- Create: `packages/runtime/src/session/session-stats.ts`
  - Aggregate session/runtime event stats.
- Create: `apps/cli/src/commands/session.ts`
  - Implement `dh session list/show/delete/fork`.
- Create: `apps/cli/src/commands/export.ts`
  - Implement `dh export`.
- Create: `apps/cli/src/commands/import.ts`
  - Implement `dh import`.
- Create: `apps/cli/src/commands/stats.ts`
  - Implement `dh stats`.
- Modify: `apps/cli/src/commands/root.ts`
  - Register new commands and help text.

## Execution Notes

- Keep the untracked user file `docs/scope/2026-05-10-delivery-request.md` untouched.
- Do not introduce Rust session command writes in this milestone. The Rust check is only a regression guard.
- Use TDD: write each failing test first, run the narrow test to confirm failure, implement minimal code, re-run the narrow test, then commit.
- Use deterministic temp repos in tests and call `closeDhDatabase(repo)` in `afterEach`.

## Task 1: Storage Repository Helpers

**Files:**

- Modify: `packages/storage/src/sqlite/repositories/sessions-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts`
- Modify: `packages/storage/src/sqlite/repositories/session-revert-repo.ts`
- Test: `packages/storage/src/sqlite/repositories/repos.test.ts`
- Test: `packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts`
- Test: `packages/storage/src/sqlite/repositories/session-summary-repo.test.ts`
- Test: `packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts`
- Test: `packages/storage/src/sqlite/repositories/session-revert-repo.test.ts`

- [ ] **Step 1: Write failing `SessionsRepo` list/delete tests**

Add these tests inside the existing `SessionsRepo` describe block in `packages/storage/src/sqlite/repositories/repos.test.ts`:

```ts
  it("lists sessions sorted by updated time with a limit", () => {
    const repoRoot = makeTmpRepo();
    const sessions = new SessionsRepo(repoRoot);
    sessions.save(makeSession({ sessionId: "session-old", repoRoot, updatedAt: "2026-05-10T01:00:00.000Z" }));
    sessions.save(makeSession({ sessionId: "session-new", repoRoot, updatedAt: "2026-05-10T02:00:00.000Z" }));
    sessions.save(makeSession({ sessionId: "session-middle", repoRoot, updatedAt: "2026-05-10T01:30:00.000Z" }));

    expect(sessions.list({ limit: 2 }).map((session) => session.sessionId)).toEqual([
      "session-new",
      "session-middle",
    ]);
  });

  it("finds the latest session across all lanes", () => {
    const repoRoot = makeTmpRepo();
    const sessions = new SessionsRepo(repoRoot);
    sessions.save(makeSession({ sessionId: "session-quick", repoRoot, lane: "quick", updatedAt: "2026-05-10T01:00:00.000Z" }));
    sessions.save(makeSession({ sessionId: "session-delivery", repoRoot, lane: "delivery", updatedAt: "2026-05-10T03:00:00.000Z" }));

    expect(sessions.findLatest()?.sessionId).toBe("session-delivery");
  });

  it("deletes a session by id", () => {
    const repoRoot = makeTmpRepo();
    const sessions = new SessionsRepo(repoRoot);
    sessions.save(makeSession({ sessionId: "session-delete", repoRoot }));

    expect(sessions.deleteById("session-delete")).toBe(1);
    expect(sessions.findById("session-delete")).toBeUndefined();
  });
```

- [ ] **Step 2: Run failing session repository test**

Run:

```bash
npm test -- repos
```

Expected: FAIL because `SessionsRepo.list`, `SessionsRepo.findLatest`, and `SessionsRepo.deleteById` do not exist.

- [ ] **Step 3: Implement `SessionsRepo` helpers**

In `packages/storage/src/sqlite/repositories/sessions-repo.ts`, add a row type and mapper, then replace duplicated row mapping in `findById`:

```ts
type SessionRow = {
  session_id: string;
  repo_root: string;
  lane: SessionState["lane"];
  lane_locked: number;
  current_stage: SessionState["currentStage"];
  status: SessionState["status"];
  created_at: string;
  updated_at: string;
  semantic_mode: SessionState["semanticMode"];
  tool_enforcement_level: SessionState["toolEnforcementLevel"];
  active_work_item_ids_json: string;
  latest_summary_id: string | null;
  latest_checkpoint_id: string | null;
  latest_revert_id: string | null;
};

const SESSION_COLUMNS = `
  session_id,
  repo_root,
  lane,
  lane_locked,
  current_stage,
  status,
  created_at,
  updated_at,
  semantic_mode,
  tool_enforcement_level,
  active_work_item_ids_json,
  latest_summary_id,
  latest_checkpoint_id,
  latest_revert_id
`;
```

Add methods:

```ts
  list(input: { limit?: number } = {}): SessionState[] {
    const database = openDhDatabase(this.repoRoot);
    const limit = input.limit ?? 20;
    const rows = database.prepare(`
      SELECT ${SESSION_COLUMNS}
      FROM sessions
      ORDER BY updated_at DESC, created_at DESC
      LIMIT ?
    `).all(limit) as SessionRow[];
    return rows.map((row) => this.rowToSession(row));
  }

  findLatest(): SessionState | undefined {
    return this.list({ limit: 1 })[0];
  }

  deleteById(sessionId: string): number {
    const database = openDhDatabase(this.repoRoot);
    return database.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId).changes;
  }

  private rowToSession(row: SessionRow): SessionState {
    return {
      sessionId: row.session_id,
      repoRoot: row.repo_root,
      lane: row.lane,
      laneLocked: row.lane_locked === 1,
      currentStage: row.current_stage,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      semanticMode: row.semantic_mode,
      toolEnforcementLevel: row.tool_enforcement_level,
      activeWorkItemIds: JSON.parse(row.active_work_item_ids_json) as string[],
      latestSummaryId: row.latest_summary_id ?? undefined,
      latestCheckpointId: row.latest_checkpoint_id ?? undefined,
      latestRevertId: row.latest_revert_id ?? undefined,
    };
  }
```

Use `this.rowToSession(row)` in `findById`.

- [ ] **Step 4: Run passing session repository test**

Run:

```bash
npm test -- repos
```

Expected: PASS.

- [ ] **Step 5: Write failing child repository helper tests**

Add one focused test per repository:

`packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts`:

```ts
  it("upserts imported records and deletes events by session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-import" }));
    const events = new SessionRuntimeEventsRepo(repo);

    events.saveRecord({
      id: "event-imported",
      sessionId: "session-import",
      eventType: "text.delta",
      eventJson: { payload: { text: "first" } },
      createdAt: "2026-05-10T02:00:00.000Z",
    });
    events.saveRecord({
      id: "event-imported",
      sessionId: "session-import",
      eventType: "text.delta",
      eventJson: { payload: { text: "second" } },
      createdAt: "2026-05-10T03:00:00.000Z",
    });

    expect(events.listBySession("session-import")).toHaveLength(1);
    expect(events.deleteBySession("session-import")).toBe(1);
    expect(events.listBySession("session-import")).toHaveLength(0);
  });
```

`packages/storage/src/sqlite/repositories/session-summary-repo.test.ts`:

```ts
  it("lists, upserts, and deletes summaries by session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-summary" }));
    const summaries = new SessionSummaryRepo(repo);

    summaries.saveRecord({
      id: "summary-imported",
      sessionId: "session-summary",
      filesChanged: 1,
      additions: 2,
      deletions: 3,
      latestStage: "quick_plan",
      updatedAt: "2026-05-10T02:00:00.000Z",
    });

    expect(summaries.listBySession("session-summary").map((summary) => summary.id)).toEqual(["summary-imported"]);
    expect(summaries.deleteBySession("session-summary")).toBe(1);
    expect(summaries.listBySession("session-summary")).toHaveLength(0);
  });
```

`packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts`:

```ts
  it("upserts imported checkpoints and deletes checkpoints by session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-checkpoint" }));
    const checkpoints = new SessionCheckpointsRepo(repo);

    checkpoints.saveRecord({
      id: "checkpoint-imported",
      sessionId: "session-checkpoint",
      checkpointType: "post_workflow",
      lane: "quick",
      stage: "quick_plan",
      summarySnapshotJson: { filesChanged: 1 },
      workflowSnapshotJson: {},
      continuationJson: {},
      metadataJson: {},
      createdAt: "2026-05-10T02:00:00.000Z",
    });

    expect(checkpoints.listBySession("session-checkpoint")).toHaveLength(1);
    expect(checkpoints.deleteBySession("session-checkpoint")).toBe(1);
    expect(checkpoints.listBySession("session-checkpoint")).toHaveLength(0);
  });
```

`packages/storage/src/sqlite/repositories/session-revert-repo.test.ts`:

```ts
  it("lists, upserts, and deletes reverts by session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-revert" }));
    const reverts = new SessionRevertRepo(repo);

    reverts.saveRecord({
      id: "revert-imported",
      sessionId: "session-revert",
      checkpointId: "checkpoint-imported",
      reason: "imported",
      createdAt: "2026-05-10T02:00:00.000Z",
    });

    expect(reverts.listBySession("session-revert").map((revert) => revert.id)).toEqual(["revert-imported"]);
    expect(reverts.deleteBySession("session-revert")).toBe(1);
    expect(reverts.listBySession("session-revert")).toHaveLength(0);
  });
```

- [ ] **Step 6: Run failing child repository tests**

Run:

```bash
npm test -- session-runtime-events-repo session-summary-repo session-checkpoints-repo session-revert-repo
```

Expected: FAIL because the new helper methods do not exist.

- [ ] **Step 7: Implement child repository helpers**

Implement `saveRecord(record)` as an upsert by primary id in each child repository. For example, in `SessionRuntimeEventsRepo`:

```ts
  saveRecord(record: SessionRuntimeEventRecord): SessionRuntimeEventRecord {
    const database = openDhDatabase(this.repoRoot);
    database.prepare(`
      INSERT INTO session_runtime_events (
        id, session_id, event_type, event_json, created_at
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        session_id = excluded.session_id,
        event_type = excluded.event_type,
        event_json = excluded.event_json,
        created_at = excluded.created_at
    `).run(
      record.id,
      record.sessionId,
      record.eventType,
      JSON.stringify(record.eventJson),
      record.createdAt,
    );
    return record;
  }

  deleteBySession(sessionId: string): number {
    const database = openDhDatabase(this.repoRoot);
    return database.prepare("DELETE FROM session_runtime_events WHERE session_id = ?").run(sessionId).changes;
  }
```

Use the same pattern for summaries, checkpoints, and reverts. Add `listBySession(sessionId)` to `SessionSummaryRepo` and `SessionRevertRepo` using `ORDER BY updated_at DESC, rowid DESC` for summaries and `ORDER BY created_at DESC, rowid DESC` for reverts.

- [ ] **Step 8: Run passing repository tests**

Run:

```bash
npm test -- repos session-runtime-events-repo session-summary-repo session-checkpoints-repo session-revert-repo
```

Expected: PASS.

- [ ] **Step 9: Commit storage helpers**

Run:

```bash
git add packages/storage/src/sqlite/repositories/sessions-repo.ts packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts packages/storage/src/sqlite/repositories/session-summary-repo.ts packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts packages/storage/src/sqlite/repositories/session-revert-repo.ts packages/storage/src/sqlite/repositories/repos.test.ts packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts packages/storage/src/sqlite/repositories/session-summary-repo.test.ts packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts packages/storage/src/sqlite/repositories/session-revert-repo.test.ts
git commit -m "feat: add session storage management helpers"
```

## Task 2: Shared Session Product Types

**Files:**

- Modify: `packages/shared/src/types/session.ts`

- [ ] **Step 1: Add shared type definitions**

Modify `packages/shared/src/types/session.ts` to import child record types and add these exports after `SessionState`:

```ts
import type {
  SessionCheckpointRecord,
  SessionRevertRecord,
  SessionRuntimeEventRecord,
  SessionSummaryRecord,
} from "./session-runtime.js";
```

```ts
export const SESSION_EXPORT_SCHEMA_VERSION = 1 as const;

export type SessionExportSchemaVersion = typeof SESSION_EXPORT_SCHEMA_VERSION;

export type SessionExportSource = {
  product: "dh";
  version: string;
  repoRoot: string;
};

export type SessionExportPayload = {
  session: SessionState;
  runtimeEvents: SessionRuntimeEventRecord[];
  summaries: SessionSummaryRecord[];
  checkpoints: SessionCheckpointRecord[];
  reverts: SessionRevertRecord[];
};

export type SessionExportDocument = {
  schemaVersion: SessionExportSchemaVersion;
  exportedAt: string;
  source: SessionExportSource;
  sanitized: boolean;
  payload: SessionExportPayload;
};

export type SessionListReport = {
  sessions: SessionState[];
};

export type SessionShowReport = {
  session: SessionState;
  latestSummary?: SessionSummaryRecord;
  counts: {
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionImportReport = {
  sessionId: string;
  imported: {
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionDeleteReport = {
  sessionId: string;
  deleted: {
    session: number;
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionForkReport = {
  sourceSessionId: string;
  sessionId: string;
  copied: {
    runtimeEvents: number;
    summaries: number;
    checkpoints: number;
    reverts: number;
  };
};

export type SessionStatsBucket = {
  key: string;
  count: number;
};

export type SessionStatsReport = {
  generatedAt: string;
  days?: number;
  totalSessions: number;
  sessionsByLane: SessionStatsBucket[];
  sessionsByStatus: SessionStatsBucket[];
  runtimeEventsByType: SessionStatsBucket[];
  topModels: SessionStatsBucket[];
  topTools: SessionStatsBucket[];
  tokenUsage: "unavailable" | {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  costUsd: "unavailable" | number;
};
```

- [ ] **Step 2: Run type check**

Run:

```bash
npm run check
```

Expected: PASS because these are type-only exports.

- [ ] **Step 3: Commit shared types**

Run:

```bash
git add packages/shared/src/types/session.ts
git commit -m "feat: define session product DTOs"
```

## Task 3: Query, Export, And Sanitization Services

**Files:**

- Create: `packages/runtime/src/session/session-query.ts`
- Create: `packages/runtime/src/session/session-query.test.ts`
- Create: `packages/runtime/src/session/session-export.ts`
- Create: `packages/runtime/src/session/session-export.test.ts`

- [ ] **Step 1: Write failing query service tests**

Create `packages/runtime/src/session/session-query.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { listSessions, showSession } from "./session-query.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-query-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: overrides.activeWorkItemIds ?? [],
    semanticMode: overrides.semanticMode ?? "auto",
    toolEnforcementLevel: overrides.toolEnforcementLevel ?? "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session query service", () => {
  it("lists sessions through the repository order", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    sessions.save(makeSession(repo, { sessionId: "older", updatedAt: "2026-05-10T01:00:00.000Z" }));
    sessions.save(makeSession(repo, { sessionId: "newer", updatedAt: "2026-05-10T02:00:00.000Z" }));

    expect(listSessions(repo, { limit: 1 }).sessions.map((session) => session.sessionId)).toEqual(["newer"]);
  });

  it("shows latest summary and dependent row counts", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-show" }));
    new SessionSummaryRepo(repo).save({ sessionId: "session-show", filesChanged: 1, additions: 2, deletions: 3 });
    new SessionRuntimeEventsRepo(repo).save({ sessionId: "session-show", eventType: "text.delta", eventJson: { payload: { text: "hi" } } });

    const report = showSession(repo, "session-show");

    expect(report.session.sessionId).toBe("session-show");
    expect(report.latestSummary?.filesChanged).toBe(1);
    expect(report.counts.runtimeEvents).toBe(1);
    expect(report.counts.summaries).toBe(1);
  });

  it("throws for missing sessions", () => {
    const repo = makeRepo();
    expect(() => showSession(repo, "missing")).toThrow("Session 'missing' was not found.");
  });
});
```

- [ ] **Step 2: Run failing query test**

Run:

```bash
npm test -- session-query
```

Expected: FAIL because `session-query.ts` does not exist.

- [ ] **Step 3: Implement query service**

Create `packages/runtime/src/session/session-query.ts`:

```ts
import type { SessionListReport, SessionShowReport } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function listSessions(repoRoot: string, input: { limit?: number } = {}): SessionListReport {
  return {
    sessions: new SessionsRepo(repoRoot).list({ limit: input.limit ?? 20 }),
  };
}

export function showSession(repoRoot: string, sessionId: string): SessionShowReport {
  const sessionsRepo = new SessionsRepo(repoRoot);
  const session = sessionsRepo.findById(sessionId);
  if (!session) {
    throw new Error(`Session '${sessionId}' was not found.`);
  }

  const runtimeEvents = new SessionRuntimeEventsRepo(repoRoot).listBySession(sessionId);
  const summaries = new SessionSummaryRepo(repoRoot).listBySession(sessionId);
  const checkpoints = new SessionCheckpointsRepo(repoRoot).listBySession(sessionId);
  const reverts = new SessionRevertRepo(repoRoot).listBySession(sessionId);

  return {
    session,
    latestSummary: summaries[0],
    counts: {
      runtimeEvents: runtimeEvents.length,
      summaries: summaries.length,
      checkpoints: checkpoints.length,
      reverts: reverts.length,
    },
  };
}
```

- [ ] **Step 4: Run passing query test**

Run:

```bash
npm test -- session-query
```

Expected: PASS.

- [ ] **Step 5: Write failing export/sanitize tests**

Create `packages/runtime/src/session/session-export.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { buildSessionExport } from "./session-export.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-export-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-export",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session export service", () => {
  it("exports the requested session with dependent rows", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({
      sessionId: "session-export",
      eventType: "message.started",
      eventJson: { payload: { model: "openai/gpt-5" } },
    });

    const exported = buildSessionExport(repo, { sessionId: "session-export", version: "test" });

    expect(exported.schemaVersion).toBe(1);
    expect(exported.source.product).toBe("dh");
    expect(exported.payload.session.sessionId).toBe("session-export");
    expect(exported.payload.runtimeEvents).toHaveLength(1);
  });

  it("exports the latest session when no session id is provided", () => {
    const repo = makeRepo();
    const sessions = new SessionsRepo(repo);
    sessions.save(makeSession(repo, { sessionId: "older", updatedAt: "2026-05-10T01:00:00.000Z" }));
    sessions.save(makeSession(repo, { sessionId: "newer", updatedAt: "2026-05-10T02:00:00.000Z" }));

    expect(buildSessionExport(repo, { version: "test" }).payload.session.sessionId).toBe("newer");
  });

  it("sanitizes secrets, paths, file contents, and commands while preserving shape", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({
      sessionId: "session-export",
      eventType: "tool.started",
      eventJson: {
        payload: {
          api_key: "sk-secret",
          path: path.join(repo, "README.md"),
          content: "private file body",
          command: "curl -H Authorization: bearer-secret https://example.test",
        },
      },
    });

    const exported = buildSessionExport(repo, { sessionId: "session-export", version: "test", sanitize: true });
    const text = JSON.stringify(exported);

    expect(exported.sanitized).toBe(true);
    expect(text).toContain("[REDACTED_SECRET]");
    expect(text).toContain("[REDACTED_PATH]");
    expect(text).toContain("[REDACTED_FILE_CONTENT]");
    expect(text).toContain("[REDACTED_COMMAND]");
    expect(text).not.toContain("sk-secret");
    expect(text).not.toContain("private file body");
  });
});
```

- [ ] **Step 6: Run failing export test**

Run:

```bash
npm test -- session-export
```

Expected: FAIL because `session-export.ts` does not exist.

- [ ] **Step 7: Implement export and sanitization service**

Create `packages/runtime/src/session/session-export.ts`:

```ts
import os from "node:os";
import type { SessionExportDocument } from "../../../shared/src/types/session.js";
import { SESSION_EXPORT_SCHEMA_VERSION } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function buildSessionExport(repoRoot: string, input: {
  sessionId?: string;
  version: string;
  sanitize?: boolean;
}): SessionExportDocument {
  const sessionsRepo = new SessionsRepo(repoRoot);
  const session = input.sessionId ? sessionsRepo.findById(input.sessionId) : sessionsRepo.findLatest();
  if (!session) {
    throw new Error(input.sessionId ? `Session '${input.sessionId}' was not found.` : "No session is available to export.");
  }

  const document: SessionExportDocument = {
    schemaVersion: SESSION_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    source: {
      product: "dh",
      version: input.version,
      repoRoot,
    },
    sanitized: Boolean(input.sanitize),
    payload: {
      session,
      runtimeEvents: new SessionRuntimeEventsRepo(repoRoot).listBySession(session.sessionId),
      summaries: new SessionSummaryRepo(repoRoot).listBySession(session.sessionId),
      checkpoints: new SessionCheckpointsRepo(repoRoot).listBySession(session.sessionId),
      reverts: new SessionRevertRepo(repoRoot).listBySession(session.sessionId),
    },
  };

  return input.sanitize ? sanitizeSessionExport(document, repoRoot) : document;
}

export function sanitizeSessionExport(document: SessionExportDocument, repoRoot: string): SessionExportDocument {
  return redactValue(document, repoRoot) as SessionExportDocument;
}

function redactValue(value: unknown, repoRoot: string, key = ""): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, repoRoot, key));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [
        entryKey,
        redactValue(entryValue, repoRoot, entryKey),
      ]),
    );
  }
  if (typeof value !== "string") {
    return value;
  }
  if (isSecretKey(key) || containsSecret(value)) {
    return "[REDACTED_SECRET]";
  }
  if (isCommandKey(key)) {
    return "[REDACTED_COMMAND]";
  }
  if (isFileContentKey(key)) {
    return "[REDACTED_FILE_CONTENT]";
  }
  if (isPathLike(value, repoRoot)) {
    return "[REDACTED_PATH]";
  }
  return value;
}

function isSecretKey(key: string): boolean {
  return /api[_-]?key|token|authorization|secret|password/i.test(key);
}

function containsSecret(value: string): boolean {
  return /bearer\s+[a-z0-9._-]+|sk-[a-z0-9._-]+/i.test(value);
}

function isCommandKey(key: string): boolean {
  return /command|cmd|shell/i.test(key);
}

function isFileContentKey(key: string): boolean {
  return /content|fileContent|body/i.test(key);
}

function isPathLike(value: string, repoRoot: string): boolean {
  const home = os.homedir();
  return value.startsWith(repoRoot) || value.startsWith(home);
}
```

- [ ] **Step 8: Run passing query/export tests**

Run:

```bash
npm test -- session-query session-export
```

Expected: PASS.

- [ ] **Step 9: Commit query/export services**

Run:

```bash
git add packages/runtime/src/session/session-query.ts packages/runtime/src/session/session-query.test.ts packages/runtime/src/session/session-export.ts packages/runtime/src/session/session-export.test.ts
git commit -m "feat: add session query and export services"
```

## Task 4: Import, Delete, And Fork Services

**Files:**

- Create: `packages/runtime/src/session/session-import.ts`
- Create: `packages/runtime/src/session/session-import.test.ts`
- Create: `packages/runtime/src/session/session-delete.ts`
- Create: `packages/runtime/src/session/session-delete.test.ts`
- Create: `packages/runtime/src/session/session-fork.ts`
- Create: `packages/runtime/src/session/session-fork.test.ts`

- [ ] **Step 1: Write failing import tests**

Create `packages/runtime/src/session/session-import.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionExportDocument, SessionState } from "../../../shared/src/types/session.js";
import { importSessionDocument, parseSessionExportJson } from "./session-import.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-import-"));
  repos.push(repo);
  return repo;
}

function makeDocument(repoRoot: string): SessionExportDocument {
  const session: SessionState = {
    sessionId: "session-import",
    repoRoot: "/old/repo",
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "in_progress",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
  return {
    schemaVersion: 1,
    exportedAt: "2026-05-10T00:00:00.000Z",
    source: { product: "dh", version: "test", repoRoot },
    sanitized: false,
    payload: {
      session,
      runtimeEvents: [{
        id: "event-import",
        sessionId: "session-import",
        eventType: "text.delta",
        eventJson: { payload: { text: "hello" } },
        createdAt: "2026-05-10T00:00:01.000Z",
      }],
      summaries: [],
      checkpoints: [],
      reverts: [],
    },
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session import service", () => {
  it("imports a version 1 export into the current repo root", () => {
    const repo = makeRepo();
    const report = importSessionDocument(repo, makeDocument(repo));

    expect(report.sessionId).toBe("session-import");
    expect(report.imported.runtimeEvents).toBe(1);
    expect(new SessionsRepo(repo).findById("session-import")?.repoRoot).toBe(repo);
    expect(new SessionRuntimeEventsRepo(repo).listBySession("session-import")).toHaveLength(1);
  });

  it("parses valid JSON and rejects malformed JSON", () => {
    expect(parseSessionExportJson(JSON.stringify(makeDocument("/repo"))).schemaVersion).toBe(1);
    expect(() => parseSessionExportJson("{")).toThrow("Could not parse session export JSON:");
  });

  it("rejects future schema versions", () => {
    const document = { ...makeDocument("/repo"), schemaVersion: 2 };
    expect(() => importSessionDocument(makeRepo(), document)).toThrow("Unsupported session export schema version 2. This DH build supports version 1.");
  });
});
```

- [ ] **Step 2: Run failing import test**

Run:

```bash
npm test -- session-import
```

Expected: FAIL because `session-import.ts` does not exist.

- [ ] **Step 3: Implement import service**

Create `packages/runtime/src/session/session-import.ts`:

```ts
import type { SessionExportDocument, SessionImportReport } from "../../../shared/src/types/session.js";
import { SESSION_EXPORT_SCHEMA_VERSION } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function parseSessionExportJson(text: string): SessionExportDocument {
  try {
    return JSON.parse(text) as SessionExportDocument;
  } catch (error) {
    throw new Error(`Could not parse session export JSON: ${(error as Error).message}`);
  }
}

export function importSessionDocument(repoRoot: string, document: unknown): SessionImportReport {
  assertSessionExportDocument(document);
  const session = {
    ...document.payload.session,
    repoRoot,
  };

  new SessionsRepo(repoRoot).save(session);
  const runtimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  const summaryRepo = new SessionSummaryRepo(repoRoot);
  const checkpointsRepo = new SessionCheckpointsRepo(repoRoot);
  const revertRepo = new SessionRevertRepo(repoRoot);

  for (const event of document.payload.runtimeEvents) runtimeEventsRepo.saveRecord({ ...event, sessionId: session.sessionId });
  for (const summary of document.payload.summaries) summaryRepo.saveRecord({ ...summary, sessionId: session.sessionId });
  for (const checkpoint of document.payload.checkpoints) checkpointsRepo.saveRecord({ ...checkpoint, sessionId: session.sessionId });
  for (const revert of document.payload.reverts) revertRepo.saveRecord({ ...revert, sessionId: session.sessionId });

  return {
    sessionId: session.sessionId,
    imported: {
      runtimeEvents: document.payload.runtimeEvents.length,
      summaries: document.payload.summaries.length,
      checkpoints: document.payload.checkpoints.length,
      reverts: document.payload.reverts.length,
    },
  };
}

function assertSessionExportDocument(value: unknown): asserts value is SessionExportDocument {
  const candidate = value as Partial<SessionExportDocument>;
  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid session export: expected an object.");
  }
  if (candidate.schemaVersion !== SESSION_EXPORT_SCHEMA_VERSION) {
    throw new Error(`Unsupported session export schema version ${String(candidate.schemaVersion)}. This DH build supports version 1.`);
  }
  if (!candidate.payload?.session?.sessionId) {
    throw new Error("Invalid session export: payload.session.sessionId is required.");
  }
  if (!Array.isArray(candidate.payload.runtimeEvents) || !Array.isArray(candidate.payload.summaries) || !Array.isArray(candidate.payload.checkpoints) || !Array.isArray(candidate.payload.reverts)) {
    throw new Error("Invalid session export: payload child collections must be arrays.");
  }
}
```

- [ ] **Step 4: Write failing delete/fork tests**

Create `packages/runtime/src/session/session-delete.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { deleteSession } from "./session-delete.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-delete-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string): SessionState {
  return {
    sessionId: "session-delete",
    repoRoot,
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "in_progress",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session delete service", () => {
  it("deletes a session and dependent runtime rows", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({ sessionId: "session-delete", eventType: "text.delta", eventJson: {} });

    const report = deleteSession(repo, "session-delete");

    expect(report.deleted.session).toBe(1);
    expect(report.deleted.runtimeEvents).toBe(1);
    expect(new SessionsRepo(repo).findById("session-delete")).toBeUndefined();
  });

  it("throws for missing sessions", () => {
    expect(() => deleteSession(makeRepo(), "missing")).toThrow("Session 'missing' was not found.");
  });
});
```

Create `packages/runtime/src/session/session-fork.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { forkSession } from "./session-fork.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-fork-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string): SessionState {
  return {
    sessionId: "session-source",
    repoRoot,
    lane: "quick",
    laneLocked: true,
    currentStage: "quick_plan",
    status: "complete",
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: ["work-1"],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session fork service", () => {
  it("forks metadata and runtime events into a new active session", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo));
    new SessionRuntimeEventsRepo(repo).save({ sessionId: "session-source", eventType: "text.delta", eventJson: { payload: { text: "source" } } });

    const report = forkSession(repo, "session-source", { title: "Forked title" });
    const forked = new SessionsRepo(repo).findById(report.sessionId);
    const events = new SessionRuntimeEventsRepo(repo).listBySession(report.sessionId);

    expect(report.sourceSessionId).toBe("session-source");
    expect(report.sessionId).not.toBe("session-source");
    expect(forked?.status).toBe("in_progress");
    expect(forked?.activeWorkItemIds).toEqual([]);
    expect(events.some((event) => event.eventType === "session.created")).toBe(true);
    expect(events.some((event) => JSON.stringify(event.eventJson).includes("session-source"))).toBe(true);
  });
});
```

- [ ] **Step 5: Run failing delete/fork tests**

Run:

```bash
npm test -- session-delete session-fork
```

Expected: FAIL because `session-delete.ts` and `session-fork.ts` do not exist.

- [ ] **Step 6: Implement delete service**

Create `packages/runtime/src/session/session-delete.ts`:

```ts
import type { SessionDeleteReport } from "../../../shared/src/types/session.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function deleteSession(repoRoot: string, sessionId: string): SessionDeleteReport {
  const sessionsRepo = new SessionsRepo(repoRoot);
  if (!sessionsRepo.findById(sessionId)) {
    throw new Error(`Session '${sessionId}' was not found.`);
  }

  const runtimeEvents = new SessionRuntimeEventsRepo(repoRoot).deleteBySession(sessionId);
  const summaries = new SessionSummaryRepo(repoRoot).deleteBySession(sessionId);
  const checkpoints = new SessionCheckpointsRepo(repoRoot).deleteBySession(sessionId);
  const reverts = new SessionRevertRepo(repoRoot).deleteBySession(sessionId);
  const session = sessionsRepo.deleteById(sessionId);

  return {
    sessionId,
    deleted: { session, runtimeEvents, summaries, checkpoints, reverts },
  };
}
```

- [ ] **Step 7: Implement fork service**

Create `packages/runtime/src/session/session-fork.ts`:

```ts
import type { SessionForkReport } from "../../../shared/src/types/session.js";
import { createId } from "../../../shared/src/utils/ids.js";
import { nowIso } from "../../../shared/src/utils/time.js";
import { SessionCheckpointsRepo } from "../../../storage/src/sqlite/repositories/session-checkpoints-repo.js";
import { SessionRevertRepo } from "../../../storage/src/sqlite/repositories/session-revert-repo.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionSummaryRepo } from "../../../storage/src/sqlite/repositories/session-summary-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function forkSession(repoRoot: string, sourceSessionId: string, input: { title?: string } = {}): SessionForkReport {
  const sessionsRepo = new SessionsRepo(repoRoot);
  const source = sessionsRepo.findById(sourceSessionId);
  if (!source) {
    throw new Error(`Session '${sourceSessionId}' was not found.`);
  }

  const sessionId = createId("session");
  const timestamp = nowIso();
  sessionsRepo.save({
    ...source,
    sessionId,
    status: "in_progress",
    activeWorkItemIds: [],
    latestSummaryId: undefined,
    latestCheckpointId: undefined,
    latestRevertId: undefined,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  const runtimeEventsRepo = new SessionRuntimeEventsRepo(repoRoot);
  const summaryRepo = new SessionSummaryRepo(repoRoot);
  const checkpointsRepo = new SessionCheckpointsRepo(repoRoot);
  const revertRepo = new SessionRevertRepo(repoRoot);

  const runtimeEvents = runtimeEventsRepo.listBySession(sourceSessionId);
  const summaries = summaryRepo.listBySession(sourceSessionId);
  const checkpoints = checkpointsRepo.listBySession(sourceSessionId);
  const reverts = revertRepo.listBySession(sourceSessionId);

  for (const event of runtimeEvents) {
    runtimeEventsRepo.saveRecord({ ...event, id: createId("session-runtime-event"), sessionId });
  }
  for (const summary of summaries) {
    summaryRepo.saveRecord({ ...summary, id: createId("session-summary"), sessionId });
  }
  for (const checkpoint of checkpoints) {
    checkpointsRepo.saveRecord({ ...checkpoint, id: createId("session-checkpoint"), sessionId });
  }
  for (const revert of reverts) {
    revertRepo.saveRecord({ ...revert, id: createId("session-revert"), sessionId });
  }

  runtimeEventsRepo.save({
    sessionId,
    eventType: "session.created",
    eventJson: {
      type: "session.created",
      sessionId,
      payload: {
        commandFamily: "session",
        forkedFromSessionId: sourceSessionId,
        title: input.title,
      },
    },
    createdAt: timestamp,
  });

  return {
    sourceSessionId,
    sessionId,
    copied: {
      runtimeEvents: runtimeEvents.length,
      summaries: summaries.length,
      checkpoints: checkpoints.length,
      reverts: reverts.length,
    },
  };
}
```

- [ ] **Step 8: Run passing import/delete/fork tests**

Run:

```bash
npm test -- session-import session-delete session-fork
```

Expected: PASS.

- [ ] **Step 9: Commit import/delete/fork services**

Run:

```bash
git add packages/runtime/src/session/session-import.ts packages/runtime/src/session/session-import.test.ts packages/runtime/src/session/session-delete.ts packages/runtime/src/session/session-delete.test.ts packages/runtime/src/session/session-fork.ts packages/runtime/src/session/session-fork.test.ts
git commit -m "feat: add session import delete and fork services"
```

## Task 5: Session Stats Service

**Files:**

- Create: `packages/runtime/src/session/session-stats.ts`
- Create: `packages/runtime/src/session/session-stats.test.ts`

- [ ] **Step 1: Write failing stats tests**

Create `packages/runtime/src/session/session-stats.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { closeDhDatabase } from "../../../storage/src/sqlite/db.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";
import type { SessionState } from "../../../shared/src/types/session.js";
import { buildSessionStats } from "./session-stats.js";

const repos: string[] = [];

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "dh-session-stats-"));
  repos.push(repo);
  return repo;
}

function makeSession(repoRoot: string, overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-stats",
    repoRoot,
    lane: overrides.lane ?? "quick",
    laneLocked: true,
    currentStage: overrides.currentStage ?? "quick_plan",
    status: overrides.status ?? "in_progress",
    createdAt: overrides.createdAt ?? "2026-05-10T00:00:00.000Z",
    updatedAt: overrides.updatedAt ?? "2026-05-10T00:00:00.000Z",
    activeWorkItemIds: [],
    semanticMode: "auto",
    toolEnforcementLevel: "very-hard",
  };
}

afterEach(() => {
  vi.useRealTimers();
  for (const repo of repos) closeDhDatabase(repo);
  repos.length = 0;
});

describe("session stats service", () => {
  it("aggregates sessions, runtime events, models, and tools", () => {
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-1", lane: "quick", status: "in_progress" }));
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "session-2", lane: "delivery", status: "complete" }));
    const events = new SessionRuntimeEventsRepo(repo);
    events.save({ sessionId: "session-1", eventType: "message.started", eventJson: { payload: { model: "openai/gpt-5" } } });
    events.save({ sessionId: "session-1", eventType: "tool.started", eventJson: { payload: { toolName: "read" } } });

    const stats = buildSessionStats(repo, { models: 3, tools: 3 });

    expect(stats.totalSessions).toBe(2);
    expect(stats.sessionsByLane).toContainEqual({ key: "quick", count: 1 });
    expect(stats.sessionsByStatus).toContainEqual({ key: "complete", count: 1 });
    expect(stats.runtimeEventsByType).toContainEqual({ key: "message.started", count: 1 });
    expect(stats.topModels).toEqual([{ key: "openai/gpt-5", count: 1 }]);
    expect(stats.topTools).toEqual([{ key: "read", count: 1 }]);
    expect(stats.tokenUsage).toBe("unavailable");
    expect(stats.costUsd).toBe("unavailable");
  });

  it("filters sessions by days using updatedAt", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-10T12:00:00.000Z"));
    const repo = makeRepo();
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "recent", updatedAt: "2026-05-10T00:00:00.000Z" }));
    new SessionsRepo(repo).save(makeSession(repo, { sessionId: "old", updatedAt: "2026-04-01T00:00:00.000Z" }));

    expect(buildSessionStats(repo, { days: 7 }).totalSessions).toBe(1);
  });
});
```

- [ ] **Step 2: Run failing stats test**

Run:

```bash
npm test -- session-stats
```

Expected: FAIL because `session-stats.ts` does not exist.

- [ ] **Step 3: Implement stats service**

Create `packages/runtime/src/session/session-stats.ts`:

```ts
import type { SessionRuntimeEventRecord } from "../../../shared/src/types/session-runtime.js";
import type { SessionState, SessionStatsBucket, SessionStatsReport } from "../../../shared/src/types/session.js";
import { SessionRuntimeEventsRepo } from "../../../storage/src/sqlite/repositories/session-runtime-events-repo.js";
import { SessionsRepo } from "../../../storage/src/sqlite/repositories/sessions-repo.js";

export function buildSessionStats(repoRoot: string, input: { days?: number; models?: number; tools?: number } = {}): SessionStatsReport {
  const sessions = filterByDays(new SessionsRepo(repoRoot).list({ limit: 10_000 }), input.days);
  const events = sessions.flatMap((session) => new SessionRuntimeEventsRepo(repoRoot).listBySession(session.sessionId));

  return {
    generatedAt: new Date().toISOString(),
    days: input.days,
    totalSessions: sessions.length,
    sessionsByLane: buckets(sessions.map((session) => session.lane)),
    sessionsByStatus: buckets(sessions.map((session) => session.status)),
    runtimeEventsByType: buckets(events.map((event) => event.eventType)),
    topModels: buckets(events.flatMap(readModel)).slice(0, input.models ?? 5),
    topTools: buckets(events.flatMap(readTool)).slice(0, input.tools ?? 5),
    tokenUsage: "unavailable",
    costUsd: "unavailable",
  };
}

function filterByDays(sessions: SessionState[], days: number | undefined): SessionState[] {
  if (!days) return sessions;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return sessions.filter((session) => Date.parse(session.updatedAt) >= cutoff);
}

function buckets(values: string[]): SessionStatsBucket[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function readModel(event: SessionRuntimeEventRecord): string[] {
  if (event.eventType !== "message.started") return [];
  const payload = readPayload(event);
  return typeof payload.model === "string" ? [payload.model] : [];
}

function readTool(event: SessionRuntimeEventRecord): string[] {
  if (event.eventType !== "tool.started") return [];
  const payload = readPayload(event);
  const tool = payload.toolName ?? payload.name;
  return typeof tool === "string" ? [tool] : [];
}

function readPayload(event: SessionRuntimeEventRecord): Record<string, unknown> {
  const payload = event.eventJson.payload;
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : event.eventJson;
}
```

- [ ] **Step 4: Run passing stats test**

Run:

```bash
npm test -- session-stats
```

Expected: PASS.

- [ ] **Step 5: Commit stats service**

Run:

```bash
git add packages/runtime/src/session/session-stats.ts packages/runtime/src/session/session-stats.test.ts
git commit -m "feat: add session stats service"
```

## Task 6: CLI Commands

**Files:**

- Create: `apps/cli/src/commands/session.ts`
- Create: `apps/cli/src/commands/session.test.ts`
- Create: `apps/cli/src/commands/export.ts`
- Create: `apps/cli/src/commands/export.test.ts`
- Create: `apps/cli/src/commands/import.ts`
- Create: `apps/cli/src/commands/import.test.ts`
- Create: `apps/cli/src/commands/stats.ts`
- Create: `apps/cli/src/commands/stats.test.ts`
- Modify: `apps/cli/src/commands/root.ts`
- Modify: `apps/cli/src/commands/root.test.ts`

- [ ] **Step 1: Write failing `dh session` CLI tests**

Create `apps/cli/src/commands/session.test.ts` with mocked runtime functions:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { runSessionCommand } from "./session.js";

afterEach(() => vi.restoreAllMocks());

describe("runSessionCommand", () => {
  it("renders list JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runSessionCommand(["list", "--json", "--limit", "1"], "/repo", {
      listSessions: () => ({ sessions: [] }),
      showSession: () => { throw new Error("unused"); },
      deleteSession: () => { throw new Error("unused"); },
      forkSession: () => { throw new Error("unused"); },
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0]))).toEqual({ sessions: [] });
  });

  it("guards delete without yes", async () => {
    const stderr = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const exitCode = await runSessionCommand(["delete", "session-1"], "/repo");

    expect(exitCode).toBe(1);
    expect(String(stderr.mock.calls[0]?.[0])).toContain("Refusing to delete session 'session-1' without --yes.");
  });

  it("renders fork JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runSessionCommand(["fork", "session-1", "--title", "Branch", "--json"], "/repo", {
      listSessions: () => ({ sessions: [] }),
      showSession: () => { throw new Error("unused"); },
      deleteSession: () => { throw new Error("unused"); },
      forkSession: () => ({ sourceSessionId: "session-1", sessionId: "session-2", copied: { runtimeEvents: 0, summaries: 0, checkpoints: 0, reverts: 0 } }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).sessionId).toBe("session-2");
  });
});
```

- [ ] **Step 2: Run failing session CLI test**

Run:

```bash
npm test -- session.test
```

Expected: FAIL because `apps/cli/src/commands/session.ts` does not exist.

- [ ] **Step 3: Implement `dh session` command**

Create `apps/cli/src/commands/session.ts`:

```ts
import { deleteSession } from "../../../../packages/runtime/src/session/session-delete.js";
import { forkSession } from "../../../../packages/runtime/src/session/session-fork.js";
import { listSessions, showSession } from "../../../../packages/runtime/src/session/session-query.js";

type SessionCommandDeps = {
  listSessions: typeof listSessions;
  showSession: typeof showSession;
  deleteSession: typeof deleteSession;
  forkSession: typeof forkSession;
};

const defaultDeps: SessionCommandDeps = { listSessions, showSession, deleteSession, forkSession };

export async function runSessionCommand(args: string[], repoRoot: string, deps: SessionCommandDeps = defaultDeps): Promise<number> {
  const [subcommand, ...rest] = args;
  try {
    if (subcommand === "list" || subcommand === undefined) return runList(rest, repoRoot, deps);
    if (subcommand === "show") return runShow(rest, repoRoot, deps);
    if (subcommand === "delete") return runDelete(rest, repoRoot, deps);
    if (subcommand === "fork") return runFork(rest, repoRoot, deps);
    throw new Error(`Unknown session command: ${subcommand}`);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function runList(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const json = args.includes("--json");
  const limit = readPositiveIntFlag(args, "--limit", 20);
  const report = deps.listSessions(repoRoot, { limit });
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderList(report.sessions)}\n`);
  return 0;
}

function runShow(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const json = args.includes("--json");
  const sessionId = args.find((arg) => !arg.startsWith("--"));
  if (!sessionId) throw new Error("dh session show requires <id>.");
  const report = deps.showSession(repoRoot, sessionId);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderShow(report)}\n`);
  return 0;
}

function runDelete(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const sessionId = args.find((arg) => !arg.startsWith("--"));
  if (!sessionId) throw new Error("dh session delete requires <id>.");
  if (!args.includes("--yes")) throw new Error(`Refusing to delete session '${sessionId}' without --yes.`);
  const report = deps.deleteSession(repoRoot, sessionId);
  process.stdout.write(`deleted session: ${report.sessionId}\n`);
  return 0;
}

function runFork(args: string[], repoRoot: string, deps: SessionCommandDeps): number {
  const json = args.includes("--json");
  const sessionId = args.find((arg) => !arg.startsWith("--"));
  if (!sessionId) throw new Error("dh session fork requires <id>.");
  const title = readStringFlag(args, "--title");
  const report = deps.forkSession(repoRoot, sessionId, { title });
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `forked session: ${report.sessionId}\n`);
  return 0;
}

function readPositiveIntFlag(args: string[], flag: string, fallback: number): number {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer.`);
  return value;
}

function readStringFlag(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new Error(`${flag} requires a value.`);
  return value;
}

function renderList(sessions: Array<{ sessionId: string; lane: string; status: string; currentStage: string; updatedAt: string }>): string {
  if (sessions.length === 0) return "no sessions";
  return ["SESSION ID  LANE  STATUS  STAGE  UPDATED", ...sessions.map((session) => `${session.sessionId}  ${session.lane}  ${session.status}  ${session.currentStage}  ${session.updatedAt}`)].join("\n");
}

function renderShow(report: ReturnType<typeof showSession>): string {
  return [
    `session: ${report.session.sessionId}`,
    `lane: ${report.session.lane}`,
    `status: ${report.session.status}`,
    `stage: ${report.session.currentStage}`,
    `runtime events: ${report.counts.runtimeEvents}`,
    `summaries: ${report.counts.summaries}`,
    `checkpoints: ${report.counts.checkpoints}`,
    `reverts: ${report.counts.reverts}`,
  ].join("\n");
}
```

- [ ] **Step 4: Write failing export/import/stats CLI tests**

Create compact command tests:

`apps/cli/src/commands/export.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { runExportCommand } from "./export.js";

afterEach(() => vi.restoreAllMocks());

describe("runExportCommand", () => {
  it("writes session export JSON to stdout", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runExportCommand(["session-1", "--sanitize"], "/repo", {
      buildSessionExport: () => ({ schemaVersion: 1, exportedAt: "now", source: { product: "dh", version: "test", repoRoot: "/repo" }, sanitized: true, payload: { session: { sessionId: "session-1" } as never, runtimeEvents: [], summaries: [], checkpoints: [], reverts: [] } }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).sanitized).toBe(true);
  });
});
```

`apps/cli/src/commands/import.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runImportCommand } from "./import.js";

afterEach(() => vi.restoreAllMocks());

describe("runImportCommand", () => {
  it("reads an export file and prints imported counts", async () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "dh-import-cli-")), "session.json");
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1 }));
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runImportCommand([file], "/repo", {
      parseSessionExportJson: () => ({ schemaVersion: 1 }) as never,
      importSessionDocument: () => ({ sessionId: "session-1", imported: { runtimeEvents: 1, summaries: 0, checkpoints: 0, reverts: 0 } }),
    });

    expect(exitCode).toBe(0);
    expect(String(stdout.mock.calls[0]?.[0])).toContain("imported session: session-1");
  });
});
```

`apps/cli/src/commands/stats.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { runStatsCommand } from "./stats.js";

afterEach(() => vi.restoreAllMocks());

describe("runStatsCommand", () => {
  it("renders stats JSON", async () => {
    const stdout = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitCode = await runStatsCommand(["--json", "--days", "7"], "/repo", {
      buildSessionStats: () => ({
        generatedAt: "now",
        days: 7,
        totalSessions: 1,
        sessionsByLane: [{ key: "quick", count: 1 }],
        sessionsByStatus: [{ key: "in_progress", count: 1 }],
        runtimeEventsByType: [],
        topModels: [],
        topTools: [],
        tokenUsage: "unavailable",
        costUsd: "unavailable",
      }),
    });

    expect(exitCode).toBe(0);
    expect(JSON.parse(String(stdout.mock.calls[0]?.[0])).totalSessions).toBe(1);
  });
});
```

- [ ] **Step 5: Run failing export/import/stats CLI tests**

Run:

```bash
npm test -- export.test import.test stats.test
```

Expected: FAIL because the command modules do not exist.

- [ ] **Step 6: Implement export/import/stats CLI modules**

Create `apps/cli/src/commands/export.ts`:

```ts
import { buildSessionExport } from "../../../../packages/runtime/src/session/session-export.js";
import { DH_VERSION } from "../version.js";

type ExportDeps = { buildSessionExport: typeof buildSessionExport };
const defaultDeps: ExportDeps = { buildSessionExport };

export async function runExportCommand(args: string[], repoRoot: string, deps: ExportDeps = defaultDeps): Promise<number> {
  try {
    const sanitize = args.includes("--sanitize");
    const sessionId = args.find((arg) => !arg.startsWith("--"));
    const document = deps.buildSessionExport(repoRoot, { sessionId, sanitize, version: DH_VERSION });
    process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}
```

Create `apps/cli/src/commands/import.ts`:

```ts
import fs from "node:fs";
import { importSessionDocument, parseSessionExportJson } from "../../../../packages/runtime/src/session/session-import.js";

type ImportDeps = {
  parseSessionExportJson: typeof parseSessionExportJson;
  importSessionDocument: typeof importSessionDocument;
};
const defaultDeps: ImportDeps = { parseSessionExportJson, importSessionDocument };

export async function runImportCommand(args: string[], repoRoot: string, deps: ImportDeps = defaultDeps): Promise<number> {
  try {
    const file = args[0];
    if (!file) throw new Error("dh import requires <file>.");
    const document = deps.parseSessionExportJson(fs.readFileSync(file, "utf8"));
    const report = deps.importSessionDocument(repoRoot, document);
    process.stdout.write([
      `imported session: ${report.sessionId}`,
      `runtime events: ${report.imported.runtimeEvents}`,
      `summaries: ${report.imported.summaries}`,
      `checkpoints: ${report.imported.checkpoints}`,
      `reverts: ${report.imported.reverts}`,
    ].join("\n") + "\n");
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}
```

Create `apps/cli/src/commands/stats.ts`:

```ts
import { buildSessionStats } from "../../../../packages/runtime/src/session/session-stats.js";
import type { SessionStatsReport } from "../../../../packages/shared/src/types/session.js";

type StatsDeps = { buildSessionStats: typeof buildSessionStats };
const defaultDeps: StatsDeps = { buildSessionStats };

export async function runStatsCommand(args: string[], repoRoot: string, deps: StatsDeps = defaultDeps): Promise<number> {
  try {
    const json = args.includes("--json");
    const report = deps.buildSessionStats(repoRoot, {
      days: readOptionalPositiveIntFlag(args, "--days"),
      models: readOptionalPositiveIntFlag(args, "--models"),
      tools: readOptionalPositiveIntFlag(args, "--tools"),
    });
    process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderStats(report)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    return 1;
  }
}

function readOptionalPositiveIntFlag(args: string[], flag: string): number | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${flag} requires a positive integer.`);
  return value;
}

function renderStats(report: SessionStatsReport): string {
  return [
    `sessions: ${report.totalSessions}`,
    `lanes: ${report.sessionsByLane.map((bucket) => `${bucket.key}=${bucket.count}`).join(", ") || "none"}`,
    `statuses: ${report.sessionsByStatus.map((bucket) => `${bucket.key}=${bucket.count}`).join(", ") || "none"}`,
    `models: ${report.topModels.map((bucket) => `${bucket.key}=${bucket.count}`).join(", ") || "none"}`,
    `tools: ${report.topTools.map((bucket) => `${bucket.key}=${bucket.count}`).join(", ") || "none"}`,
    `tokens: ${report.tokenUsage === "unavailable" ? "unavailable" : report.tokenUsage.totalTokens}`,
    `cost usd: ${report.costUsd}`,
  ].join("\n");
}
```

- [ ] **Step 7: Register commands in root**

Modify `apps/cli/src/commands/root.ts`:

```ts
import { runExportCommand } from "./export.js";
import { runImportCommand } from "./import.js";
import { runSessionCommand } from "./session.js";
import { runStatsCommand } from "./stats.js";
```

Add command cases:

```ts
    case "session":
      return runSessionCommand(rest, repoRoot);
    case "export":
      return runExportCommand(rest, repoRoot);
    case "import":
      return runImportCommand(rest, repoRoot);
    case "stats":
      return runStatsCommand(rest, repoRoot);
```

Add help lines near `run`:

```text
  session <list|show|delete|fork> [options]
  export [session-id] [--sanitize]
  import <file>
  stats [--days <n>] [--models <n>] [--tools <n>] [--json]
```

Extend `apps/cli/src/commands/root.test.ts` assertions:

```ts
    expect(output).toContain("session <list|show|delete|fork> [options]");
    expect(output).toContain("export [session-id] [--sanitize]");
    expect(output).toContain("import <file>");
    expect(output).toContain("stats [--days <n>] [--models <n>] [--tools <n>] [--json]");
```

- [ ] **Step 8: Run passing CLI tests**

Run:

```bash
npm test -- session.test export.test import.test stats.test root
```

Expected: PASS.

- [ ] **Step 9: Commit CLI commands**

Run:

```bash
git add apps/cli/src/commands/session.ts apps/cli/src/commands/session.test.ts apps/cli/src/commands/export.ts apps/cli/src/commands/export.test.ts apps/cli/src/commands/import.ts apps/cli/src/commands/import.test.ts apps/cli/src/commands/stats.ts apps/cli/src/commands/stats.test.ts apps/cli/src/commands/root.ts apps/cli/src/commands/root.test.ts
git commit -m "feat: add session product CLI commands"
```

## Task 7: Full Verification And Milestone Commit Check

**Files:**

- Verify all modified files from Tasks 1-6.

- [ ] **Step 1: Run focused acceptance tests**

Run:

```bash
npm test -- session session-export session-import session-delete session-fork session-stats stats root
```

Expected: PASS.

- [ ] **Step 2: Run type check**

Run:

```bash
npm run check
```

Expected: PASS.

- [ ] **Step 3: Run Rust session regression guard**

Run:

```bash
cargo test --manifest-path rust-engine/Cargo.toml -p dh-engine session_manager
```

Expected: PASS.

- [ ] **Step 4: Run manual local export/import smoke**

Use a temp repo that already has at least one DH session, or create one with:

```bash
cargo run -q -p dh-engine --manifest-path rust-engine/Cargo.toml -- run "session smoke" --workspace . --json
```

Then run:

```bash
node apps/cli/dist/index.js session list --json
node apps/cli/dist/index.js export --sanitize
node apps/cli/dist/index.js stats --json
```

Expected:

- `session list --json` prints a JSON object with `sessions`.
- `export --sanitize` prints schema version `1` and does not print raw secret-looking values.
- `stats --json` prints `totalSessions`.

If `apps/cli/dist/index.js` is not built in the repo workflow, use the existing local command invocation pattern from nearby release scripts or skip this smoke with an explicit note in the final report.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: only intentional milestone files are modified or untracked. The pre-existing `docs/scope/2026-05-10-delivery-request.md` remains untracked and untouched.

- [ ] **Step 6: Confirm no extra verification commit is needed**

Run:

```bash
git status --short
```

Expected: no extra commit is needed if implementation commits already cover all changes. If the command shows only `?? docs/scope/2026-05-10-delivery-request.md`, leave it untracked.
