# Solution Package: Session-Backed Knowledge Command Bridge

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-session-backed-knowledge-command-bridge.md`
**Existing mapping:** `docs/opencode/session-runtime-selective-port-mapping-dh.md`
**Execution checklist context:** `docs/opencode/session-runtime-selective-port-implementation-checklist-dh.md`
**Unblock target:** `P2B-05`

---

## Recommended Path

Add a **narrow knowledge-session bridge** around `runKnowledgeCommand()` so `ask` / `explain` / `trace` can resolve a reusable session context, record runtime metadata, and call existing compaction logic before large prompt submission, while keeping the underlying retrieval behavior and current lane workflow semantics unchanged.

This is enough because DH already has the selective-port foundations that the bridge should reuse:

- `packages/runtime/src/session/session-compaction.ts`
- `packages/runtime/src/session/session-summary.ts`
- `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
- `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
- `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts`

The missing piece is not a broader workflow redesign. The missing piece is a command-scoped session linkage surface for the current stateless knowledge path in `packages/opencode-app/src/workflows/run-knowledge-command.ts`.

---

## Dependencies

- **No new npm packages required.**
- **No new environment variables required.**
- **Repo-native validation already exists:**
  - `npm run check`
  - `npm run test`

---

## Repository Reality Constraints

1. **`runKnowledgeCommand()` is stateless today.**
   - Current signature accepts only `kind`, `input`, and `repoRoot`.
   - It calls `runRetrieval()` directly and returns a report.
   - It does not create, resume, or persist session context.

2. **Lane workflows are already the approved integration target for the prior selective-port work.**
   - This bridge must not reopen or replace lane-based integration.
   - `ask` / `explain` / `trace` need only enough session linkage to support compaction and related runtime behavior for that command path.

3. **DH already has session runtime tables and repos, but the current knowledge path does not use them.**
   - Reuse of existing summary/events/compaction surfaces is preferred.
   - Any new persistence should stay additive and narrowly scoped to knowledge-command session linkage.

4. **Current public CLI commands are thin wrappers.**
   - `apps/cli/src/commands/{ask,explain,trace}.ts` currently pass only input text and `repoRoot` through `runtime.runKnowledge()`.
   - If resume or explicit session selection is added, CLI changes must stay small and factual.

5. **This work must preserve DH’s current stateless retrieval behavior as the execution core.**
   - The bridge should wrap the existing retrieval path.
   - It should not redesign indexing, retrieval ranking, or evidence selection.

---

## Architecture Decisions

### AD-1: Use a dedicated knowledge-session bridge, not a new workflow lane

Do **not** introduce a new lane or repurpose `quick` / `delivery` / `migration` just to make knowledge commands session-backed.

Instead, add a narrow bridge service responsible for:

- resolving a knowledge command session identity,
- loading prior summary/continuation context when resuming,
- recording runtime events relevant to knowledge execution,
- invoking compaction before prompt assembly when conditions require it,
- returning session metadata in the command report.

This keeps lane semantics intact and matches the approved scope boundary.

### AD-2: Keep the retrieval engine stateless; make the command wrapper session-backed

The bridge should not turn `runRetrieval()` itself into a session subsystem.

Recommended split:

- **stateless core:** existing retrieval/query execution remains pure and reusable,
- **session-backed wrapper:** `runKnowledgeCommand()` gains bridge preflight/postflight behavior around that core.

That preserves DH reality and avoids coupling retrieval internals to runtime session policy.

### AD-3: Session linkage should be additive and command-scoped

The minimum bridge contract is **session linkage**, not full parity with lane session orchestration.

The bridge should be able to:

- create a new knowledge-session identity when the command starts without one,
- resume an existing knowledge-session identity when explicitly requested,
- associate current summary/continuation/runtime-event records with that identity,
- fail clearly when a supplied session id cannot be found, is invalid, or belongs to a different repository.

This satisfies the scope’s “session identity or session linkage” acceptance boundary without requiring full upstream session parity.

### AD-4: Reuse current compaction logic as a pre-prompt step

For `ask` / `explain` / `trace`, compaction should happen **before** the large prompt is submitted to the model-facing knowledge path, using the bridge session context as input.

The bridge should reuse the existing DH compaction concepts:

- prior summary snapshot,
- continuation summary,
- recent runtime events,
- current command intent / retrieval evidence preview,
- anchor preservation for unresolved blockers or prior continuation state.

The compaction module remains generic runtime logic; the bridge decides when to call it for knowledge commands.

### AD-5: Preserve stateless compatibility at the API boundary

Compatibility with current DH behavior should be preserved by keeping the existing command semantics recognizable:

- `ask` / `explain` / `trace` still accept the same free-text input,
- current retrieval output fields remain intact,
- any new session fields in reports should be additive and optional,
- the stateless retrieval helper remains available as the internal execution primitive.

The bridge becomes the public command path, but it should not break current consumers that only care about the existing report fields.

### AD-6: Avoid compatibility-mirror expansion unless a real consumer needs it

The bridge does **not** need to write full workflow compatibility mirror state unless an existing DH consumer actually requires knowledge-command session metadata there.

Prefer:

- dedicated bridge persistence,
- existing summary/runtime-event repos where reuse is honest,
- additive report fields for CLI/JSON output.

Do not widen `.opencode`-style compatibility surfaces just because lane workflows use them.

---

## High-Level Bridge Behavior

For each `ask` / `explain` / `trace` invocation:

1. **Resolve session context**
   - If no knowledge-session id is supplied, create a new bridge session.
   - If a knowledge-session id is supplied, load and validate it.
   - Validation must at least check repository ownership and resumability.

2. **Load prior bridge state**
   - latest summary,
   - latest continuation summary,
   - recent runtime events,
   - optional prior checkpoint/metadata if the chosen bridge shape stores one.

3. **Prepare command context**
   - current command kind (`ask` / `explain` / `trace`),
   - current user input,
   - prior continuation summary if present,
   - compaction preflight decision.

4. **Run compaction preflight when needed**
   - If the assembled prompt/context is oversized or old context needs pruning, call the existing compaction logic.
   - Record whether compaction ran and whether a continuation summary was generated.

5. **Execute retrieval using the existing stateless engine**
   - Keep `runRetrieval()` as the execution core.
   - Do not redesign ranking/indexing behavior in this work.

6. **Persist bridge outputs**
   - runtime event(s) for knowledge execution and compaction,
   - updated session summary / continuation data,
   - latest command metadata for resume.

7. **Return an additive report**
   - current report fields remain,
   - optionally add session metadata such as `sessionId`, `resumed`, `compacted`, or guidance for reuse.

---

## Impacted Surfaces

### Primary files likely to change

| File | Why it changes |
|---|---|
| `packages/opencode-app/src/workflows/run-knowledge-command.ts` | Convert from stateless-only command runner into a session-backed wrapper around stateless retrieval |
| `apps/cli/src/runtime-client.ts` | Thread any additive knowledge-session input/report fields through the runtime client |
| `apps/cli/src/commands/ask.ts` | Accept optional session/resume arguments and surface updated report behavior |
| `apps/cli/src/commands/explain.ts` | Same as `ask.ts` |
| `apps/cli/src/commands/trace.ts` | Same as `ask.ts` |
| `apps/cli/src/presenters/knowledge-command.ts` | Render additive session metadata without breaking existing text/JSON output |
| `packages/runtime/src/session/session-compaction.ts` | Likely reuse as-is; only change if the knowledge bridge needs a small input-shape extension |
| `packages/runtime/src/session/session-summary.ts` | Reuse or slightly extend for knowledge-session summaries |
| `packages/shared/src/types/session-runtime.ts` | Additive shared types only if a dedicated knowledge bridge contract needs them |
| `packages/storage/src/sqlite/db.ts` | Add additive table(s) or index(es) if knowledge-session linkage needs dedicated persistence |

### New modules likely required

| File | Responsibility |
|---|---|
| `packages/runtime/src/session/knowledge-command-session-bridge.ts` | Bridge orchestration for create/resume/load-summary/record-events/compaction decisions |
| `packages/runtime/src/session/knowledge-command-session-bridge.test.ts` | Bridge create/resume/error/compaction preflight tests |
| `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.ts` | Dedicated persistence for knowledge-session linkage metadata if reuse of `sessions` is not honest |
| `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.test.ts` | Repo persistence and lookup tests |
| `packages/opencode-app/src/workflows/run-knowledge-command.test.ts` | Command-level session-backed behavior, failure handling, and stateless compatibility tests |

### Optional / only if implementation proves they are needed

| File | Why optional |
|---|---|
| `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts` | Only if the bridge needs checkpoint-like restore metadata rather than summary/events only |
| `packages/shared/src/types/session.ts` | Only if a lightweight link from general session state to knowledge-session state is genuinely required |
| `packages/runtime/src/session/session-manager.ts` | Only if a small shared helper can be reused without pulling lane-session semantics into the bridge |
| `packages/runtime/src/session/session-resume.ts` | Only if shared validation logic can be reused cleanly; otherwise keep knowledge resume logic separate |

---

## Boundaries and Out of Scope

### In scope for implementation planning

- make `ask` / `explain` / `trace` session-backed enough to support compaction and session-aware runtime behavior,
- define explicit create/resume/fail behavior for knowledge-session identity,
- preserve current retrieval behavior as the execution core,
- add the minimum storage/runtime wiring needed to unblock `P2B-05`.

### Out of scope

- introducing a new workflow lane or changing lane semantics,
- turning the knowledge path into full workflow orchestration parity with lane sessions,
- redesigning retrieval, indexing, embedding, ranking, or evidence selection behavior,
- broad `.opencode` compatibility mirror expansion,
- full upstream transcript/session subsystem parity,
- unrelated CLI redesign.

---

## Compatibility With the Current Stateless Knowledge Path

1. **Execution core stays recognizable.**
   - Retrieval still runs through the existing `runRetrieval()` path.

2. **Existing output fields stay stable.**
   - `command`, `repo`, `intent`, `tools`, `seedTerms`, `workspaceCount`, `resultCount`, `evidenceCount`, `evidencePreview`, `message`, and `guidance` should remain valid.

3. **New fields must be additive.**
   - If session metadata is returned, it should be optional so current JSON/text consumers do not break.

4. **Stateless internals remain available as a seam.**
   - The bridge should wrap the current behavior rather than deleting the stateless helper shape outright.

5. **Failure semantics become stricter only when a session id is explicitly involved.**
   - Missing user input remains the current error.
   - Invalid/missing/unresumable session id becomes a new explicit command-level failure.
   - Absence of a session id should lead to bridge-session creation, not a compatibility break.

---

## Technical Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Bridge accidentally reuses lane session semantics | Would blur approved boundaries and complicate resume rules | Keep knowledge-session storage/orchestration separate from lane workflow ownership |
| Compaction is hooked too early or too broadly | Could change retrieval behavior beyond the unblock target | Trigger compaction only in the knowledge-command preflight path and keep it behind existing DH config behavior |
| Report shape breaks current CLI/JSON consumers | Current commands and presenters assume the old shape | Make all session metadata additive and preserve existing fields |
| Knowledge-session resume stays ambiguous | Would fail AC-5 and AC-6 from the approved scope | Define explicit create/resume/invalid-session behavior in the bridge contract before integration |
| Implementation tries to chase full upstream parity | Would exceed the narrow `P2B-05` unblock goal | Keep the bridge command-scoped and reuse DH-native runtime modules only |

---

## Solution Slices

### Slice 1: Define the knowledge-session bridge contract

- **Goal:** Establish the minimal create/resume/report contract before touching retrieval integration.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `apps/cli/src/runtime-client.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/shared/src/types/session-runtime.ts` (only if needed)
- **Details:**
  - Add additive input fields for session linkage, such as an optional knowledge-session id or resume token.
  - Define additive report fields for session id, resumed/new-session state, and compaction status.
  - Define explicit error outcomes for missing, invalid, foreign-repo, or non-resumable sessions.
  - Keep the current report contract backwards-compatible for callers that ignore the new fields.
- **Validation path:**
  - `npm run check`
  - targeted tests for bridge contract/report shape in `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`

### Slice 2: Add dedicated knowledge-session persistence and bridge service

- **Goal:** Create the minimum storage/runtime layer needed for knowledge-session identity and reuse.
- **Files:**
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
  - `packages/storage/src/sqlite/db.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.ts`
  - `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.test.ts`
  - optionally reuse:
    - `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
    - `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
- **Details:**
  - Persist knowledge-session identity and latest bridge metadata separately from lane sessions unless implementation proves reuse is cleaner without semantic drift.
  - Reuse session runtime events and summary records where their current contracts are already sufficient.
  - Keep schema changes additive only.
- **Validation path:**
  - `npm run check`
  - targeted repo tests for create/load/update/resume failure cases

### Slice 3: Integrate compaction and retrieval through the bridge

- **Goal:** Unblock `P2B-05` by making compaction callable in the knowledge-command path before large prompt submission.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/session-compaction.ts` (only if input shape needs a minimal extension)
  - `packages/runtime/src/session/session-summary.ts` (only if knowledge summary updates need a helper change)
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- **Details:**
  - Resolve or create the bridge session before prompt assembly.
  - Load prior summary/runtime events.
  - Run compaction preflight when the assembled knowledge context exceeds current thresholds.
  - Execute the existing retrieval core.
  - Persist post-run summary/event state and return additive session metadata.
