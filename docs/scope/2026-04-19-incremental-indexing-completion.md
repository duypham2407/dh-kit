---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: INCREMENTAL-INDEXING-COMPLETION
feature_slug: incremental-indexing-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Incremental Indexing Completion

INCREMENTAL-INDEXING-COMPLETION finishes the bounded incremental freshness contract for DH. The feature makes Rust authoritative for deciding whether a file is unchanged, changed, invalidated, degraded, or no longer current; for recomputing file-owned facts; for expanding invalidation when outward structure or public API truth changes; and for clearing stale facts when refresh is unsafe or fails. TypeScript remains responsible only for surfacing that freshness and degradation truth honestly to operators. This work is about correctness and inspectability of one-shot and on-demand incremental reindex behavior, not watch-mode rollout, daemon/service architecture, or broad speed promises.

## Goal

- Complete truthful incremental indexing for changed-file, deleted-file, renamed-file, and affected-dependent cases.
- Ensure “incremental” means “smallest safe reindex scope” rather than “skip work even when current truth would become stale.”
- Let operators trust freshness and degraded-state reporting after an incremental run without needing to inspect storage internals.

## Target Users

- Operators running DH indexing and query workflows on repositories that change over time and who need to know whether parser-backed facts are still current.
- Maintainers, reviewers, and QA who need one inspectable contract for when file-only refresh is enough versus when dependent or broader invalidation is required.
- Solution Lead and downstream implementers who need a bounded freshness-correctness target without reopening watch mode, daemon/service mode, or broad performance scope.

## Problem Statement

- The repository already has incremental-indexing direction, stored hash concepts, dirty-set building, and stale-fact/degraded honesty guards spread across migration and solution artifacts.
- What is still missing is one canonical product contract for all of the following together:
  - how a file is treated as unchanged versus confirmed changed
  - what `content_hash`, `structure_hash`, and `public_api_hash` mean in product behavior
  - when invalidation stops at the file, expands to dependents, or expands more broadly
  - how stale facts are removed or withheld when refresh fails
  - what operators are allowed to believe after a changed-file incremental run
- Without this scope, DH risks a fast-looking but misleading incremental path where changed files or downstream dependents continue to look current after exported-contract changes, deletion, fatal parser/adapter/binding failures, or broader resolution-basis changes.
- This feature exists to close that correctness gap. It is not primarily a performance feature, and it must prefer truthful freshness over aggressive skipping.

## In Scope

- Preserve the current architecture split:
  - Rust owns parser/indexer/storage freshness truth, change confirmation, invalidation expansion, and stale-fact cleanup behavior.
  - TypeScript owns operator-visible freshness/degraded reporting only.
- Define bounded incremental change-detection semantics for one-shot and on-demand reindex behavior.
- Define the in-scope roles of the stored freshness fingerprints:
  - `content_hash`
  - `structure_hash`
  - `public_api_hash`
- Define minimum truthful invalidation behavior for:
  - file-only reindex
  - dependent invalidation
  - broader package/root invalidation when the resolution basis changes
- Define stale-fact cleanup guarantees for changed, deleted, renamed-away, invalidated, degraded, and fatally failed files.
- Define recoverable versus fatal failure behavior for parser, adapter, binding, read, and write/persist paths as it affects freshness truth.
- Define operator-visible reporting boundaries for current, refreshed, degraded, and no-longer-current parser-backed truth.
- Preserve compatibility with future watch-mode reuse only at the semantic level: the same invalidation semantics must remain reusable later, without making watch-mode rollout part of this feature.

## Out of Scope

- Broad watch-mode rollout, daemon/service mode, background indexing services, or remote/distributed execution.
- Promising real-time, per-keystroke, or universal file-watcher freshness.
- Promising zero-cost indexing or treating performance improvement as the success condition for this feature.
- Unrelated performance benchmarking or broad optimization work beyond what is needed to keep incremental correctness bounded and truthful.
- Adding new languages, new query classes, or broader relation-depth claims outside the already approved Rust + TypeScript truth/reporting architecture.
- Treating retrieval hits, cached answers, or prior successful runs as proof that parser-backed facts are still current after invalidation or fatal refresh failure.
- Any solution choice that narrows invalidation below the truthful minimum in order to save work.

## Main Flows

- **Flow 1 — As an operator, I change only a file’s local implementation**
  - I run an incremental reindex after editing a file.
  - Rust confirms the file changed and refreshes that file.
  - If the file’s outward structural/public contract does not require downstream invalidation, only that file is refreshed and unaffected files remain current.

