# Solution Package: Session Runtime Selective Port (DH)

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-session-runtime-selective-port-dh.md`
**Architecture mapping:** `docs/opencode/session-runtime-selective-port-mapping-dh.md`
**Execution checklist:** `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`

---

## Recommended Path

Implement the selective port as an additive DH-native session runtime layer in this order:

1. **Baseline inventory + edit-set freeze**
2. **Reliability foundation: run-state + retry**
3. **Session summary + compaction + checkpoints**
4. **Checkpoint-level revert**

This is enough because DH already has the right baseline surfaces for session identity and workflow persistence:

- `packages/runtime/src/session/session-manager.ts`
- `packages/runtime/src/session/session-resume.ts`
- `packages/storage/src/sqlite/repositories/sessions-repo.ts`
- `packages/runtime/src/workflow/stage-runner.ts`
- `packages/runtime/src/workflow/workflow-audit-service.ts`
- `packages/storage/src/fs/session-store.ts`

The missing work is not a full upstream port. It is a focused runtime layer for busy/cancel control, shared retry behavior, additive summary/checkpoint persistence, safe context compaction, and checkpoint-level revert.

---

## Repository Reality Constraints

These constraints change how implementation should proceed:

1. **`runKnowledgeCommand()` is stateless today.**
   - `packages/opencode-app/src/workflows/run-knowledge-command.ts` does not create or resume a DH session.
   - Do not promise true session-backed summary/compaction for `dh ask/explain/trace` unless a narrow follow-on bridge is explicitly added.
   - For this feature, the first honest integration target is the existing session-backed lane workflow path.

2. **Provider calls exist but are not yet threaded through workflow entrypoints.**
   - Team modules can accept `provider?: ChatProvider`, but current lane workflows call them without a provider.
   - Shared retry is not meaningful until one real workflow/provider path is wired.
   - Therefore, provider threading is part of Milestone 1, not optional cleanup.

3. **DH has repo-native typecheck and test commands, but no lint command.**
   - Available validation commands:
     - `npm run check`
     - `npm run test`
   - Do not invent lint/build gates beyond those.

4. **SQLite bootstrap is the migration mechanism in practice.**
   - `packages/storage/src/sqlite/db.ts` is the live schema bootstrap surface.
   - All storage additions for this feature must be additive (`CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`).

5. **DH does not have a general filesystem snapshot/patch engine today.**
   - Revert Milestone 1 must restore DH-managed runtime/session state at checkpoint level.
   - It must not claim arbitrary repository file undo unless a real snapshot engine is added in scope.

---

## Architecture Decisions

### AD-1: Run-state is process-local authority, with persisted events for observability

Use a DH-owned runtime module with an in-memory map keyed by `sessionId` as the authoritative busy/cancel state for active execution:

- `assertNotBusy(sessionId)`
- `markBusy(sessionId, metadata?)`
- `markIdle(sessionId, metadata?)`
- `cancel(sessionId)`
- `withSessionRunGuard(sessionId, fn)`

Do **not** persist authoritative busy flags into `sessions` rows. Persisting busy state would create false stuck-busy recovery problems after process exit. Instead, persist transition events for audit and resume diagnostics.

### AD-2: Retry is centralized as a wrapper around `ChatProvider`, not duplicated in each caller

Add a shared retry policy in `packages/runtime/src/reliability/` and apply it through one wrapper/provider adapter at workflow entry.

Why:

- team modules already share the `ChatProvider` abstraction;
- retry logic should not be reimplemented in `coordinator`, `architect`, `reviewer`, `tester`, etc.;
- one wrapper makes header-aware delay and no-retry classification consistent.

### AD-3: Summary and checkpoint state live outside raw session rows and raw role outputs

Keep `sessions` focused on baseline session identity/stage state. Add additive repos/tables for:

- session summary metadata
- session checkpoints
- revert metadata
- runtime event history

This preserves DH ownership boundaries and avoids overloading `SessionState` with mutable runtime bookkeeping.

### AD-4: Compaction operates on DH resume/handoff context bundles, not provider-token internals

DH does not currently maintain a full chat transcript replay surface for lane workflows. The honest compaction target is therefore the **resume/handoff context bundle** built from:

- latest workflow state
- recent role outputs
- work-item state
- session summary metadata
- latest checkpoint metadata

Compaction should initially:

- detect oversized context via serialized-size / entry-count heuristics,
- preserve anchors,
- replace older verbose history with a synthetic continuation summary,
- leave raw source records intact in storage for auditability.

### AD-5: Revert Milestone 1 restores DH-managed checkpoints only

`revertTo(sessionId, checkpointId)` should restore:

- workflow stage pointer,
- session summary pointer/metadata,
- active work-item view,
- continuation/compaction state,
- revert audit metadata.

It should not claim full workspace file rollback. If changed file metadata exists, the revert result may record manual follow-up expectations, but the revert itself remains checkpoint-level and runtime-scoped.

### AD-6: `packages/opencode-sdk` stays optional and narrow

Do not move core runtime logic into `packages/opencode-sdk`. Only add optional bridge-contract fields if a compatibility mirror consumer truly needs new summary/compaction metadata. Prefer keeping this feature inside:

- `packages/runtime`
- `packages/storage`
- `packages/opencode-app`
- `packages/shared`

---

## Impacted Surfaces

## Existing files to modify

| File | Why it changes |
|---|---|
| `packages/storage/src/sqlite/db.ts` | Add additive tables/indexes for summary, checkpoints, revert metadata, and runtime events |
| `packages/shared/src/types/session.ts` | Add optional metadata references only when needed for summary/compaction/revert visibility |
| `packages/runtime/src/workflow/stage-runner.ts` | Create workflow-bound checkpoints and refresh persisted session summary/continuation state on stage advance |
| `packages/runtime/src/workflow/workflow-audit-service.ts` | Record runtime events or expose a narrow helper for summary/revert audit writes |
| `packages/opencode-app/src/workflows/run-lane-command.ts` | Wrap lane execution in session run guard and inject retry-wrapped provider |
| `packages/opencode-app/src/workflows/quick.ts` | Accept provider/runtime services and emit summary checkpoint hooks |
| `packages/opencode-app/src/workflows/delivery.ts` | Accept provider/runtime services and emit summary/checkpoint hooks |
| `packages/opencode-app/src/workflows/migration.ts` | Accept provider/runtime services and emit summary/checkpoint hooks |
| `packages/providers/src/chat/types.ts` | Define structured provider error metadata needed for retry classification |
| `packages/providers/src/chat/openai-chat.ts` | Emit structured transient/non-transient error metadata |
| `packages/providers/src/chat/anthropic-chat.ts` | Emit structured transient/non-transient error metadata |
| `packages/providers/src/chat/create-chat-provider.ts` | Remain the creation point used by workflow entry to get a base provider before retry wrapping |
| `packages/opencode-app/src/workflows/run-lane-command.test.ts` | Extend for real guarded/retried lane execution assertions |
| `packages/providers/src/chat/chat.test.ts` | Add retry metadata and wrapper behavior tests |

## New runtime/storage/shared modules

| File | Responsibility |
|---|---|
| `packages/runtime/src/session/session-run-state.ts` | Busy/cancel guard and process-local run registry |
| `packages/runtime/src/session/session-run-state.test.ts` | Busy, idle, cancel, auto-cleanup verification |
| `packages/runtime/src/reliability/retry-policy.ts` | `isRetryable()` and `computeRetryDelay()` |
| `packages/runtime/src/reliability/retry-policy.test.ts` | Retry classification and delay cases |
| `packages/runtime/src/reliability/retrying-chat-provider.ts` | Retry wrapper around `ChatProvider` |
| `packages/runtime/src/reliability/retrying-chat-provider.test.ts` | Header-aware retry integration tests |
| `packages/runtime/src/session/session-summary.ts` | Build/update summary metadata from workflow outputs/checkpoints |
| `packages/runtime/src/session/session-summary.test.ts` | Summary calculation/update tests |
| `packages/runtime/src/session/session-compaction.ts` | Overflow detection, anchor preservation, continuation summary generation |
| `packages/runtime/src/session/session-compaction.test.ts` | Compaction heuristic and continuation behavior tests |
| `packages/runtime/src/session/session-revert.ts` | Checkpoint-level revert orchestration |
| `packages/runtime/src/session/session-revert.test.ts` | Busy guard + checkpoint restore tests |
| `packages/shared/src/types/session-runtime.ts` | Shared contracts for summary, checkpoints, revert metadata, runtime events |
| `packages/storage/src/sqlite/repositories/session-summary-repo.ts` | Summary persistence |
| `packages/storage/src/sqlite/repositories/session-summary-repo.test.ts` | Summary repo tests |
| `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts` | Checkpoint persistence |
| `packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts` | Checkpoint repo tests |
| `packages/storage/src/sqlite/repositories/session-revert-repo.ts` | Revert metadata persistence |
| `packages/storage/src/sqlite/repositories/session-revert-repo.test.ts` | Revert repo tests |
| `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts` | Busy/retry/compaction/revert event persistence |
| `packages/storage/src/sqlite/repositories/session-runtime-events-repo.test.ts` | Runtime event repo tests |

## Deferred unless explicitly approved during implementation

| File | Why deferred |
|---|---|
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` | Current command is stateless; adding session-backed knowledge execution is a separate integration decision |
| `packages/opencode-sdk/src/types/session.ts` | Only needed if compatibility consumers must read new optional summary/compaction fields |
| `apps/cli/src/commands/{ask,explain,trace}.ts` | No change required unless knowledge commands become session-backed |

