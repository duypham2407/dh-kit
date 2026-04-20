---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: INCREMENTAL-INDEXING-COMPLETION
feature_slug: incremental-indexing-completion
source_scope_package: docs/scope/2026-04-19-incremental-indexing-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Incremental Indexing Completion

## Chosen Approach

- Complete incremental freshness **Rust-first** by turning the current dirty-set flow into one explicit invalidation planner that owns:
  - changed vs unchanged confirmation
  - `content_hash` / `structure_hash` / `public_api_hash` comparison semantics
  - invalidation-level selection
  - stale-fact cleanup when refresh is unsafe or incomplete
- Keep the architecture boundary unchanged:
  - **Rust owns** file freshness truth, invalidation scope, stale-fact cleanup, run/result honesty, and any persisted freshness metadata.
  - **TypeScript owns** only bounded operator-facing reporting on top of Rust-authored truth, and must not infer freshness from retrieval hits, prior success, or chunk-refresh counts.
- Use the **simplest safe invalidation model** for this feature:
  - always reparse the confirmed changed file
  - widen to structural-local, dependent, or broader resolution-scope invalidation only when the current run proves that widening is required
  - when targeted downstream cleanup is risky, prefer broader file-level invalidation/cleanup over leaving stale facts visible
- Treat rename as **delete-old-path + create-new-path** for freshness truth. Identity preservation across rename is not required for this feature.
- Keep watch mode, daemon/service rollout, and broad performance promises out of scope. This feature is about truthful freshness, not zero-cost indexing.

Why this is enough:

- The repo already has the core building blocks in Rust:
  - file scanning
  - full-file `content_hash`
  - parser-produced `structure_fingerprint` / `public_api_fingerprint`
  - atomic file rewrite and delete cleanup
  - reverse import traversal helpers in storage
- The gap is not missing parser fundamentals. The gap is the missing **single contract** that connects change confirmation, invalidation expansion, stale-fact cleanup, and outward degraded/not-current reporting.
- One Rust-owned invalidation/freshness contract plus narrow TS reporting closes that gap without reopening architecture or overpromising speed.

## Impacted Surfaces

### Rust freshness planner and persistence surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-indexer/src/dirty.rs`
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-indexer/src/scanner.rs`
- `rust-engine/crates/dh-storage/src/lib.rs`
- `rust-engine/crates/dh-parser/src/lib.rs` _(preserve-only unless fingerprint normalization needs tightening)_
- `rust-engine/crates/dh-indexer/tests/integration_test.rs`

### Rust query and operator-truth surfaces

- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-engine/src/main.rs`

### TypeScript reporting and presentation surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`

### Preserve-only non-truth surfaces

- `packages/runtime/src/jobs/index-job-runner.ts`
- `packages/runtime/src/jobs/index-job-runner.test.ts`
- `apps/cli/src/commands/index.ts`

Preserve-only note:

- These TypeScript indexing/chunking surfaces may continue to report chunk refresh counts for their own pipeline, but they must **not** become the parser freshness truth source for this feature.

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Change confirmation and hash semantics | file suspicion screen, `content_hash` confirmation, `structure_hash` / `public_api_hash` computation and comparison | no independent recomputation; only display of Rust-exposed meaning | a TS-authored second interpretation of what changed |
| Invalidation planning | mapping triggers to file-only, structural-local, dependent, or resolution-scope invalidation | request shaping only; caller flags may widen work, never narrow below truth | `expand_dependents=false` suppressing required dependent invalidation |
| Persisted freshness truth | file freshness state, reason, stale-fact cleanup, tombstones, degraded/not-current persistence | consumption and wording only | `parse_status` or retrieval success treated as full freshness proof |
| Query freshness gating | answer-state downgrade, evidence gaps, freshness summaries when parser-backed truth is degraded or unavailable | presentation of those gaps and summaries | grounded answers from stale or invalidated facts |
| Operator-facing wording | Rust-authored report/status payloads and query freshness metadata | CLI/workflow/presenter formatting and bounded messaging | a separate TS-owned current/fresh story |
| Existing TS chunk-index pipeline | none for parser freshness truth | keep its own retrieval/chunk reporting bounded | proof that Rust parser-backed facts are current |

