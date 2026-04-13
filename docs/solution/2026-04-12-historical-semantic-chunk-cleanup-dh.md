# Solution Package: Telemetry-Driven Historical Semantic Chunk Cleanup (DH)

**Date:** 2026-04-12  
**Approved scope:** `docs/scope/2026-04-12-historical-semantic-chunk-cleanup-dh.md`  
**Analysis input:** `docs/opencode/telemetry-driven-historical-semantic-chunk-cleanup-analysis-dh.md`

---

## Recommended Path

Implement a **telemetry-driven storage remediation flow** for historical semantic chunk paths: capture a baseline from existing telemetry, discover and classify historical `chunks.file_path` rows, support a mandatory `dry-run` report, and allow `apply` only for rows that can be canonicalized deterministically.

This is enough for DH's current architecture because the needed boundaries already exist:

- `packages/retrieval/src/semantic/telemetry-collector.ts` already records and summarizes unresolved semantic/evidence path events.
- `packages/storage/src/sqlite/repositories/chunks-repo.ts` is the storage boundary for historical chunk rows and is the correct place to add targeted discovery/update operations.
- `packages/storage/src/sqlite/repositories/embeddings-repo.ts` already exposes bounded orphan cleanup via `deleteOrphaned()`.
- DH already has repo-native verification commands: `npm run check` and `npm run test`.

This solution is **telemetry-driven remediation only**. It is **not retrieval redesign**, **not segmentation work**, **not ranking/planner/index redesign**, and **not a forced full cache rebuild or re-embed**.

---

## Repository Reality Constraints

1. **Read-time hardening is already baseline.**
   - Historical mixed-path chunk data no longer blocks retrieval correctness because read paths already normalize or surface unresolved cases.
   - This task exists to reduce operational debt and telemetry noise, not to re-fix retrieval correctness.

2. **Telemetry is file-backed and local to the repo.**
   - `telemetry-collector.ts` appends JSONL events to `.dh/telemetry/events.jsonl` and exposes `readTelemetryEvents(...)` plus `summarizeTelemetry(...)`.
   - The remediation flow should consume this existing surface instead of inventing a second operational signal source.

3. **Chunk and embedding storage are already separated cleanly.**
   - `ChunksRepo` owns `chunks.file_path` and chunk lookup/update concerns.
   - `EmbeddingsRepo` should stay focused on chunk-linked embedding integrity and bounded orphan cleanup.

4. **The repo has test and typecheck commands.**
   - Validation should use `npm run check` and `npm run test`.
   - The solution should prefer additive repository APIs and tests rather than undocumented manual-only verification.

5. **Historical ambiguity must stay observable.**
   - Some rows will remain unresolved after the first pass.
   - Success means safe deterministic cleanup plus explicit reporting of the unresolved residue, not pretending all legacy rows are fixable.

---

## Architecture Decisions

### AD-1: Keep retrieval behavior unchanged; remediate storage debt around it

The historical cleanup flow must operate as a storage-level remediation tool that improves the quality of persisted chunk paths while preserving the already-completed retrieval/evidence hardening as baseline behavior.

### AD-2: Telemetry drives prioritization, storage inspection drives mutation

Existing unresolved telemetry is the trigger for scope and before/after verification, but actual rewrite decisions must be based on current storage inspection plus deterministic path resolution rules, not telemetry alone.

### AD-3: `chunks.file_path` is the only primary rewrite target in this slice

This remediation updates historical chunk path values when safe. It does not redesign chunk schema, embedding schema, or semantic result contracts.

### AD-4: Dry-run and apply are separate modes with identical classification logic

The remediation flow should classify rows once and expose the same classification model to both reporting and mutation paths. `apply` may only act on the exact subset identified as deterministically convertible by the same logic used in `dry-run`.

### AD-5: Ambiguous rows remain unresolved and explicitly reported

If a historical row cannot be mapped to a canonical repo-relative path with deterministic evidence, it must stay unchanged and be counted/reported as unresolved rather than force-fixed.

### AD-6: Embedding cleanup is integrity-preserving follow-up only