- **Validation path:**
  - `npm run check`
  - targeted tests proving:
    - new session creation,
    - resume path,
    - invalid session failure,
    - compaction trigger path,
    - no regression to current retrieval report fields.

### Slice 4: CLI and presentation compatibility

- **Goal:** Expose session-backed behavior to operators without forcing a broad CLI redesign.
- **Files:**
  - `apps/cli/src/commands/ask.ts`
  - `apps/cli/src/commands/explain.ts`
  - `apps/cli/src/commands/trace.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Details:**
  - Add only the smallest input surface needed for session reuse, if any.
  - Preserve current text output by default.
  - If session metadata is shown, keep it compact and additive.
  - Preserve `--json` behavior with additive keys only.
- **Validation path:**
  - `npm run check`
  - presenter tests plus any command-focused tests added in implementation

---

## Sequencing and Dependency Graph

### Required order

1. **Slice 1** must land first so implementation has a fixed create/resume/report contract.
2. **Slice 2** follows because the bridge needs persistence before command integration is honest.
3. **Slice 3** depends on Slices 1-2 and is the actual `P2B-05` unblock step.
4. **Slice 4** can run after Slice 1 in parallel with late Slice 2 work, but it must not merge before Slice 3 because CLI behavior depends on the final bridge contract.

### Critical path

**Bridge contract -> bridge persistence -> command integration with compaction -> CLI/presenter alignment**

### Parallelism guidance

- Safe parallel work:
  - storage repo implementation and CLI presentation prep **after** Slice 1 is stable.
- Not safe in parallel:
  - compaction hook integration before session create/resume semantics are fixed.

---

## Validation Matrix

| Target | Validation |
|---|---|
| Command remains compatible for existing callers | `run-knowledge-command` tests + presenter tests confirm existing report fields still render correctly |
| New knowledge session is created when no session id is provided | targeted bridge tests + workflow test |
| Existing knowledge session can be resumed | targeted bridge tests + workflow test |
| Invalid or foreign-repo session id fails clearly | targeted bridge tests + workflow test |
| Compaction runs only after session linkage exists | targeted workflow/bridge tests around preflight compaction path |
| `P2B-05` is honestly unblocked | evidence that compaction is hooked into `ask` / `explain` / `trace` before large prompt submission |
| No unintended retrieval redesign | regression assertions on result/evidence counts and existing report fields |

Primary repo-native commands:

- `npm run check`
- `npm run test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `npm run test -- packages/runtime/src/session/knowledge-command-session-bridge.test.ts`
- `npm run test -- packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.test.ts`
- `npm run test -- apps/cli/src/presenters/knowledge-command.test.ts`