- **Flow 2 — As an operator, I change a file’s outward contract**
  - I add, remove, rename, or otherwise change exported/public-facing declarations or another outward dependency surface that changes dependent truth.
  - Rust invalidates the changed file and the affected dependents.
  - TypeScript surfaces that the refresh scope expanded and does not imply downstream facts stayed current merely because only one file was edited directly.

- **Flow 3 — As an operator, I delete or rename a file**
  - The old path stops being current parser-backed truth.
  - File-owned facts for the old path are removed or tombstoned so they do not look current.
  - A new path, if present, is treated as a new file path, and affected downstream consumers are invalidated truthfully.

- **Flow 4 — As an operator, I trigger a broader resolution-basis change**
  - I change workspace/package configuration such as `tsconfig`, `Cargo.toml`, `go.mod`, or another in-scope resolution input.
  - Rust widens invalidation beyond the changed config file itself.
  - The product does not present the run as a simple file-only incremental refresh.

- **Flow 5 — As an operator, a changed file refresh degrades but still yields some current facts**
  - A parser/adapter/binding issue is recoverable for the current run.
  - Rust may keep partial current-run facts plus diagnostics.
  - TypeScript reports the file/scope as degraded and does not mix prior stronger facts into the current truth story.

- **Flow 6 — As an operator, a refresh fails fatally**
  - A parser, adapter, binding, read, or persist path fails in a way that makes current facts unsafe.
  - Rust clears, withholds, or otherwise invalidates stale current-looking facts for the affected scope.
  - TypeScript reports the affected scope as failed/degraded/not current instead of fresh.

## Business Rules

### Truth ownership and freshness authority

- Rust is the only truth source for file freshness, confirmed change status, invalidation scope, parse/index status, stale-fact cleanup, and whether parser-backed facts are current after a run.
- TypeScript may summarize that truth for operators, but it must not invent, widen, or strengthen freshness claims beyond what Rust exposes.
- If Rust cannot truthfully say a file or affected scope is current, TypeScript must not present that scope as current.

### Change-detection semantics

- Each incremental run compares the current workspace/package scan against the previously indexed snapshot for existence and freshness signals.
- Existence, file size, and modification time may be used as a fast suspicion screen.
- `content_hash` is the confirmation truth for a suspected changed file.
- A file confirmed changed by content must be re-evaluated in that run. Incremental behavior may reduce unaffected scope, but it may not skip the changed file itself.
- A file may remain current from prior indexed truth only when both of the following are true:
  - it is not confirmed changed in the current run
  - it is not pulled into a wider invalidation scope by another change

### Fingerprint roles in this feature

| Fingerprint | Product role |
| --- | --- |
| `content_hash` | Canonical confirmation that file content changed and that the file itself must be re-evaluated. |
| `structure_hash` | Boundary for whether normalized structural facts and file-owned graph edges must be rewritten even when the file’s outward public contract may not have changed. |
| `public_api_hash` | Boundary for whether downstream dependents/consumers must be invalidated because the file’s exported/public-facing contract changed. |

- These hashes are internal freshness proof surfaces, not a promise that raw hash values become first-class operator-facing output.

### Minimum invalidation rules

| Trigger | Minimum invalidation scope | Required truthful outcome |
| --- | --- | --- |
| No confirmed file change and no broader invalidation trigger | none | Prior valid facts may remain current. |
| Confirmed content change, but no structural/public-contract expansion is required | changed file only | The changed file is re-evaluated and its file-owned facts are rewritten; unaffected dependents stay current. |
| `structure_hash` changed while `public_api_hash` did not | changed file structural scope, plus any directly related recalculation needed for correctness | File-owned structural facts/edges are rewritten. Solution may widen for correctness, but may not claim dependent freshness if downstream truth actually changed. |
| Import list or local resolution inputs changed without proving outward public-contract change | changed file plus directly affected resolution scope | The system may keep invalidation narrower than full dependent expansion only if downstream truth remains correct. |
| `public_api_hash` changed | changed file plus affected dependents | Dependents are invalidated and re-evaluated enough to keep imports/references/calls truthful; stale downstream facts must not look current. |
| File deleted or rename removes the old path | old path plus affected dependents | Old-path facts are removed or tombstoned; downstream consumers are invalidated; a new path, if any, is treated as a new file path. |
| Workspace/package resolution config changed (`tsconfig`, `Cargo.toml`, `go.mod`, or equivalent in-scope config) | broader package/root scope | The system widens invalidation beyond file-only refresh and must not present the run as narrowly unaffected freshness. |