---

## Technical Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Provider retry lands without a real provider execution path | Would satisfy file creation but not AC-3 | Thread provider creation/wrapping through `run-lane-command.ts` into lane workflows as part of M1 |
| Busy guard is persisted as session state | Would create false stuck-busy sessions after process exit | Keep authoritative busy state in-memory only; persist events, not lock state |
| Compaction becomes destructive | Would reduce fidelity and make revert/audit harder | Compact derived resume context only; keep raw role outputs and audit rows intact |
| Revert over-promises file rollback | DH lacks file snapshot engine | Scope revert to DH-managed checkpoints only and document that clearly |
| Scope drifts into true knowledge-session architecture | `ask/explain/trace` are stateless today | Keep that follow-on explicitly optional; do not block core milestone order on it |
| Ownership drift into SDK bridge | Would break the selective-port boundary | Keep runtime logic in `packages/runtime`; SDK only gets optional bridge fields if proven necessary |

---

## Package Ownership Boundaries

| Package | Owns | Must not own |
|---|---|---|
| `packages/runtime` | Run-state registry, retry policy, retry wrapper, summary/compaction/revert orchestration | SQLite DDL, direct CLI presentation concerns, SDK bridge policy |
| `packages/storage` | Additive SQLite schema and repos for summary/checkpoints/revert/events | Busy-state decision logic, provider retry behavior |
| `packages/opencode-app` | Workflow integration, provider threading, execution sequencing hooks | Persistent storage rules, core retry calculations |
| `packages/shared` | Narrow shared contracts/types for session runtime metadata | Runtime implementation or persistence logic |
| `packages/providers` | Structured provider error metadata and provider-specific header extraction | Retry policy decisions across workflows |
| `packages/opencode-sdk` | Optional compatibility bridge fields only if required | Core session runtime behavior |

