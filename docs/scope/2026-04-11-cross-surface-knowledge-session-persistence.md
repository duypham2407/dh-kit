# Scope Package: Cross-Surface Knowledge Session Persistence

Date: 2026-04-11
Owner: DH runtime/storage team
Blocked source: `KB-P3-03` in `docs/opencode/session-backed-knowledge-command-bridge-implementation-checklist-dh.md`

---

The current knowledge-command bridge is closure-ready for create/resume linkage and in-memory compaction flow, but it cannot persist compaction or continuation metadata across existing runtime summary surfaces because the knowledge-command linkage uses its own persistence table while `session_runtime_events` and `session_summaries` are foreign-keyed to lane sessions. This follow-on scope defines the smallest approved product boundary needed to add a persistence contract across those surfaces without expanding into a general session redesign.

## Problem Statement

- Knowledge commands now have a narrow bridge for session create/resume behavior.
- Compaction and continuation behavior can run in memory for the knowledge-command path.
- DH does not yet have an approved persistence contract for recording that metadata into the runtime event and summary surfaces used elsewhere.
- Without that contract, cross-surface session history remains incomplete for knowledge-command compaction/continuation flows.

## Current Blocked Condition

- `KB-P3-03` remains blocked.
- The knowledge-command bridge stores linkage in its own table/repository shape.
- `session_runtime_events` and `session_summaries` currently require foreign-key linkage to lane-session records.
- Because the knowledge-command session record is not a lane session, compaction results and continuation summaries cannot be persisted into those surfaces under the current contract.
- The bridge work may close as scoped, but cross-surface persistence for compaction/continuation metadata remains deferred until this follow-on scope is approved and solved.

## Target Outcome

- DH has an approved narrow persistence contract that allows knowledge-command session compaction and continuation metadata to be stored across the appropriate runtime event and summary surfaces.
- The contract preserves the existing knowledge-command bridge intent as command-scoped and additive.
- The contract does not require a general session model redesign, lane-semantics change, or retrieval redesign.

## In Scope

- Define the approved product boundary for persisting knowledge-command compaction metadata across runtime surfaces.
- Define how knowledge-command session identity must relate to `session_runtime_events` and `session_summaries` at the contract level.
- Define which persistence outcomes are required for:
  - compaction execution metadata,
  - continuation summary metadata,
  - resume-visible session summary state where applicable.
- Define failure and fallback expectations when cross-surface persistence is unavailable or invalid.
- Define acceptance boundaries for additive compatibility with existing lane-session behavior.

## Out of Scope

- General redesign of DH session architecture.
- Converting knowledge-command sessions into full lane sessions unless a later approved solution explicitly requires it.
- Retrieval, ranking, evidence-selection, or prompt-assembly redesign.
- Broad schema cleanup unrelated to knowledge-command persistence linkage.
- UI/CLI redesign beyond any additive reporting strictly required by this persistence contract.
- Code implementation in this step.

## Acceptance Criteria

- AC-1: A follow-on scope artifact exists and explicitly identifies `KB-P3-03` as the blocked item being addressed.
- AC-2: The scope states the current blocker factually: knowledge-command linkage uses its own table, while `session_runtime_events` and `session_summaries` are foreign-key-bound to lane sessions.
- AC-3: The scope defines the target as a persistence-contract change for cross-surface compaction/continuation metadata, not a general session redesign.
- AC-4: The scope makes clear which metadata classes must be persistable after the follow-on work: compaction event details, continuation summary details, and any required resume-visible summary state.
- AC-5: The scope defines binary downstream expectations for failure handling when a knowledge-command session cannot be linked to the required runtime surfaces.
- AC-6: The scope makes in-scope and out-of-scope boundaries explicit enough that Solution Lead does not need to guess whether lane semantics, retrieval design, or full session parity are included.
- AC-7: The scope records that `KB-P3-03` is not considered complete until compaction/continuation metadata can be persisted to the approved cross-surface targets under an additive contract.

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into general session redesign | Would expand a narrow blocker fix into broader architecture work | Keep the contract limited to knowledge-command persistence linkage |
| Incorrect coupling to lane semantics | Could make command-scoped knowledge flows depend on workflow rules they do not own | Preserve command-scoped bridge intent and keep lane semantics unchanged |
| Partial persistence semantics | Could leave compaction recorded in one surface but missing in another, making resume behavior ambiguous | Define required persistence targets and failure behavior explicitly |
| Breaking existing lane-session consumers | Could regress current runtime reporting behavior | Keep the contract additive and preserve current lane-session behavior |

### Assumptions

1. The current bridge implementation is otherwise closure-ready except for `KB-P3-03`.
2. Cross-surface persistence is needed specifically for compaction and continuation metadata, not for a full knowledge-command session redesign.
3. Existing runtime event and summary surfaces remain the authoritative targets for persisted runtime history unless an approved solution specifies an additive equivalent.
4. Any downstream solution must preserve backward compatibility for current lane-session consumers.

## Sequencing Expectations

1. Approve this follow-on scope before any persistence-contract implementation for `KB-P3-03` begins.
2. Solution Lead then produces a narrow solution package for cross-surface knowledge-session persistence.
3. Implementation may proceed only after that solution is approved.
4. `KB-P3-03` may be moved from blocked only when the approved contract allows compaction/continuation metadata to persist across the intended runtime surfaces under defined success and failure semantics.
5. This work should be sequenced after the existing bridge closure work and should not reopen already-completed bridge items except where required to attach the approved persistence contract.