This scope does not redesign embeddings. `EmbeddingsRepo.deleteOrphaned()` may be used as a post-apply guard if cleanup introduces orphan risk, but the main success condition is chunk-path remediation and integrity preservation.

### AD-7: First slice is one bounded remediation flow, not a recurring redesign loop

The approved path is a practical first pass: a bounded cleanup command/job with baseline, dry-run, apply, and verification. A future incremental loop is optional backlog only if post-cleanup telemetry still shows meaningful recurring debt.

---

## Impacted Surfaces

### Primary implementation surfaces

| File | Why it changes |
|---|---|
| `packages/storage/src/sqlite/repositories/chunks-repo.ts` | Add historical candidate discovery, classification support, and batch-safe file-path update operations for cleanup |
| `packages/storage/src/sqlite/repositories/embeddings-repo.ts` | Reuse existing orphan cleanup/integrity support and add tests only if cleanup integration needs stronger verification |
| `packages/retrieval/src/semantic/telemetry-collector.ts` | Reuse baseline and before/after summary surface; may need additive helpers if the cleanup flow needs filtered reporting windows |

### Likely orchestration / runtime surfaces

| File | Why it changes |
|---|---|
| `packages/retrieval/src/semantic/telemetry-collector.test.ts` | Extend tests for telemetry baseline/reporting behavior used by remediation verification |
| `packages/storage/src/sqlite/repositories/repos.test.ts` or a new focused repo test file | Validate chunk candidate discovery, classification reporting, batch updates, and no-op behavior for unresolved rows |
| `package.json` | Only if a dedicated cleanup script/entrypoint is introduced and needs a stable operator command |

### New file/module surface likely needed

| File | Why it likely needs to be created |
|---|---|
| `packages/storage/src/sqlite/repositories/chunks-cleanup-repo.test.ts` or equivalent | Focused storage tests are cleaner than overloading unrelated repo tests |
| `packages/retrieval/src/semantic/historical-chunk-cleanup.ts` or equivalent runtime module | Centralize remediation orchestration: baseline capture, classification, reporting, and apply sequencing |
| `packages/retrieval/src/semantic/historical-chunk-cleanup.test.ts` | Validate dry-run/apply behavior end to end with repo-local DB and telemetry fixtures |

> Exact new-module placement can follow DH's existing package conventions, but the runtime orchestration should stay thin and call into repository methods rather than embedding SQL in command code.

---

## Technical Risks

| Risk | Why it matters | Planned mitigation |
|---|---|---|
| Over-remediation of ambiguous legacy paths | Wrong canonicalization is worse than leaving historical debt observable | Apply only to deterministically convertible rows; unresolved rows remain unchanged and reported |
| High-blast-radius DB mutation | Bulk path updates are harder to inspect and recover if not bounded | Mandatory dry-run, batch-safe apply, and explicit before/after reporting |
| Misleading telemetry improvement | Short traffic windows could hide unresolved debt without real cleanup value | Pair telemetry comparison with storage-level counts from discovery/classification output |
| Chunk/embedding integrity drift | Cleanup could leave the DB in a worse consistency state | Add explicit post-apply integrity checks and bounded `deleteOrphaned()` follow-up when needed |
| Scope creep into retrieval redesign | Implementation may drift into planner/search/index changes | Keep all slices tied to telemetry, storage classification, and remediation flow only |

---

## Phased Implementation Plan

### Phase 0: Baseline capture and scope freeze

- **Goal:** Freeze this task as historical semantic chunk remediation only and capture the operational baseline used to judge improvement.
- **Primary files:**
  - `docs/scope/2026-04-12-historical-semantic-chunk-cleanup-dh.md`
  - `docs/opencode/telemetry-driven-historical-semantic-chunk-cleanup-analysis-dh.md`
  - `packages/retrieval/src/semantic/telemetry-collector.ts`
  - `packages/retrieval/src/semantic/telemetry-collector.test.ts`
- **Work:**
  - confirm the implementation path is explicitly limited to historical semantic chunk cleanup
  - capture baseline telemetry summary for unresolved semantic/evidence paths
  - define the cleanup report shape DH will use for before/after comparison: scanned rows, canonical rows, convertible rows, unresolved rows, representative examples
  - if needed, add a small helper for filtered telemetry summary windows without changing existing telemetry semantics
