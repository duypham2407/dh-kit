# Scope Package: Session Runtime Selective Port (DH)

Date: 2026-04-11
Owner: DH runtime/application team
Execution drivers:
- `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
- `docs/opencode/session-runtime-selective-port-mapping-dh.md`

---

DH already has baseline session identity, lane lock, and workflow-state persistence, but it does not yet have dedicated session-runtime modules for busy/cancel run-state, shared retry policy, session summary, compaction, or revert. This work defines the smallest approval-ready scope to execute the selective-port checklist in DH by porting only the high-value session-runtime ideas from upstream, preserving DH package ownership boundaries, and sequencing delivery as `run-state + retry` first, then `summary + compaction`, then `revert`.

## Problem Statement

- DH runtime currently depends on baseline session persistence and lane-lock behavior without a dedicated runtime foundation for:
  - session-scoped busy/cancel protection,
  - shared retry behavior across execution paths,
  - session-level summary/diff state,
  - context compaction for long sessions,
  - structured revert/undo.
- This creates concrete operational risks already called out in the mapping/checklist docs:
  - overlapping work on the same session,
  - stuck busy state after cancel or failure,
  - inconsistent retry behavior,
  - degraded long-session quality from context overflow,
  - unsafe rollback behavior.
- The user value is runtime reliability and safer session recovery for `dh ask/explain/trace` and DH lane workflows without copying the full upstream TypeScript session subsystem.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Session identity and lane lock | Present via existing session manager, session resume flow, SQLite persistence, and workflow-state mirror | Preserved as-is; used as baseline for new selective-port runtime modules |
| Run-state | No dedicated `session-run-state` module | Session-scoped busy/cancel guard exists and is integrated into real workflow paths |
| Retry | Retry behavior may be caller-specific or inconsistent | Shared retry policy exists with retryability classification and retry-delay computation |
| Summary/diff | No dedicated summary module or persistence layer | Minimal summary metadata exists and is updated at appropriate workflow/message boundaries |
| Compaction | No dedicated runtime compaction module | Minimal overflow detection, prune policy, and continuation behavior exist for long sessions |
| Revert | No standardized runtime revert flow | Milestone-1 checkpoint-level revert exists with cleanup and audit consistency |
| Docs/evidence | Checklist and mapping docs define target state; implementation evidence not yet present | Each completed phase has explicit validation evidence and docs stay aligned with actual current state |

## In Scope

This scope covers execution of the checklist and mapping doc for the following DH selective-port workstreams only:

1. **Baseline inventory and mapping confirmation**
   - Confirm current DH runtime/session surfaces referenced by the checklist and mapping doc.
   - Confirm target ownership across `packages/runtime`, `packages/storage`, `packages/opencode-app`, `packages/shared`, and `packages/opencode-sdk` only when a minimal bridge contract is truly required.

2. **Reliability foundation (first milestone)**
   - Add the run-state concern as a DH-owned runtime capability.
   - Add the retry concern as a DH-owned shared reliability capability.
   - Integrate both into at least one real execution path each.

3. **Session observability and context quality (second milestone)**
   - Add minimal summary/diff capability and persistence.
   - Add minimal compaction/prune capability for long sessions.
   - Integrate both into appropriate DH workflow/message boundaries.

4. **Safety rollback (third milestone)**
   - Add milestone-1 revert capability at checkpoint level.
   - Ensure revert respects busy-state guards and refreshes session audit/summary state appropriately.

5. **Ownership, evidence, and documentation alignment**
   - Maintain explicit package ownership boundaries.
   - Keep mapping/checklist/current-state docs synchronized with actual implementation progress.
   - Capture repeatable validation evidence or explicit manual evidence when toolchain coverage is missing.

## Out of Scope

- Mirroring or copying the whole upstream TypeScript session stack.
- Importing upstream effect-runtime wiring, service-map patterns, event-bus model, or processor integration wholesale.
- Broad refactors outside the selective-port concerns.
- Changes to DH lane semantics, workflow contract, or existing lane-lock rules.
- Message-part-granularity revert in the first milestone.
- Compaction prompt/plugin chains or upstream prompt-template parity.
- Moving core runtime business logic into `packages/opencode-sdk`.

## Business Rules and Scope Boundaries

1. **Selective port only** — upstream is a reference for ideas and behavior, not a source to mirror wholesale.
2. **DH ownership stays explicit**
   - runtime logic in `packages/runtime`
   - persistence in `packages/storage`
   - orchestration/workflow integration in `packages/opencode-app`
   - shared types/contracts in `packages/shared`
   - `packages/opencode-sdk` only for minimal bridge contracts if truly necessary
3. **Initial priority order is fixed for this scope**
   - first: run-state + retry foundation
   - second: summary + compaction
   - third: revert
4. **Completion requires integration, not file creation only** — a module is not done unless it is used in a real DH execution path.
5. **Completion requires evidence** — each completed phase or milestone must have explicit validation evidence, or transparent manual evidence if automation is unavailable.
6. **Docs must describe reality, not aspiration** — current-state vs target-state language must be updated when implementation changes.

## Acceptance Criteria Matrix

All criteria below must be satisfied for the checklist/mapping-doc execution scope to be considered complete.

| # | Acceptance criterion | Source mapping | Observable completion signal |
|---|---|---|---|
| AC-1 | Baseline inventory of DH session/runtime surfaces is completed before implementation milestones proceed | Checklist Phase 0; mapping sections 3, 6, 7 | Existing DH session/runtime entry points, ownership matrix, and planned edit surfaces are explicitly confirmed and recorded |
| AC-2 | A DH-owned `session-run-state` capability exists and is integrated into at least one real workflow path | Checklist DoD M1; Checklist Phase 1; mapping `run-state` P0 | Busy-state guard prevents overlapping runs for the same session and cleanup occurs on completion/error/cancel |
| AC-3 | A DH-owned shared `retry-policy` capability exists and is integrated into at least one real provider/workflow execution path | Checklist DoD M1; Checklist Phase 3A; mapping `retry` P0 | Retryability classification and retry-delay computation are applied in a real execution path |
| AC-4 | Reliability foundation validation is captured for busy guard, cancel cleanup, and retry delay behavior | Checklist DoD M1; mapping section 8 | Evidence shows: no concurrent same-session execution, cancel does not leave session stuck busy, retry delay handles header and no-header cases |
| AC-5 | Minimal session summary capability exists with DH-owned persistence and optional shared metadata contract updates | Checklist Phase 2A; mapping `summary` P1 | Summary fields such as changed files/additions/deletions/last diff timestamp are stored separately from raw chat logs and updated at an appropriate runtime boundary |
| AC-6 | Minimal session compaction capability exists with overflow detection, prune behavior, and a continuation mechanism | Checklist Phase 2B; mapping `compaction` P1 | Long-session handling prunes heavy historical context while preserving required anchors and supports continuation behavior |
| AC-7 | Revert milestone 1 exists at checkpoint level and respects runtime safety rules | Checklist Phase 3B; mapping `revert` P1 | Revert uses busy-state guard, restores to a checkpoint-level target, and refreshes related audit/summary state consistently |
| AC-8 | Package ownership boundaries remain consistent with the mapping doc throughout implementation | Checklist DoD overall; Checklist Phase 4; mapping section 6 | Runtime/app/storage/shared responsibilities remain explicit and no core runtime business logic is moved into SDK bridge surfaces |
| AC-9 | Each milestone and completed phase has validation evidence and progress logging suitable for session resume | Checklist DoD overall; Checklist Phase 5 | Progress log, milestone status, dependencies, and validation evidence are updated with each completed slice |
| AC-10 | The delivered implementation does not become a mirror of the full upstream TS session subsystem | Checklist DoD M1 and overall; mapping sections 1, 5, 10 | Added scope is limited to DH-needed run-state, retry, summary, compaction, and revert capabilities only |

## Risks and Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into full upstream port | Would expand work beyond DH value and break selective-port intent | Gate each slice against direct DH runtime value and the out-of-scope list |
| Ownership drift across packages | Would blur runtime/storage/app/shared responsibilities and make future maintenance harder | Review each milestone against the ownership matrix before completion |
| Compaction reduces fidelity too early | Could harm long-session quality instead of improving it | Keep compaction minimal, evidence-driven, and safe-by-default |
| Retry becomes too aggressive | Could create provider request storms or poor UX | Respect retry headers and use bounded retry behavior |
| Revert creates timeline/state mismatch | Could desynchronize audit/session/file-system expectations | Keep milestone 1 at checkpoint level with explicit cleanup invariants |
| Documentation drift | Could make future sessions assume capabilities that do not yet exist | Update current-state vs target-state docs whenever a milestone changes reality |

### Assumptions

1. The checklist and mapping documents are the authoritative execution drivers for this feature scope.
2. DH already has the baseline session persistence and lane-lock foundations described in those docs.
3. Validation tooling may be incomplete for some checks; when that happens, manual evidence is allowed but must be explicit and repeatable.
4. This scope is for defining and executing the selective-port work only; it does not change DH workflow semantics.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 / baseline inventory first**
   - Confirm current DH surfaces, entry points, boundaries, and proposed edit set before implementation expands.
2. **Milestone 1 / reliability foundation second**
   - Run-state and retry are the first required delivery slice.
   - They may proceed in parallel where practical, but both must complete before later milestones are treated as ready.
3. **Milestone 2 / summary and compaction third**
   - These follow the reliability foundation because they depend on a stable execution baseline and better auditability.
4. **Milestone 3 / revert fourth**
   - Revert follows after summary/compaction and minimal audit hooks exist, because rollback consistency depends on clearer runtime state.
5. **Ownership review, evidence capture, and docs alignment throughout**
   - These are continuous requirements and final completion gates, not end-only cleanup.

### Hard sequencing rules
- Do not start revert as the leading milestone.
- Do not claim summary/compaction complete before run-state and retry are working in real paths.
- Do not mark any milestone complete without evidence and docs alignment.
- Do not broaden scope to upstream parity as part of milestone execution.

## Open Questions / Clarifications to Preserve

- Whether any `packages/opencode-sdk` bridge updates are actually required should be treated as a narrow follow-on decision, not assumed by default.
- Any validation gap caused by missing toolchain support must be surfaced explicitly in the execution artifact rather than treated as implicitly passing.

## Handoff Notes for Solution Lead

- Use the checklist as the task tracker and the mapping doc as the architecture reference; do not create a competing scope structure.
- Preserve the milestone order: `run-state + retry` -> `summary + compaction` -> `revert`.
- Preserve the selective-port constraint: port only the smallest DH-useful runtime ideas, not upstream subsystem parity.
- Treat ownership boundaries and evidence capture as first-class delivery requirements, not documentation cleanup.
