# Solution Package: Cross-Surface Knowledge Session Persistence

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-cross-surface-knowledge-session-persistence.md`
**Blocked item:** `KB-P3-03` in `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
**Related context:**
- `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`
- `docs/solution/2026-04-11-session-backed-knowledge-command-bridge.md`
- `docs/solution/2026-04-11-session-runtime-selective-port-dh.md`
- `docs/opencode/session-runtime-selective-port-mapping-dh.md`

---

## Recommended Path

Use **additive shadow runtime surfaces for knowledge-command sessions**, plus one narrow runtime adapter that writes compaction and continuation metadata to those knowledge-owned surfaces without changing the existing lane-session tables.

This is enough for `KB-P3-03` because DH reality is already clear:

- `knowledge_command_sessions` is a separate persistence surface.
- `session_runtime_events` and `session_summaries` are foreign-keyed to `sessions`.
- `run-knowledge-command.ts` already has create/resume linkage and in-memory compaction preflight.
- The blocker is persistence linkage, not missing compaction logic and not missing lane workflow semantics.

The narrowest honest solution is therefore to preserve current lane tables unchanged, add knowledge-command equivalents for the blocked metadata, and keep the bridge command-scoped.

---

## Repository Reality Snapshot

1. `packages/storage/src/sqlite/db.ts` defines:
   - `sessions`
   - `session_runtime_events` with `FOREIGN KEY (session_id) REFERENCES sessions (session_id)`
   - `session_summaries` with `FOREIGN KEY (session_id) REFERENCES sessions (session_id)`
   - `knowledge_command_sessions` with no linkage into the lane-session tables

2. `packages/runtime/src/session/knowledge-command-session-bridge.ts` currently:
   - resolves create/resume against `knowledge_command_sessions`
   - runs `compactSessionContext(...)`
   - records only bridge-local last-run fields
   - reports `continuationSummaryGeneratedInMemory`, which correctly does **not** imply persistence

3. `packages/runtime/src/session/session-compaction.ts` and `packages/runtime/src/session/session-summary.ts` already exist and can be reused as logic helpers.

4. `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts` and `packages/storage/src/sqlite/repositories/session-summary-repo.ts` assume a lane-session `sessionId` and therefore cannot be used directly by the knowledge bridge under the current schema contract.

---

## Architecture Decisions

### AD-1: Keep lane-session runtime tables authoritative for lane sessions only

Do not weaken or reinterpret the existing foreign keys on:

- `session_runtime_events`
- `session_summaries`

These surfaces already serve lane-session consumers and are explicitly tied to `sessions`. `KB-P3-03` should not change that contract.

### AD-2: Introduce knowledge-owned shadow surfaces instead of coercing knowledge sessions into lane sessions

Create additive runtime surfaces owned by `knowledge_command_sessions`, not by `sessions`.

Recommended shape:

- `knowledge_command_runtime_events`
- `knowledge_command_summaries`

These should mirror only the subset of event/summary semantics that knowledge commands actually need:

- compaction execution metadata
- continuation summary metadata
- latest resume-visible summary state for the knowledge session

This avoids converting knowledge-command sessions into full lane sessions and stays inside the approved scope boundary.

### AD-3: Use one bridge-level cross-surface persistence contract

Add one runtime-facing contract for the knowledge bridge to call after compaction/resume decisions are made.

That contract should own:

- writing the knowledge runtime event row(s)
- writing the knowledge summary row
- returning a single success/failure result to the bridge

The bridge should not call lane-session repos directly once this contract exists.

### AD-4: Treat compaction event persistence and continuation summary persistence as one unit of work

For `KB-P3-03`, partial success is the wrong contract. If compaction runs and produces a continuation summary, the event row and summary row should be treated as one persistence outcome.

Recommended rule:

- if both writes succeed, the bridge may report persisted cross-surface state
- if either write fails, the bridge must treat cross-surface persistence as failed for that command run

This matches the scope requirement to avoid ambiguous partial persistence.

### AD-5: Keep knowledge summary semantics narrow and additive

Knowledge-command summaries should not pretend to be lane summaries. In particular, they should not require lane-only fields such as workflow stage advancement unless those values are genuinely meaningful.

The knowledge summary should focus on:

- `knowledgeSessionId`
- latest command kind
- latest run time
- whether compaction ran
- persisted continuation summary text when generated
- optional compacted context anchors that are truly resume-relevant

### AD-6: Preserve current command behavior when persistence is unavailable, but do not over-claim persistence success

The bridge may still execute retrieval and in-memory compaction logic when the knowledge session itself is valid, but it must not claim that cross-surface persistence succeeded when the write contract fails.

Binary downstream expectation:

- **Valid session + successful cross-surface write:** persisted metadata is available for resume/history.
- **Valid session + failed cross-surface write:** command may still complete, but the result must remain non-persisted for KB-P3-03 purposes and should surface an additive warning/result flag.
- **Invalid or unlinked session:** fail fast; do not attempt partial event/summary writes.