---

## Implementation Slices

### Slice 0: Baseline inventory and edit-set freeze

- **Goal:** Complete checklist Phase 0 before runtime changes begin.
- **Files:**
  - `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
  - `docs/opencode/session-runtime-selective-port-mapping-dh.md`
  - inventory reads from:
    - `apps/cli/src/runtime-client.ts`
    - `packages/runtime/src/session/session-manager.ts`
    - `packages/runtime/src/session/session-resume.ts`
    - `packages/opencode-app/src/workflows/run-lane-command.ts`
    - `packages/opencode-app/src/workflows/{quick,delivery,migration}.ts`
    - `packages/storage/src/sqlite/repositories/sessions-repo.ts`
    - `packages/runtime/src/workflow/stage-runner.ts`
- **Outcome:**
  - confirm current entry points,
  - confirm that M1 needs provider threading to make retry real,
  - freeze the edit set for M1,
  - record the stateless knowledge-command gap explicitly.
- **Validation:** manual artifact review only; no invented automation.

### Slice 1: Reliability foundation — run-state + retry

- **Goal:** Deliver AC-2 through AC-4 with one honest workflow execution path.
- **Files:**
  - `packages/runtime/src/session/session-run-state.ts`
  - `packages/runtime/src/session/session-run-state.test.ts`
  - `packages/runtime/src/reliability/retry-policy.ts`
  - `packages/runtime/src/reliability/retrying-chat-provider.ts`
  - `packages/runtime/src/reliability/retry-policy.test.ts`
  - `packages/runtime/src/reliability/retrying-chat-provider.test.ts`
  - `packages/providers/src/chat/types.ts`
  - `packages/providers/src/chat/openai-chat.ts`
  - `packages/providers/src/chat/anthropic-chat.ts`
  - `packages/providers/src/chat/chat.test.ts`
  - `packages/opencode-app/src/workflows/run-lane-command.ts`
  - `packages/opencode-app/src/workflows/{quick,delivery,migration}.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