- Correctness beats speed. The solution may widen invalidation above these minimums if needed for truthful results, but it may not narrow below them to save work.
- This feature does not require a specific implementation shape for dependent refresh. Re-resolution, file-level re-extraction, or another bounded mechanism is acceptable if the resulting truth is correct and inspectable.

### Stale-fact cleanup guarantees

- After a completed incremental run, no parser-backed fact may appear current for a file that was:
  - deleted
  - renamed away from its old path
  - fatally failed during refresh
  - invalidated but not truthfully refreshed
- When a file is refreshed successfully, its current truth must come from the current run’s evaluation, not from mixed old/new fact state.
- When a file refresh is only partially successful, only the current run’s partial facts may remain current, and they must be surfaced as degraded.
- When a dependent is invalidated by upstream outward change but has not yet been successfully refreshed, affected downstream relations must surface as degraded/unresolved/not current rather than carrying forward prior freshness implicitly.
- Retrieval-only results, cached prior answers, or unrelated search hits must not mask missing current parser-backed truth.

### Recoverable versus fatal failure rules

- Recoverable parser, adapter, or binding problems may preserve partial current-run facts plus diagnostics when that is safe.
- Recoverable issues must produce degraded reporting for the affected file/scope; they must not inherit the previous run’s stronger freshness claim.
- Fatal parser, adapter, binding, read, or persist/write failures make the affected file/scope not current for parser-backed use until a successful refresh occurs.
- If invalidation expansion, fact replacement, or persistence cannot complete truthfully, the product must widen degraded/not-current reporting rather than leaving stale current-looking facts in place.

### Operator-visible freshness and degraded-reporting rules

- TypeScript operator surfaces must keep these states distinct in outward behavior:
  - retained current without reindex because the scope truly remained unchanged/unaffected
  - refreshed successfully in the current run
  - degraded/partial current because only limited current-run truth is safe
  - failed/not current because safe current parser-backed truth is unavailable
- TypeScript may not infer “fresh/current” from:
  - a prior successful run alone
  - retrieval success alone
  - the fact that only one source file was edited directly
  - the absence of a visible error when Rust marked the scope invalidated or degraded
- Operator-visible wording must remain honest about what still works, what is limited, and why.

## Acceptance Criteria Matrix

- **AC1** — **Given** a file whose prior indexed snapshot remains unchanged and which is not touched by any wider invalidation trigger, **when** an incremental run completes, **then** the system may keep that file’s prior valid facts current and does not need to mark the file as refreshed in the current run.
- **AC2** — **Given** a file confirmed changed by current-run freshness checks, **when** incremental indexing completes, **then** that file is re-evaluated in the current run and is not treated as unchanged merely because broader scope was kept small.
- **AC3** — **Given** a confirmed content change whose outward contract does not require downstream invalidation, **when** the run completes, **then** the changed file’s file-owned facts are refreshed and unaffected dependents remain current without being falsely marked stale.
- **AC4** — **Given** a change that alters `structure_hash` but not `public_api_hash`, **when** the run completes, **then** file-owned structural facts/edges are rewritten for the changed file and the product does not claim broader dependent invalidation unless downstream truth actually required it.
- **AC5** — **Given** a change that alters `public_api_hash`, **when** the run completes, **then** affected dependents are invalidated and re-evaluated enough that downstream imports, references, and related parser-backed facts do not continue to look current from the pre-change run.
- **AC6** — **Given** a file deletion or a rename that removes the old path, **when** the run completes, **then** old-path facts no longer appear as current parser-backed truth and affected downstream consumers are invalidated truthfully.
- **AC7** — **Given** a workspace/package resolution-basis change such as `tsconfig`, `Cargo.toml`, or `go.mod`, **when** incremental indexing completes, **then** the run widens invalidation beyond a file-only story and does not present the repository as narrowly unaffected if resolution truth could have changed more broadly.
- **AC8** — **Given** a recoverable parser, adapter, or binding problem during refresh, **when** the run completes, **then** the affected file/scope may retain only safe current-run partial facts plus diagnostics and is surfaced as degraded rather than fully current.
- **AC9** — **Given** a fatal parser, adapter, binding, read, or persist/write failure during refresh, **when** the run completes, **then** stale parser-backed facts for the affected file/scope are not presented as current and the outward state is failed, degraded, or otherwise explicitly not current.
- **AC10** — **Given** an affected dependent or invalidated scope that could not yet be truthfully refreshed, **when** an operator inspects parser-backed results, **then** those results surface degraded/unresolved/not-current state instead of silently using prior freshness.
- **AC11** — **Given** a touched operator-facing freshness/degradation surface, **when** reviewers compare it to Rust freshness truth for the same run, **then** TypeScript reporting does not create a second source of truth or claim freshness stronger than Rust exposed.
- **AC12** — **Given** retrieval-only search hits, cached results, or prior successful answers that still exist elsewhere in the product, **when** a file/scope has been invalidated, degraded, deleted, or fatally failed for parser-backed freshness, **then** those other surfaces do not cause the parser-backed truth to look current.
- **AC13** — **Given** the completed scope package, **when** Solution Lead begins design, **then** they can map change-detection rules, hash roles, invalidation scopes, stale-fact cleanup guarantees, and degraded/fatal reporting behavior without inventing product semantics.

