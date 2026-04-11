# Scope Package: Session-Backed Knowledge Command Bridge

Date: 2026-04-11
Owner: DH runtime/application team
Execution drivers:
- `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
- Blocked item: `P2B-05`

---

DH has already completed the selective-port compaction foundation, but `P2B-05` remains blocked because `packages/opencode-app/src/workflows/run-knowledge-command.ts` currently runs as a stateless retrieval command. This scope defines the smallest follow-on product scope needed to approve a session-backed bridge for `ask` / `explain` / `trace`, so those knowledge commands can participate in DH session-backed runtime behavior without expanding into implementation or broader workflow redesign.

## Problem Statement

- `run-knowledge-command.ts` currently accepts only `kind`, `input`, and `repoRoot`, then executes retrieval directly and returns a report.
- The file does not currently operate as a session-backed workflow surface.
- Because of that, the knowledge-command path does not have an approved session bridge for session-aware runtime behaviors that depend on session context.
- This leaves `P2B-05` blocked: compaction cannot be safely hooked into `ask` / `explain` / `trace` before large prompt submission while the knowledge path remains stateless.

## Current Blocked Condition

- Source of truth blocker: `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
- Recorded blocker text: `P2B-05` is blocked because `runKnowledgeCommand` is stateless under the approved solution constraints.
- Current DH reality:
  - compaction capability exists as part of the selective-port work,
  - lane workflow paths were used as the approved integration target,
  - the knowledge-command path was intentionally not extended in that scope,
  - no approved scope yet defines how `ask` / `explain` / `trace` should become session-backed.

## Target Outcome

- DH has an approved follow-on scope for a session-backed knowledge command bridge.
- That approved scope defines how the knowledge-command path participates in session-backed runtime behavior at a product boundary level, without implementing code in this step.
- After approval, Solution Lead can design a limited implementation that unblocks `P2B-05` by enabling the knowledge-command path to use session context safely enough for compaction and related session-runtime behaviors.

## In Scope

- Define the required product boundary for making `ask` / `explain` / `trace` session-backed.
- Define the minimum behavioral expectations for a knowledge-command bridge between the current stateless command path and DH session-backed runtime behavior.
- Define what must be true before compaction can be hooked into the knowledge-command path.
- Define acceptance boundaries for session identity, session reuse/resume expectations, and failure handling at the command level.
- Preserve current DH lane semantics and current selective-port boundaries.

## Out of Scope

- Any code implementation in `packages/opencode-app/src/workflows/run-knowledge-command.ts` or related files.
- Replacing the lane workflow integration that was already approved in the selective-port scope.
- Broad redesign of DH retrieval, indexing, or knowledge ranking behavior.
- Full upstream session subsystem parity for knowledge commands.
- New workflow modes, lane semantics, or runtime-contract changes outside the narrow bridge needed to unblock `P2B-05`.

## Business Rules and Boundaries

1. This is a follow-on scope only; it does not authorize implementation by itself.
2. The bridge must be limited to the knowledge-command path used by `ask`, `explain`, and `trace`.
3. The bridge must be session-backed enough to support session-aware runtime behavior for that path; it must not require mirroring the full upstream session stack.
4. The approved scope must preserve DH's current ownership boundaries across runtime, storage, app orchestration, and shared contracts.
5. Unblocking `P2B-05` means enabling a safe path for compaction on knowledge commands, not broadening the selective-port program.

## Acceptance Criteria

- AC-1: A dedicated follow-on scope artifact exists for the session-backed knowledge command bridge and explicitly names `P2B-05` as the unblock target.
- AC-2: The scope states the current blocked condition factually: `run-knowledge-command.ts` is stateless in current DH reality and therefore cannot safely host the compaction hook as-is.
- AC-3: The scope defines the target outcome as a session-backed bridge for `ask` / `explain` / `trace`, without authorizing broader retrieval or workflow redesign.
- AC-4: The scope makes in-scope and out-of-scope boundaries explicit enough that Solution Lead does not need to guess whether this work includes implementation, upstream parity, or lane-semantics changes.
- AC-5: The scope records the minimum acceptance boundary that the knowledge-command path must have session identity or session linkage before `P2B-05` can be treated as unblocked.
- AC-6: The scope records command-level failure expectations clearly enough for downstream design, including what happens when session context is missing, invalid, or cannot be resumed.
- AC-7: The scope includes sequencing expectations that keep this bridge as a separate approved step before any compaction hook is added to the knowledge-command path.

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into implementation | Could bypass the required approval boundary and expand work during a blocked item follow-on | Keep this artifact product-scoped and implementation-free |
| Bridge scope grows into workflow redesign | Would exceed the narrow unblock goal for `P2B-05` | Limit the scope to session-backed behavior for `ask` / `explain` / `trace` only |
| Session expectations stay ambiguous | Would force Solution Lead to rediscover product intent and acceptance boundaries | Make session-linkage and unblock conditions explicit in the scope |
| Boundary drift across packages | Could repeat the same ownership ambiguity already guarded in selective-port work | Preserve existing DH ownership boundaries in downstream design |

### Assumptions

1. The implementation checklist is the authoritative record that `P2B-05` is blocked.
2. `run-knowledge-command.ts` is the current knowledge-command surface relevant to this blocker.
3. The already-approved selective-port work intentionally stopped short of making the knowledge-command path session-backed.
4. A separate approved scope is required before implementation proceeds on this unblock path.

## Sequencing Expectations

1. Approve this follow-on scope first.
2. Solution Lead then produces a separate solution package for the session-backed knowledge command bridge.
3. Only after that solution is approved should implementation work begin on the knowledge-command path.
4. `P2B-05` may be moved from blocked only when the approved bridge solution makes the compaction hook on `ask` / `explain` / `trace` in-scope and testable.
5. This sequencing does not reopen already completed selective-port phases; it only defines the next narrow step needed to unblock the remaining item.

## Handoff Notes for Solution Lead

- Preserve the narrow unblock goal: session-back the knowledge-command path only enough to support safe compaction hookup for `ask` / `explain` / `trace`.
- Preserve DH reality: current knowledge-command flow is stateless and should not be described as already session-aware.
- Do not assume implementation approval from this document alone.
- Make downstream acceptance binary around session linkage, unblock conditions for `P2B-05`, and command-level failure behavior.