### Architecture boundary to preserve

- Rust remains authoritative for:
  - freshness truth
  - invalidation scope
  - stale-fact cleanup
  - recoverable vs fatal refresh outcome
  - parser-backed current/not-current truth
- TypeScript remains authoritative only for:
  - consuming Rust freshness/degraded summaries
  - formatting operator-visible messages
  - keeping freshness-state separate from existing answer-state and capability-state summaries

### Product boundary to preserve

- No zero-cost or universal performance guarantee.
- No watch-mode rollout.
- No daemon/service architecture work.
- No retrieval-backed freshness proof.
- No path-scoped shortcut that is narrower than the full invalidation rules.

## Interfaces And Data Contracts

## 1. Fingerprint contract

### `content_hash`

- `content_hash` remains the canonical confirmation that file bytes changed.
- Use it only after a fast suspicion screen (mtime / size / existence or explicit path targeting).
- If `content_hash` is unchanged and the file is not pulled into another invalidation scope, the file may remain current from prior facts.
- If `content_hash` changed, the file itself must be reparsed in the current run.

### `structure_hash`

- `structure_hash` represents normalized structural facts for the file, especially symbols/imports/exports shape and file-owned graph edges.
- If `structure_hash` changes while `public_api_hash` does not, the minimum outcome is:
  - rewrite the changed file’s file-owned facts/edges
  - revisit any directly related local resolution scope needed to keep the file truthful
  - do **not** automatically market downstream dependents as invalidated unless the current run proves they are affected

### `public_api_hash`

- `public_api_hash` represents the exported/public-facing contract boundary.
- If `public_api_hash` changes, the minimum outcome is:
  - changed file refresh
  - dependent invalidation expansion
  - no downstream imports/references/calls from the old contract may continue to look current

Contract rule:

- Raw hash values remain internal Rust/storage proof surfaces.
- Operator surfaces should consume **state + reason**, not raw hashes.

## 2. Invalidation levels

Recommended additive execution contract:

- absence of invalidation: unchanged/unaffected file may stay current
- `content_only`
- `structural_local`
- `dependent`
- `resolution_scope`

### Level meanings

| Level | Minimum trigger | Minimum scope | Truth rule |
| --- | --- | --- | --- |
| `content_only` | `content_hash` changed but structural/public outward truth does not expand | changed file only | changed file must be reparsed and atomically rewritten |
| `structural_local` | `structure_hash` changed, or import/local resolution shape changed without proving outward API change | changed file plus directly related local resolution scope | file-owned facts/edges are rewritten; downstream freshness cannot be overstated |
| `dependent` | `public_api_hash` changed, old path deleted, rename-away, or equivalent outward contract loss | changed/removed path plus affected dependents | dependents must be invalidated and stale downstream facts must not remain current |
| `resolution_scope` | workspace/package resolution-basis change (`tsconfig`, `jsconfig`, `Cargo.toml`, `go.mod`, or other explicit resolver inputs already honored by Rust) | broader package/root scope | run must not be reported as file-local only |

Implementation rule:

- The system may widen above these minimums for correctness.
- It may **not** narrow below them to save work.

## 3. File freshness contract

Rust needs one persisted freshness truth surface per file, separate from `ParseStatus`.

Recommended additive contract shape:

- `FreshnessState = retained_current | refreshed_current | degraded_partial | not_current | deleted`
- enough additive metadata to explain why the file is in that state, for example:
  - `freshness_reason`
  - current-run disposition or run id linkage
  - whether the state came from refresh, retained confirmation, invalidation, or failure

Required meanings:

- `retained_current`
  - file was not reparsed in the current run
  - current run confirmed it remained unchanged and unaffected
- `refreshed_current`
  - file was reparsed successfully in the current run
  - current truth comes from the current run only
- `degraded_partial`
  - only safe current-run partial facts remain
  - prior stronger facts are not inherited silently