## Edge Cases

- Comment-only or whitespace-only edits change file content but may leave structural and public-contract truth unchanged.
- A file’s import list or local resolution inputs change while its exported/public-facing API does not.
- A file is renamed across directories or packages, so the old path must stop looking current even if most content is unchanged.
- Multiple changed files in the same run invalidate overlapping dependent sets.
- One changed file refreshes successfully while one of its invalidated dependents degrades or fails.
- A workspace/package config change broadens invalidation far beyond the directly edited config file.
- A file moves from healthy in the prior run to recoverable or fatal in the current run, and the product must not retain the old stronger state.
- Retrieval/search surfaces can still find affected files even while parser-backed freshness for those files is degraded or not current.

## Error And Failure Cases

- The feature fails if a confirmed changed file is treated as unchanged in order to keep the run narrowly incremental.
- The feature fails if `public_api_hash`-level outward changes do not invalidate affected dependents and downstream facts continue to look current.
- The feature fails if deletion or rename leaves old-path facts queryable as current parser-backed truth.
- The feature fails if fatal parser, adapter, binding, read, or persist/write failure leaves the last successful facts looking current.
- The feature fails if recoverable refresh problems quietly inherit the previous run’s stronger freshness story.
- The feature fails if TypeScript operator output reports fresh/current state that Rust did not actually establish.
- The feature fails if retrieval-only hits, cached answers, or other non-parser-backed surfaces hide missing current parser-backed truth.
- The feature fails if workspace/package resolution changes are handled as file-local only when broader invalidation is required for truthful results.
- The feature fails if implementation broadens into watch-mode promises, daemon/service rollout, or unrelated performance-marketing claims in order to satisfy this scope.

## Open Questions

- None blocking at Product Lead handoff.
- Solution Lead should choose the concrete outward wording/report surfaces for freshness states, but that wording must preserve the distinctions in this scope instead of collapsing them into a generic success/failure story.

## Success Signal

- Operators can trust that a bounded incremental run either keeps parser-backed facts current truthfully or reports why some affected scope is degraded/not current.
- File-only changes stay file-only when that is safe, while outward/public-contract changes trigger truthful downstream invalidation.
- Deleted, renamed-away, invalidated, and fatally failed files no longer appear current after the run completes.
- TypeScript freshness/degraded reporting stays aligned with Rust truth and does not overstate what the current run proved.
- The feature improves correctness and inspectability of incremental indexing without promising broad watch-mode or zero-cost behavior.

## Handoff Notes For Solution Lead

- Preserve the approved architecture split:
  - Rust owns change confirmation, freshness truth, invalidation scope, stale-fact cleanup, and parser-backed current-state authority.
  - TypeScript owns operator-visible reporting only.
- Use `docs/migration/deep-dive-01-indexer-parser.md` section 3.2 as the lower-level reference for incremental indexing and stored-hash intent, but preserve this scope’s product minimums if implementation simplification would otherwise leave stale truth visible.
- Preserve the stale-fact cleanup and degraded-honesty guards already established in:
  - `docs/solution/2026-04-18-multi-language-support.md`
  - `docs/solution/2026-04-18-language-depth-hardening.md`
- Keep solution work bounded to correctness and inspectability. Do not reopen watch mode, daemon/service mode, or unrelated benchmarking scope.
- The solution package must explicitly map:
  - change triggers to invalidation scopes
  - `content_hash`, `structure_hash`, and `public_api_hash` to their behavioral roles
  - recoverable versus fatal failure paths
  - stale-fact cleanup behavior for changed/deleted/renamed/failing files
  - operator-visible freshness/degraded reporting surfaces and wording boundaries
- If current implementation reality cannot support a stronger freshness claim on a touched surface, narrow the outward claim first rather than preserving optimistic wording.
- Validation planning in the solution package must include positive, degraded, fatal, deletion/rename, dependent-invalidation, and workspace-config-change paths.