---

## FK Boundary Options

### Option A — Recommended: additive shadow surfaces keyed to `knowledge_command_sessions`

**Shape**
- add `knowledge_command_runtime_events`
- add `knowledge_command_summaries`
- each table foreign-keys to `knowledge_command_sessions(session_id)`
- add dedicated repos and a bridge persistence adapter

**Why this is recommended**
- preserves existing lane-session consumers unchanged
- avoids lane-semantic drift
- avoids forcing a knowledge session into `sessions`
- matches the scope's additive intent
- keeps the solution narrow to `KB-P3-03`

**Trade-off**
- runtime history now exists in two parallel families of tables
- any unified reporting later would need an adapter/read model

### Option B — Alternative: mapping table from knowledge sessions to surrogate `sessions` rows

**Shape**
- create a mapping table from `knowledge_command_sessions` to a synthetic row in `sessions`
- keep writing to existing `session_runtime_events` and `session_summaries`

**Why it is less suitable now**
- effectively creates lane-session shells for command-scoped work
- pulls lane-owned fields (`lane`, `current_stage`, `semantic_mode`, etc.) into a path that does not own them
- increases the chance of scope drift into session redesign

### Option C — Alternative: polymorphic ownership in existing runtime tables

**Shape**
- widen `session_runtime_events` and `session_summaries` to support owner type / owner id instead of FK only to `sessions`

**Why it is less suitable now**
- touches the core lane-session contract directly
- requires repo and type changes across existing consumers
- creates more review and migration risk than `KB-P3-03` needs

### Decision

Choose **Option A** unless implementation discovers a hard repository constraint that makes additive shadow tables impossible. Options B and C are broader than this blocker requires.

---

## Likely Target Files and Modules

### Existing files likely to change

| File | Why it changes |
|---|---|
| `packages/storage/src/sqlite/db.ts` | Add additive knowledge-command runtime event and summary tables, indexes, and FK ownership to `knowledge_command_sessions` |
| `packages/runtime/src/session/knowledge-command-session-bridge.ts` | Replace in-memory-only persistence semantics with a bridge call that records compaction/continuation metadata across the approved knowledge surfaces |
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` | Thread bridge persistence result into the command report without changing existing retrieval behavior |
| `packages/shared/src/types/session-runtime.ts` | Add additive shared record types only if the new repos/adapters need exported contracts |
| `packages/runtime/src/session/session-summary.ts` | Reuse or minimally adapt summary-building helpers for knowledge-session summary shape |
| `packages/runtime/src/session/session-compaction.ts` | Reuse existing compaction result shape; only extend if a persisted-anchor contract genuinely needs it |

### New files likely required

| File | Responsibility |
|---|---|
| `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.ts` | Persistence for knowledge-command runtime event history |
| `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.test.ts` | Repo tests for event writes and lookups |
| `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.ts` | Persistence for latest knowledge continuation/summary state |
| `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.test.ts` | Repo tests for summary upsert/latest lookup behavior |
| `packages/runtime/src/session/knowledge-command-runtime-persistence.ts` | Narrow adapter/unit-of-work for event + summary persistence |
| `packages/runtime/src/session/knowledge-command-runtime-persistence.test.ts` | Contract tests for success/failure/rollback semantics |

### Existing tests likely to expand

| File | Why it changes |
|---|---|
| `packages/runtime/src/session/knowledge-command-session-bridge.test.ts` | Add coverage for persisted compaction/continuation success and failure semantics |
| `packages/opencode-app/src/workflows/run-knowledge-command.test.ts` | Verify report behavior when cross-surface persistence succeeds or fails |
| `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.test.ts` | Keep ownership/linkage expectations accurate if bridge state references new persisted summary/event outcomes |

---

## Implementation Slices

### Slice 1: Define the knowledge cross-surface persistence contract

- **Goal:** Freeze the narrow contract for what `KB-P3-03` persists and what counts as success/failure.
- **Primary surfaces:**
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-runtime-persistence.ts`
  - `packages/shared/src/types/session-runtime.ts` (only if shared types are needed)
- **Decisions to lock:**
  - exact persisted metadata classes
  - event/summary write as one unit of work
  - failure semantics returned to the bridge
  - additive report fields, if any, for persistence status
- **Dependency:** none; this slice must finish before schema/repo work.
- **Validation hook:** targeted unit tests for the contract module plus bridge tests.

### Slice 2: Add additive storage surfaces for knowledge runtime history