- **Design details:**
  1. Add process-local run-state registry and `withSessionRunGuard()`.
  2. Wrap lane workflow execution inside the guard after session bootstrap.
  3. Add cancel-safe cleanup so throw/error/cancel always returns the session to idle.
  4. Add structured provider errors with optional metadata for status code and retry-after headers.
  5. Add shared retry policy with explicit no-retry classification for overflow/semantic errors.
  6. Create a retrying provider wrapper and inject it from `run-lane-command.ts` into workflow entrypoints.
  7. Persist runtime events for busy/idle/cancel/retry attempts for evidence and later summary use.
- **Sequencing note:**
  - run-state module and retry policy module may be developed in parallel,
  - but provider threading and workflow integration are the M1 merge point.
- **Validation commands:**
  - `npm run check`
  - `npm run test -- packages/runtime/src/session/session-run-state.test.ts`
  - `npm run test -- packages/runtime/src/reliability/retry-policy.test.ts`
  - `npm run test -- packages/runtime/src/reliability/retrying-chat-provider.test.ts`
  - `npm run test -- packages/providers/src/chat/chat.test.ts`
  - `npm run test -- packages/opencode-app/src/workflows/run-lane-command.test.ts`
- **Integration checkpoint:**
  - prove same-session overlap is blocked,
  - prove cancel/error leaves no busy residue,
  - prove header/no-header retry delay behavior,
  - prove at least one lane workflow path now executes through the retry wrapper.

### Slice 2: Session summary, checkpoints, and compaction