- `not_current`
  - file/scope was invalidated or fatally failed
  - parser-backed facts are cleared or withheld and must not look current
- `deleted`
  - old path is tombstoned
  - no parser-backed facts remain current for that old path

Contract rule:

- `ParseStatus` remains parse/extraction outcome.
- `FreshnessState` becomes freshness truth.
- `ParseStatus::Parsed` is **not** enough to claim `current` on its own.

## 4. Path-scoped reindex and invalidation contract

### `index_paths`

- `index_paths` must stop being a semantics bypass.
- It should become a thin entrypoint that reuses the same invalidation planner as `index_workspace`.
- `expand_dependents` may request eager widening, but it may never suppress required widening when:
  - `public_api_hash` changed
  - delete/rename-away occurred
  - resolution-basis change requires broader invalidation

### `invalidate_paths`

- `invalidate_paths` is a pre-marking helper, not a success path.
- If used, it should remove the current-looking freshness claim for the targeted file/scope immediately.
- It must not leave a file looking current while merely zeroing the hash or flipping a pending bit.

### rename handling

- The simplest adequate path for this feature is:
  - old path -> tombstone + clear file-owned facts
  - new path -> treat as a new file path
- Optional same-content rename detection is allowed for diagnostics only, not required for semantic equivalence.

## 5. Query and operator-report contract

### Query/evidence behavior

- Query code may not return `grounded` parser-backed answers from files/scopes marked `not_current` or `deleted`.
- If evidence depends on `degraded_partial` files, answer-state must be at most `partial`, with explicit gaps/limitations.
- If stale facts were cleared because refresh was unsafe, the outward answer must show that parser-backed truth is limited or unavailable rather than silently falling back to prior success.

### Bridge / TS behavior

- If query/bridge payloads need a separate freshness summary, make it additive and Rust-authored.
- Keep it separate from:
  - `answerState`
  - `languageCapabilitySummary`
- `run-knowledge-command` and CLI presenters may summarize freshness truth, but they must not infer it.

### Operator output vocabulary for this feature

Required outward distinctions on touched parser-backed surfaces:

- retained current
- refreshed current
- degraded partial current
- not current / failed

Compatibility rule:

- If a surface cannot support all four distinctions honestly, narrow the outward claim first instead of collapsing everything into “fresh” or “success”.

## Risks And Trade-offs

- **Broader invalidation cost**
  - File-level re-extraction or cleanup for dependents may touch more files than an optimized surgical updater.
  - Mitigation: accept broader work in V1. Correctness beats speed for this feature.

- **Freshness-vs-parse-status drift risk**
  - Current storage already persists `parse_status`, but freshness truth needs more than parse outcome.
  - Mitigation: introduce additive freshness metadata instead of overloading `ParseStatus`.

- **Dual indexing-surface truth drift**
  - The repo still has a separate TS chunk/index pipeline used by `dh index`.
  - Mitigation: keep that pipeline explicitly out of parser freshness truth. If untouched, do not reuse its refreshed/unchanged counts as Rust parser freshness proof.

- **Rename simplification trade-off**
  - Treating rename as delete+create loses continuity of file identity across paths.
  - Mitigation: accept that simplification here because stale old-path truth is the correctness requirement.

- **Resolution-basis conservatism**
  - Config-trigger widening may invalidate more than the ideal minimum.
  - Mitigation: conservative package/root invalidation is acceptable; false freshness is not.