- **Dependencies:** none
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 1: Historical candidate discovery and classification

- **Goal:** Give DH a deterministic way to inspect historical chunk rows and classify them without mutating data.
- **Primary files:**
  - `packages/storage/src/sqlite/repositories/chunks-repo.ts`
  - `packages/storage/src/sqlite/repositories/chunks-cleanup-repo.test.ts` or equivalent new test file
  - `packages/retrieval/src/semantic/historical-chunk-cleanup.ts` or equivalent orchestration module
- **Work:**
  - add repository methods to scan historical chunk rows and return cleanup candidates with stable metadata
  - classify rows into exactly three approved groups:
    1. already canonical,
    2. deterministically convertible,
    3. unresolved / unsafe to rewrite
  - keep the classification rules explicit and explainable in reports
  - ensure discovery output is suitable for both storage-level testing and remediation reporting
- **Dependencies:** Phase 0
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 2: Dry-run remediation flow

- **Goal:** Produce a mandatory pre-mutation report that shows blast radius and candidate quality before any write path exists.
- **Primary files:**
  - `packages/retrieval/src/semantic/historical-chunk-cleanup.ts` or equivalent
  - `package.json` if a stable script entry is added
  - focused tests for dry-run reporting
- **Work:**
  - implement a `dry-run` execution path that reads telemetry baseline and storage candidates together
  - emit/report at minimum:
    - rows scanned,
    - rows already canonical,
    - rows safe to convert,
    - rows unresolved,
    - representative path examples
  - make the output good enough for operator approval before apply
  - ensure dry-run is side-effect free for storage
- **Dependencies:** Phase 1
- **Validation hook:**
  - `npm run check`
  - `npm run test`
  - manual smoke: run the cleanup flow in dry-run mode against a seeded test repo or fixture DB and confirm no mutation occurs

### Phase 3: Controlled apply and integrity checks

- **Goal:** Update only deterministic historical chunk paths and prove storage integrity stays intact.
- **Primary files:**
  - `packages/storage/src/sqlite/repositories/chunks-repo.ts`
  - `packages/storage/src/sqlite/repositories/embeddings-repo.ts`
  - `packages/retrieval/src/semantic/historical-chunk-cleanup.ts`
  - focused repository/integration tests
- **Work:**
  - add batch-safe path update operations keyed by chunk identity
  - implement `apply` so it only mutates the exact deterministic candidate set produced by the classification logic
  - keep unresolved rows unchanged and report them explicitly
  - run post-apply storage verification, including orphan detection/cleanup if required by the implementation path
  - keep the blast radius bounded to historical chunk path remediation
- **Dependencies:** Phase 2
- **Validation hook:**
  - `npm run check`
  - `npm run test`
  - manual smoke: run apply on a seeded repo/fixture DB and verify updated chunk paths plus unchanged unresolved rows

### Phase 4: Telemetry verification and closure reporting

- **Goal:** Prove the remediation reduced historical operational noise without claiming a redesign or total elimination of ambiguity.
- **Primary files:**
  - `packages/retrieval/src/semantic/telemetry-collector.ts`
  - remediation flow module/tests
  - final ops/reporting surface used by DH for closure notes
- **Work:**
  - compare before/after telemetry summaries in a defined observation window
  - pair telemetry deltas with storage-level before/after classification counts
  - record what debt was removed, what unresolved residue remains, and whether manual follow-up is needed
  - explicitly state that remaining unresolved rows are acceptable when deterministic rewrite was not possible
- **Dependencies:** Phase 3
- **Validation hook:**
  - `npm run check`
  - `npm run test`
  - manual verification of reported before/after summary outputs

---

## Dependency Graph

- **Sequential:** Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4
- **Critical path:** baseline first, then classification, then dry-run reporting, then controlled apply, then before/after verification.
- **Parallelism note:**
  - tests within a single phase can be split safely
  - repository API work and remediation orchestration should remain tightly sequenced because they share one classification model and one apply boundary

---

## Integration Checkpoint