- **Goal:** Deliver AC-5 and AC-6 without inventing a full transcript engine.
- **Files:**
  - `packages/shared/src/types/session-runtime.ts`
  - `packages/shared/src/types/session.ts`
  - `packages/runtime/src/session/session-summary.ts`
  - `packages/runtime/src/session/session-summary.test.ts`
  - `packages/runtime/src/session/session-compaction.ts`
  - `packages/runtime/src/session/session-compaction.test.ts`
  - `packages/runtime/src/workflow/stage-runner.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
  - `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts`
  - `packages/storage/src/sqlite/repositories/session-summary-repo.test.ts`
  - `packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts`
  - `packages/opencode-app/src/workflows/{quick,delivery,migration}.ts`
- **Design details:**
  1. Add additive summary and checkpoint tables.
  2. Define minimal summary contract: `filesChanged`, `additions`, `deletions`, `lastDiffAt`, plus optional continuation metadata references.
  3. Build summary updates from DH-native artifacts already present in workflows: role outputs, work items, changed areas, and runtime event history.
  4. Create workflow-bound checkpoints at stable boundaries (initial session bootstrap, post-workflow execution, post-stage advance, and pre-revert targets).
  5. Add compaction heuristics based on serialized resume-context size and event/output count.
  6. Preserve anchors:
     - latest workflow stage
     - latest summary snapshot
     - latest checkpoint ID
     - unresolved blockers
     - active work-item IDs
  7. Generate a synthetic continuation summary instead of deleting raw rows.
  8. Keep `autoCompaction` default-safe/off until evidence shows the continuation summary is trustworthy.
- **Sequencing note:**
  - summary/checkpoint storage must land before compaction,
  - compaction must consume checkpoint/summary outputs rather than invent its own state model.
- **Validation commands:**
  - `npm run check`
  - `npm run test -- packages/storage/src/sqlite/repositories/session-summary-repo.test.ts`
  - `npm run test -- packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts`
  - `npm run test -- packages/runtime/src/session/session-summary.test.ts`
  - `npm run test -- packages/runtime/src/session/session-compaction.test.ts`
  - `npm run test -- packages/opencode-app/src/workflows/workflows.test.ts`
- **Integration checkpoint:**
  - prove summary updates from a real workflow boundary,
  - prove checkpoint rows are created at deterministic boundaries,
  - prove compaction produces a continuation summary while keeping raw records available.

### Slice 3: Checkpoint-level revert

- **Goal:** Deliver AC-7 with rollback safety that matches DH reality.
- **Files:**
  - `packages/runtime/src/session/session-revert.ts`
  - `packages/runtime/src/session/session-revert.test.ts`
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/session-revert-repo.ts`
  - `packages/storage/src/sqlite/repositories/session-revert-repo.test.ts`
  - `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
  - `packages/runtime/src/workflow/stage-runner.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/shared/src/types/session-runtime.ts`
- **Design details:**
  1. `revertTo(sessionId, checkpointId)` must call `assertNotBusy()` before restoring state.
  2. Restore session/workflow/summary/continuation pointers from the checkpoint snapshot.
  3. Record revert metadata and latest reverted checkpoint separately from base session rows.
  4. Refresh summary and continuation metadata after revert so the session does not point at stale compacted state.
  5. Add `undoRevert(sessionId)` only if it can be implemented as a revert-to-previous-checkpoint operation, not as hidden magic state mutation.
  6. If changed-file metadata exists, record it as informational/manual follow-up only.
- **Hard boundary:** no claim of arbitrary filesystem patch rollback in this milestone.
- **Validation commands:**
  - `npm run check`
  - `npm run test -- packages/storage/src/sqlite/repositories/session-revert-repo.test.ts`
  - `npm run test -- packages/runtime/src/session/session-revert.test.ts`
  - `npm run test -- packages/runtime/src/session/session-run-state.test.ts`
- **Integration checkpoint:**
  - prove revert is blocked while busy,
  - prove checkpoint restore refreshes summary/continuation pointers,
  - prove audit/runtime-event history records the revert operation.

### Slice 4: Evidence and documentation alignment

- **Goal:** Deliver AC-8 through AC-10 continuously, not as end-only cleanup.
- **Files:**
  - `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
  - `docs/opencode/session-runtime-selective-port-mapping-dh.md`
  - `docs/scope/2026-04-11-session-runtime-selective-port-dh.md` only if current-state text must be corrected
- **Requirements:**
  - update progress log at every completed slice,
  - mark blocked items honestly,
  - keep current-state vs target-state language factual,
  - record validation evidence or explicit manual evidence for each milestone,
  - keep the selective-port constraint visible in reviewer notes.
- **Validation:** document review plus links to real test output.

---

## Dependency Graph

- **Sequential:** Slice 0 -> Slice 1 -> Slice 2 -> Slice 3
- **Allowed parallel work inside Slice 1:**
  - `session-run-state` implementation/tests
  - `retry-policy` + provider error metadata implementation/tests
  - These rejoin at `run-lane-command.ts` integration.
- **Allowed parallel work inside Slice 2:**
  - summary repo/types
  - checkpoint repo/types
  - These must merge before compaction logic starts.
- **Not safe to parallelize:**
  - compaction before summary/checkpoints,
  - revert before run-state and checkpoints,
  - SDK bridge changes before a real compatibility need is proven.

**Critical path:** inventory -> real guarded/retried lane execution -> summary/checkpoints -> compaction -> revert.

---

## Validation Matrix