- **Goal:** Introduce storage owned by `knowledge_command_sessions` without changing lane-session table behavior.
- **Primary surfaces:**
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.ts`
- **Required properties:**
  - additive DDL only
  - FK ownership to `knowledge_command_sessions(session_id)`
  - latest-summary lookup path for resume-visible state
  - event history lookup path for compaction history
- **Dependency:** Slice 1.
- **Validation hook:** repo tests for create/read/latest behavior.

### Slice 3: Integrate bridge persistence for compaction and continuation

- **Goal:** Replace the current “generated in memory only” limit with persisted knowledge-session runtime state.
- **Primary surfaces:**
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-runtime-persistence.ts`
  - `packages/runtime/src/session/session-compaction.ts`
  - `packages/runtime/src/session/session-summary.ts`
- **Expected outcome:**
  - compaction event details persist when compaction runs
  - continuation summary persists when generated
  - latest resume-visible summary state becomes queryable for the knowledge session
  - failure path avoids partial success claims
- **Dependency:** Slices 1-2.
- **Validation hook:** bridge unit tests and workflow-level knowledge-command tests.

### Slice 4: Surface additive persistence result without breaking current consumers

- **Goal:** Make persistence status inspectable without redesigning CLI or report contracts.
- **Primary surfaces:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - optional presenter/client surfaces only if current report shape cannot express the result honestly
- **Expected outcome:**
  - current report fields remain stable
  - any new status or warning field is optional/additive
  - no required CLI redesign for default usage
- **Dependency:** Slice 3.
- **Validation hook:** workflow tests; presenter tests only if output changes.

---

## Dependency Graph

- **Sequential:** Slice 1 -> Slice 2 -> Slice 3 -> Slice 4
- **Parallel-safe work:** repo tests for new knowledge event/summary repos may run in parallel once Slice 2 schema decisions are fixed.
- **Critical path:** freeze contract first, then add storage, then wire the bridge, then expose additive result state.

---

## Validation Strategy

DH already has real repository-native validation commands:

- `npm run check`
- `npm run test`

Recommended validation stack for this work:

| Target | Validation path |
|---|---|
| Knowledge event repo behavior | `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.test.ts` |
| Knowledge summary repo behavior | `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.test.ts` |
| Bridge persistence contract | `npm run test -- packages/runtime/src/session/knowledge-command-runtime-persistence.test.ts` |
| Bridge create/resume + persistence semantics | `npm run test -- packages/runtime/src/session/knowledge-command-session-bridge.test.ts` |
| End-to-end knowledge command behavior | `npm run test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts` |
| Repository-wide regression check | `npm run check` and `npm run test` |

Minimum acceptance evidence to close `KB-P3-03` honestly:

1. new knowledge session with no compaction writes no false continuation summary state
2. resumed knowledge session with compaction overflow persists runtime event + continuation summary
3. write failure does not report persisted success and does not leave ambiguous partial state
4. invalid/foreign/non-resumable session still fails before cross-surface writes
5. existing lane-session tests remain green without contract changes to their tables/repos

---

## Compatibility Notes

1. **Lane-session behavior must remain unchanged.**
   - Existing `session_runtime_events` and `session_summaries` semantics stay intact.

2. **Knowledge commands remain command-scoped.**
   - This solution does not convert them into lane workflows.

3. **Retrieval behavior stays unchanged.**
   - `runRetrieval()` remains the execution core.

4. **Current bridge linkage remains valid.**
   - `knowledge_command_sessions` stays the owner of knowledge-session identity.

5. **New report state must be additive.**
   - Existing text/JSON consumers should still parse current outputs.

---

## Out of Scope

- redesigning the general DH session model
- changing lane enums, lane lock semantics, or workflow stage behavior
- moving knowledge-command sessions into `sessions` as full lane sessions
- widening existing lane runtime tables into a polymorphic owner model
- retrieval, ranking, evidence-selection, or prompt-assembly redesign
- broad CLI UX changes beyond any small additive persistence-status reporting strictly needed
- unrelated schema cleanup

---

## Reviewer and QA Focus

### Fullstack Agent must preserve
- command-scoped bridge ownership
- unchanged lane-session table semantics
- additive-only schema changes
- no false claim that in-memory continuation summaries are persisted unless the new contract actually wrote them

### Code Reviewer must verify
- no scope drift into surrogate lane sessions or polymorphic redesign unless explicitly re-approved
- event + summary writes are handled as one persistence outcome
- failure semantics are binary and observable
- current knowledge-command behavior remains compatible when no persistence issue occurs

### QA must verify
- resumed knowledge sessions can read persisted continuation/summary state after compaction
- persistence failure is visible and non-ambiguous
- lane-session runtime reporting remains unchanged
- `KB-P3-03` is only marked complete when the approved knowledge-owned cross-surface targets are actually written and readable

---

## Short Handoff Summary

Recommended implementation path: add knowledge-command shadow runtime event/summary tables and repos, then wire the bridge through one narrow persistence adapter so compaction and continuation metadata can persist without changing lane-session tables or turning knowledge commands into lane sessions.

This is the smallest solution that addresses the real FK blocker in `KB-P3-03` while preserving DH's current bridge, lane semantics, and retrieval behavior.