Before DH closes this work, one representative seeded scenario should demonstrate all of the following together:

- telemetry baseline can be captured from existing unresolved semantic/evidence events
- historical chunk rows can be classified into canonical, deterministic-convertible, and unresolved groups
- dry-run reports the expected counts and examples without mutating storage
- apply updates only deterministic rows in `chunks.file_path`
- unresolved rows remain unchanged and visible in reporting
- post-apply integrity checks pass, including bounded embedding orphan cleanup if needed
- after the observation window, unresolved telemetry noise attributable to remediable historical rows is reduced

This checkpoint matters because the task is only successful when telemetry, storage classification, mutation boundaries, and integrity verification all agree.

---

## Validation Strategy

### Required repository commands

- `npm run check`
- `npm run test`

### Validation matrix

| Target | Validation path |
|---|---|
| Cleanup remains telemetry-driven remediation only | Solution/design review plus tests that stay within storage and telemetry surfaces |
| Historical candidates are classified into canonical / convertible / unresolved groups | Repository unit tests around `ChunksRepo` discovery/classification methods |
| Dry-run reports blast radius without mutation | Focused remediation-flow tests plus manual dry-run smoke check |
| Apply updates only deterministic rows | Repository/integration tests asserting unchanged ambiguous rows and updated deterministic rows |
| Chunk/embedding integrity is preserved | Post-apply tests and integrity assertions, including `deleteOrphaned()` behavior when relevant |
| Before/after operational results are observable | Telemetry collector tests plus manual verification of remediation summary output |
| No type/runtime regression from added orchestration or repository APIs | `npm run check` and `npm run test` |

### Reviewer focus

- confirm the implementation does not reopen retrieval design or segmentation work
- confirm classification rules are deterministic and shared by both dry-run and apply
- confirm unresolved rows are intentionally preserved and reported
- confirm storage mutation is bounded and inspectable
- confirm integrity checks are real and not implied by assumption

---

## Compatibility Boundaries

1. **Retrieval compatibility must be preserved.**
   - Existing retrieval/evidence hardening stays in place and is not replaced.
   - This work improves stored historical chunk-path quality but must not require retrieval-contract changes.

2. **Storage compatibility must be preserved.**
   - Keep current chunk and embedding schema.
   - Prefer additive repository APIs and a cleanup orchestration module over schema churn.

3. **No forced full rebuild compatibility requirement.**
   - Success must not depend on a full cache rebuild, full re-embed, or wholesale rewrite of every historical row.

4. **Operator compatibility requires inspectability.**
   - Dry-run output and post-apply reporting must be good enough for a human to understand what changed and what did not.

---

## Out of Scope

- retrieval redesign of any kind, including planner, ranking, ANN/index, evidence architecture, or segmentation changes
- reopening completed semantic path/evidence hardening except as baseline context
- mandatory full semantic cache rebuild or full re-embed as the default remediation path
- broad chunk or embedding schema redesign
- rewriting ambiguous rows without deterministic mapping evidence
- cleanup of unrelated non-semantic storage debt

---

## Explicit Scope Guard

This package is for **telemetry-driven remediation of historical semantic chunk storage only**. It is **not** a retrieval redesign. Any implementation proposal that changes semantic retrieval planning, ranking, segmentation, indexing strategy, or evidence architecture should be rejected as outside the approved DH scope.

---

## Handoff Notes

### FullstackAgent must preserve

- telemetry-driven cleanup scope only
- deterministic rewrite boundaries for `chunks.file_path`
- dry-run before apply
- explicit reporting of unresolved residue
- storage integrity after apply
- no forced full rebuild and no retrieval redesign

### Code Reviewer must preserve

- one shared classification model between dry-run and apply
- no ambiguous-row rewriting hidden behind convenience helpers
- no direct SQL/orchestration sprawl outside the repository boundary without justification
- tests that prove before/after behavior and unchanged unresolved rows

### QA / verification must preserve

- evidence that remediable historical rows were reduced
- evidence that unresolved rows remain explicitly accounted for
- evidence that chunk/embedding integrity is not worse after apply
- evidence that the change is operational data hygiene only, not a retrieval-architecture change