- **Query degradation complexity**
  - Clearing stale facts can turn formerly grounded answers into partial/insufficient answers.
  - Mitigation: preserve evidence-first honesty from prior solution packages and make the reason visible rather than hiding it.

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-19-incremental-indexing-completion.md`
- Lower-level design reference for indexer/parser semantics:
  - `docs/migration/deep-dive-01-indexer-parser.md`
- Prior stale-fact and degraded-honesty contracts to preserve:
  - `docs/solution/2026-04-18-multi-language-support.md`
  - `docs/solution/2026-04-18-language-depth-hardening.md`
- Real repo-native validation commands available now:
  - from `rust-engine/`: `cargo test --workspace`
  - from repo root: `npm run check`
  - from repo root: `npm test`
- Real manual smoke path available if implementation needs operator-proof output checks:
  - from `rust-engine/`: `cargo run -q -p dh-engine -- index --workspace <fixture-path>`
  - from `rust-engine/`: `cargo run -q -p dh-engine -- status --workspace <fixture-path>`
- No repo-native lint command exists; do not invent one.
- No new operator environment variables are required for the recommended path.
- No new external package dependency is required for the recommended path.

Preferred implementation discipline:

- add failing Rust tests before behavior upgrades in each slice
- add failing TS tests only when bridge/query presentation contracts change

## Recommended Path

- **Step 1: freeze one Rust-owned freshness contract before changing planner behavior.**
  - Fullstack should not implement broader invalidation first and define freshness truth later.
- **Step 2: replace the current dirty-set-only flow with an explicit invalidation planner.**
  - Both `index_workspace` and `index_paths` should use the same planner.
- **Step 3: enforce stale-fact cleanup as a mandatory outcome, not a best-effort extra.**
  - If a file/scope cannot be refreshed truthfully, it must become degraded or not current.
- **Step 4: make Rust-backed query/operator surfaces freshness-aware and keep TS strictly presentation-only.**
  - Reuse existing evidence/gap patterns instead of inventing optimistic shortcuts.

This is the simplest adequate path because it adds one missing truth contract and reuses the repo’s existing atomic-write, evidence, and bridge foundations.

## Implementation Flow

1. **Write failing Rust tests** for unchanged/content-only/structure/public-api/delete-rename/config/recoverable/fatal/path-scoped cases before changing behavior.
2. **Add additive freshness and invalidation contract types** in Rust storage/types/report surfaces.
3. **Replace dirty-set-only planning** with content confirmation + invalidation expansion and route `index_workspace` and `index_paths` through it.
4. **Extend atomic rewrite and cleanup paths** so invalidated or failed files cannot leave stale facts current.
5. **Make query/bridge/TS reporting freshness-aware** using Rust truth only.
6. **Run one combined integration checkpoint** and narrow any outward freshness claim that the repo cannot now prove.

## Implementation Slices

### Slice 1: Freeze Rust freshness truth and persistence contract

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs`
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/main.rs`
- **Goal:** persist freshness truth separately from parse status and make index/report output capable of distinguishing retained current, refreshed current, degraded partial, not current, and deleted.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - add additive freshness state/reason contract on the Rust side
  - keep `content_hash`, `structure_hash`, and `public_api_hash` internal proof fields rather than operator-facing payloads
  - extend run/report output enough that operators can inspect what the last incremental run actually established
  - reviewer focus: `ParseStatus` must not be reused as the only freshness truth

### Slice 2: Replace dirty-set-only behavior with a real invalidation planner and path-scoped reuse

- **Files:**
  - `rust-engine/crates/dh-indexer/src/dirty.rs`
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-indexer/src/scanner.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs`
  - `rust-engine/crates/dh-parser/src/lib.rs` _(only if fingerprint inputs need stabilization)_
- **Goal:** compute the smallest safe reindex scope from confirmed content changes, structural deltas, public API deltas, deletes/renames, and resolution-basis triggers.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - keep the existing fast suspicion screen, then confirm with `content_hash`
  - after parsing changed files, compare prior vs current `structure_hash` / `public_api_hash`
  - use reverse-import / dependency helpers to expand dependent invalidation when outward contract changes
  - treat rename as delete-old-path + create-new-path for freshness semantics
  - detect explicit resolution-basis triggers conservatively and widen to package/root when needed
  - implement `index_paths` as a thin wrapper around the same planner
  - `expand_dependents` may widen work, but it must never narrow required invalidation
  - reviewer focus: no path-scoped shortcut may be less truthful than workspace reindex semantics

### Slice 3: Make stale-fact cleanup and degraded/not-current widening mandatory