| Target | Validation path | Honest success signal |
|---|---|---|
| Busy guard prevents same-session overlap | `npm run test -- packages/runtime/src/session/session-run-state.test.ts` | concurrent same-session attempt fails; distinct sessions can run |
| Cancel/error cleanup leaves no stuck busy state | `npm run test -- packages/runtime/src/session/session-run-state.test.ts` | busy map cleared in success, throw, and cancel cases |
| Retry delay respects header/no-header cases | `npm run test -- packages/runtime/src/reliability/retry-policy.test.ts` | explicit assertions for `retry-after-ms`, seconds, HTTP-date, fallback backoff |
| Retry is used in one real workflow path | `npm run test -- packages/runtime/src/reliability/retrying-chat-provider.test.ts` and `packages/opencode-app/src/workflows/run-lane-command.test.ts` | workflow entrypoint injects wrapped provider and retries transient provider failures |
| Summary metadata persists separately from raw logs | `npm run test -- packages/storage/src/sqlite/repositories/session-summary-repo.test.ts` and `packages/runtime/src/session/session-summary.test.ts` | summary row exists and is refreshed from workflow outputs/checkpoints |
| Checkpoints are created at stable workflow boundaries | `npm run test -- packages/storage/src/sqlite/repositories/session-checkpoints-repo.test.ts` and `packages/opencode-app/src/workflows/workflows.test.ts` | deterministic checkpoint rows linked to session and stage |
| Compaction preserves anchors and creates continuation behavior | `npm run test -- packages/runtime/src/session/session-compaction.test.ts` | compacted continuation summary exists while raw records remain readable |
| Revert respects busy guard and restores checkpoint-level state | `npm run test -- packages/runtime/src/session/session-revert.test.ts` | busy session cannot revert; idle session restores stored checkpoint metadata |
| Whole feature stays type-safe | `npm run check` | zero TypeScript errors |
| Whole feature stays within selective-port scope | reviewer/doc review | no full upstream subsystem surfaces introduced |

**No lint gate exists in DH today.** Review and test evidence must not claim lint success.

---

## Rollback and Compatibility Considerations

1. **All schema changes are additive.**
   - Reverting code can leave the new tables in place without breaking old behavior.
   - Do not rewrite or repurpose existing `sessions`, `workflow_state`, or `role_outputs` columns.

2. **Busy state is non-persistent by design.**
   - Process restart returns all sessions to idle.
   - This is a compatibility choice to avoid stuck-busy recovery drift.

3. **Compaction must be reversible by configuration.**
   - Keep `autoCompaction` default-off or explicitly safe.
   - Store continuation summaries separately so disabling compaction does not require raw-history recovery.

4. **Compatibility mirror changes must be optional.**
   - If `.dh/workflow-state.json` or SDK bridge types are extended, use optional keys only.
   - Existing consumers must remain valid without reading new metadata.

5. **Revert must fail closed.**
   - If checkpoint metadata is missing/corrupt, return a structured failure and leave current state unchanged.
   - Do not attempt partial restore.

6. **Knowledge command compatibility remains unchanged unless explicitly extended.**
   - `dh ask/explain/trace` should continue to work exactly as now if the session-backed follow-on is not approved in implementation.

---

## Reviewer and QA Focus

### Fullstack Agent must preserve

- selective-port scope only;
- no upstream subsystem mirroring;
- process-local busy authority;
- real provider-threaded retry path for M1;
- additive storage only;
- revert limited to DH-managed checkpoints.

### Code Reviewer must preserve

- package ownership boundaries;
- no business/runtime logic moved into `packages/opencode-sdk`;
- retry logic centralized rather than copied into team callers;
- compaction non-destructive to raw evidence;
- no claims of filesystem rollback without actual snapshot machinery.

### QA Agent must preserve

- evidence for busy/cancel/retry behavior,
- proof that summary/checkpoints are created at real workflow boundaries,
- proof that revert blocks while busy and refreshes session metadata on restore,
- explicit callout that no lint gate exists and no knowledge-session bridge was silently assumed.

---

## Concise Phase Summary

1. **Phase 0 — Inventory:** confirm real session-backed entrypoints and freeze the M1 edit set.
2. **Phase 1 — Reliability foundation:** add process-local run-state and provider-threaded shared retry, then prove them in one real lane workflow path.
3. **Phase 2 — Summary/compaction:** add additive summary + checkpoint persistence, then compact only derived resume context, not raw audit history.
4. **Phase 3 — Revert:** restore DH-managed checkpoint state only, guarded by run-state and followed by summary/continuation refresh.