If command-focused CLI tests do not exist yet, implementation should add only the minimum targeted coverage needed for the bridge contract and presenter compatibility.

---

## Explicit Notes for Implementation, Review, and QA

### Fullstack Agent must preserve

- no new workflow lane,
- no retrieval/indexing redesign,
- additive report fields only,
- compaction integration only after session linkage is established,
- existing stateless retrieval helper behavior as the execution core.

### Code Reviewer must verify

- bridge logic stays isolated from lane workflow semantics,
- storage additions are additive and narrowly scoped,
- `run-knowledge-command.ts` remains a wrapper around existing retrieval behavior rather than a rewritten retrieval stack,
- failure handling for missing/invalid session ids is explicit and tested.

### QA Agent must verify

- `ask` / `explain` / `trace` still work for the basic no-session-input path,
- resumed knowledge sessions behave predictably,
- compaction is only considered unblocked when it demonstrably runs on the knowledge-command path with valid session linkage,
- output compatibility is preserved for text and JSON modes.

---

## Short Decision Summary

The recommended solution is to add a **dedicated knowledge-session bridge** around the existing stateless knowledge command flow, not to create a new lane or mirror the full upstream session subsystem. The bridge should own session create/resume semantics, reuse DH’s current summary/runtime-event/compaction foundations, preserve current retrieval behavior as the execution core, and expose only additive CLI/report changes. That is the smallest adequate path to unblock `P2B-05` while staying aligned with DH reality.