- **Files:**
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-indexer/tests/integration_test.rs`
- **Goal:** ensure no deleted, renamed-away, invalidated, degraded, or fatally failed file can continue to look current through parser-backed facts.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - extend the current atomic `delete old facts -> write new facts` pattern to all invalidated and failed paths
  - if a dependent is invalidated but cannot be truthfully refreshed, prefer file-level cleanup + `not_current` over risky partial relation surgery
  - keep recoverable parse/adapter cases to current-run partial facts only, marked `degraded_partial`
  - fatal read/parse/persist paths must clear or withhold parser-backed facts and clear stronger freshness claims
  - query answers must not remain `grounded` when their relevant file/scope freshness is degraded or not current
  - reviewer focus: stale facts must disappear before any current-looking success story survives

### Slice 4: Surface freshness truth on Rust-backed operator paths without creating a TS truth source

- **Files:**
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Goal:** keep touched operator-facing surfaces honest about freshness and degradation while preserving separation from answer-state and capability-state.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - `dh-engine index/status` should expose Rust-authored run freshness truth directly
  - query/bridge payloads may add bounded freshness summary metadata or explicit freshness-driven gaps; either path must stay Rust-authored
  - `run-knowledge-command` and presenters may summarize freshness truth, but must not infer “fresh/current” from retrieval success or prior success
  - preserve separation between:
    - `answerState`
    - `languageCapabilitySummary`
    - any additive freshness summary
  - if preserve-only surfaces like `apps/cli/src/commands/index.ts` are touched, they must clarify that chunk refresh counts are not Rust parser freshness truth
  - reviewer focus: no second TS-owned freshness contract, and no reuse of existing TS chunk-index counts as parser freshness proof

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Why sequential:
  - Slice 1 defines the persisted freshness contract that every later slice relies on.
  - Slice 2 cannot plan invalidation honestly until Slice 1 defines what “current”, “degraded”, and “not current” mean in storage/reporting terms.
  - Slice 3 depends on the planner outcomes from Slice 2.
  - Slice 4 must consume the final Rust freshness truth, not intermediate guesses.

## Parallelization Assessment

- parallel_mode: `none`
- why: the feature depends on one shared Rust freshness contract, one shared invalidation planner, one shared stale-fact cleanup strategy, and one shared query/report truth path. Partial overlap would create a high risk of contradictory freshness claims.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: prove one coherent story across Rust storage truth, invalidation behavior, query answer-state, bridge metadata, and TS presentation for unchanged, changed, deleted/renamed, degraded, fatal, dependent-invalidated, and config-widened runs.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Target | Validation path |
| --- | --- |
| unchanged and unaffected files remain truthfully current without forced refresh | from `rust-engine/`: `cargo test --workspace`; incremental fixture must show second run retains current state without reindexing the file |
| confirmed content-only change refreshes the changed file and does not over-invalidate dependents | from `rust-engine/`: `cargo test --workspace`; integration fixture must show file-only refresh with unaffected dependent freshness preserved |
| `structure_hash` change rewrites file-owned facts/edges without automatically claiming downstream invalidation | from `rust-engine/`: `cargo test --workspace`; fixture must separate structural-local rewrite from public-API expansion |
| `public_api_hash` change invalidates dependents and stale downstream facts do not remain current | from `rust-engine/`: `cargo test --workspace`; query/bridge tests must show downstream answers degrade or refresh rather than use old facts |
| delete and rename-away clear old-path facts and tombstone old path truthfully | from `rust-engine/`: `cargo test --workspace`; integration fixture must assert old-path facts are gone and deleted/tombstoned state is visible |
| resolution-basis change widens invalidation beyond file-only reporting | from `rust-engine/`: `cargo test --workspace`; manual smoke via `cargo run -q -p dh-engine -- index --workspace <fixture-path>` may be used to inspect run output if test fixtures need a CLI proof path |
| recoverable parse/adapter issues retain only safe current-run partial facts and surface degradation | from `rust-engine/`: `cargo test --workspace`; query/bridge tests must show partial answer-state and explicit gaps/limitations |
| fatal read/parse/persist failures leave affected scope not current and do not retain stale facts | from `rust-engine/`: `cargo test --workspace`; extend existing hash-read failure coverage and add fatal write/refresh scope coverage |
| TS presentation stays aligned with Rust freshness truth and keeps answer-state separate | from repo root: `npm run check && npm test`; from `rust-engine/`: `cargo test --workspace` when bridge payloads change |

Validation reality notes:

- Use real commands only: `cargo test --workspace`, `npm run check`, `npm test`.
- No repo-native lint command exists.
- If a touched operator surface cannot support a stronger freshness distinction after implementation, narrow the surface claim rather than documenting a fake pass.

## Integration Checkpoint

Before `solution_to_fullstack` is treated as execution-ready, implementation should be able to satisfy all of the following in one combined review pass:

- a second unchanged incremental run can distinguish retained current from refreshed current
- a local implementation edit refreshes the changed file without falsely widening to unaffected dependents
- a structural-but-not-public change rewrites file-owned facts/edges and does not overclaim broader invalidation
- a `public_api_hash` change invalidates dependents and prevents old downstream parser-backed truth from looking current
- delete and rename-away paths clear old-path facts and leave the old path non-current/tombstoned
- a resolution-basis config change is reported as a widened invalidation scope rather than a file-local refresh story
- recoverable parse/adapter issues keep only current-run partial facts and are surfaced as degraded
- fatal read/parse/persist issues leave the affected file/scope not current and stale facts absent
- query answers, bridge payloads, and TS presentation keep answer-state, language capability state, and freshness state separate
- preserve-only TS chunk-index surfaces do not get marketed as the Rust parser freshness source

## Rollback Notes

- If `index_paths` cannot reuse the same planner truthfully, keep the explicit not-implemented failure instead of shipping a narrower semantics bypass.
- If relation-surgical cleanup for invalidated dependents becomes too risky, widen to file-level cleanup and `not_current`; correctness is preferable to stale downstream truth.
- If resolution-basis trigger detection is incomplete, widen invalidation conservatively for the explicit known trigger set rather than claiming file-local safety.
- If bridge/query freshness summaries become noisy, keep the answer degraded/insufficient with explicit gaps instead of claiming refreshed/current.
- If any TS consumer drifts from Rust truth, remove or narrow the TS wording first; Rust freshness truth wins.

## Reviewer Focus Points

- Preserve the architecture split:
  - Rust = freshness truth, invalidation, stale-fact cleanup, degraded/not-current authority
  - TypeScript = presentation only
- Reject any implementation where `expand_dependents` or path-scoped execution narrows below the required invalidation minimum.
- Reject any implementation that treats `ParseStatus`, prior success, retrieval hits, or TS chunk-refresh counts as proof that parser-backed facts are current.
- Verify `public_api_hash` changes invalidate dependents and that `structure_hash` changes do not accidentally market a stronger dependent story than the implementation proved.
- Verify deleted, renamed-away, invalidated, degraded, and fatally failed files do not leave stale facts looking current.
- Verify grounded query answers are impossible when the relevant Rust freshness truth says degraded or not current.
- Verify operator wording distinguishes retained current, refreshed current, degraded partial current, and not current wherever the touched surface claims to speak about freshness.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - one Rust-authored freshness truth source
  - file-level cleanup as the safe fallback when targeted downstream cleanup is not trustworthy
  - no watch-mode, daemon/service, or broad performance scope creep
  - path-scoped reindex semantics that are no weaker than workspace reindex semantics
- **Code Reviewer must preserve:**
  - no second TS-owned freshness contract
  - no narrower-than-truth invalidation behavior
  - no grounded answer path from degraded/not-current data
  - no operator wording that hides stale-fact cleanup failures behind generic success language
- **QA Agent must preserve:**
  - positive coverage for unchanged, content-only, structure-only, public-api, delete/rename, and config-widened runs
  - degraded coverage for recoverable parser/adapter issues
  - fatal coverage for read/parse/persist failures
  - explicit verification that stale facts do not remain current after invalidation or failure
