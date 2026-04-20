---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: OPERATOR-CAPABILITY-INTROSPECTION
feature_slug: operator-capability-introspection
source_scope_package: docs/scope/2026-04-19-operator-capability-introspection.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Operator Capability Introspection

## Chosen Approach

- Use **additive introspection on existing operator-visible surfaces** instead of introducing a new dashboard, a new query class, or a new TS-owned support matrix.
- Keep each truth family on its existing Rust-owned source:
  - **capability state** -> Rust `languageCapabilityMatrix` and per-result `languageCapabilitySummary`
  - **answer/result state** -> Rust `answerState` plus evidence packet for the specific invocation
  - **freshness state** -> Rust `FreshnessState` and Rust index/status reporting only
  - **benchmark state** -> Rust `BenchmarkSuiteArtifact` / benchmark summary output only
- Keep TypeScript strictly presentation and routing only:
  - TS may format, order, or summarize Rust-authored truth
  - TS must not derive a stronger capability/freshness/benchmark story from local grammars, symbol extractors, chunk refresh counts, prior success, or benchmark familiarity
- Prefer **bounded per-surface summaries plus explicit routing** over one universal status surface. If a high-level surface cannot truthfully carry the full detail, it must say so and point to the deeper Rust-authored surface.

Why this is enough:

- The repository already has the core Rust truth contracts needed for this feature:
  - `AnswerState` and query evidence envelopes
  - `LanguageCapabilityState` / `LanguageCapabilitySummary`
  - `FreshnessState` and indexer freshness counters
  - `BenchmarkClass`, `BenchmarkResultStatus`, and benchmark artifacts
- The real gap is **operator inspectability and wording alignment**, not missing capability families.
- A bounded routing-and-presentation hardening closes that gap without creating a second TypeScript truth source, widening into a dashboard product, or expanding query/benchmark scope.

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-19-operator-capability-introspection.md`
- Prior approved solution packages whose contracts must be preserved:
  - `docs/solution/2026-04-18-multi-language-support.md`
  - `docs/solution/2026-04-19-incremental-indexing-completion.md`
  - `docs/solution/2026-04-19-performance-benchmark-hardening.md`
- Existing user-facing contract to preserve and tighten:
  - `docs/user-guide.md`
- Real validation commands available now:
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- Real manual smoke paths already grounded in repo reality:
  - from `rust-engine/`: `cargo run -q -p dh-engine -- status --workspace <repo>`
  - from `rust-engine/`: `cargo run -q -p dh-engine -- benchmark --class parity-benchmark --workspace <fixture-or-repo>`
- No new external package dependency or environment variable is required for the recommended path.
- If implementation adds a small TS helper to invoke Rust status output, reuse the existing local process-launch pattern already used by `dh-jsonrpc-stdio-client.ts`; do not introduce a new service or install flow.

## Impacted Surfaces

### Rust truth surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-storage/src/lib.rs` _(only if status aggregation needs a small repository helper)_
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-engine/src/main.rs`
- `rust-engine/crates/dh-engine/src/benchmark.rs`
- `rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs`

### TypeScript presentation and routing surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `packages/runtime/src/diagnostics/doctor.ts`
- `packages/runtime/src/diagnostics/doctor.test.ts`
- `packages/runtime/src/diagnostics/rust-engine-status.ts` _(new, recommended helper if bounded machine-readable Rust status invocation is needed)_
- `apps/cli/src/commands/index.ts`
- `apps/cli/src/commands/root.ts`

### User-facing docs and wording surfaces

- `docs/user-guide.md`

### Preserve-only non-truth surfaces

- `packages/runtime/src/jobs/index-job-runner.ts`
- `packages/runtime/src/jobs/index-job-runner.test.ts`
- `packages/intelligence/src/symbols/extract-symbols.ts`

Preserve-only note:

- `runIndexWorkflow` refreshed/unchanged counts remain **retrieval/chunk-pipeline diagnostics**, not parser freshness truth.
- `extract-symbols.ts` may keep internal extraction-coverage statuses for implementation diagnostics, but those statuses must stop driving outward product capability truth on operator-facing surfaces.

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Capability-state truth | `languageCapabilityMatrix`, `LanguageCapabilityEntry`, `LanguageCapabilitySummary`, query-capability classification | section ordering, terse summary text, operator routing | a TS-authored `supported/limited/fallback-only` product matrix |
| Answer/result-state truth | `answerState`, evidence packet, invocation-specific conclusion | rendering answer/evidence/limitations sections | proof of universal language/query support |
| Freshness-state truth | `FreshnessState`, freshness reason, Rust index/status counts or summary | display of Rust freshness sections or routing to deeper Rust status | derivation from TS chunk refresh counts, retrieval success, or prior success |
| Benchmark-state truth | `BenchmarkSuiteArtifact`, benchmark class/corpus/preparation/status/memory reporting | optional routing/help/docs only | benchmark wording reused as answer-state, capability-state, or freshness-state proof |
| Doctor/home surface condition | install/workspace/product-health condition (`healthy`, `degraded`, `unsupported`, `misconfigured`) and why it applies | presentation of that surface condition | capability state, answer state, freshness state, or benchmark state |
| Retrieval/chunk pipeline diagnostics | none for product truth | refreshed/unchanged chunk counters, embedding counts, retrieval readiness | parser freshness or parser-backed capability proof |

### Architecture boundary to preserve

- **Rust remains the only truth source** for:
  - language/query capability support
  - parser-backed answer/evidence truth where applicable
  - parser freshness/currentness truth
  - benchmark class/corpus/preparation/completeness truth
- **TypeScript remains presentation-only** for:
  - operator-visible section labels and wording
  - bounded summary formatting
  - routing operators from summary surfaces to deeper Rust-backed surfaces

### Product boundary to preserve

- No new languages, no new query classes, and no capability expansion in this feature.
- No new benchmark classes or benchmark-system overhaul in this feature.
- No release/install workflow overhaul.
- No universal support dashboard.
- No TS-owned truth cache, heuristic support matrix, or second freshness/benchmark model.

## Interfaces And Data Contracts

### 1. Capability-state contract

- The canonical outward capability vocabulary remains:
  - `supported`
  - `partial`
  - `best-effort`
  - `unsupported`
- Existing Rust capability truth already lives in:
  - `languageCapabilityMatrix` from `dh.initialize`
  - per-result `languageCapabilitySummary`
- High-level surfaces such as `dh doctor` or `dh --help` may show only a bounded subset or routing summary, but that summary must still come from Rust truth.
- TypeScript may group or sort capability entries for readability, but it must not translate them into a stronger or alternate product contract such as `limited` or `fallback-only`.

### 2. Answer/result-state contract

- The canonical outward answer-state vocabulary remains:
  - `grounded`
  - `partial`
  - `insufficient`
  - `unsupported`
- `dh ask` and `dh explain` must keep answer-state and capability-state in separate sections with separate meanings.
- `dh trace` remains explicitly `unsupported` in the current bounded contract:
  - unsupported answer-state
  - unsupported capability-state for `trace_flow`
  - no hidden parser-backed fallback story
- Retrieval-only or mixed-evidence results may still be useful, but they must keep `retrievalOnly` visible and must not upgrade capability truth.

### 3. Freshness-state contract

- The canonical outward freshness vocabulary remains Rust `FreshnessState`:
  - `retained current`
  - `refreshed current`
  - `degraded partial`
  - `not current`
- Freshness is not answer-state, not capability-state, and not benchmark-state.
- Recommended additive Rust-authored operator summary for status/index surfaces:

```text
ParserFreshnessSummary {
  scope: workspace | touched_set
  condition: retained_current | refreshed_current | degraded_partial | not_current
  reason: string
  refreshed_current_files: number
  retained_current_files: number
  degraded_partial_files: number
  not_current_files: number
}
```

- Recommended implementation path:
  - extend existing Rust `dh-engine status` output with a machine-readable form or an additive structured subsection for parser freshness
  - let TS consume that Rust-authored summary directly if it needs to display freshness on `dh doctor` or `dh index`
- Contract rule:
  - TS chunk refresh counts may remain visible as retrieval diagnostics
  - those counts must never be presented as parser freshness truth
- If a touched high-level surface cannot surface parser freshness honestly, it must say parser freshness is not reported on that surface and route to the deeper Rust-backed status/report instead of guessing.

### 4. Benchmark-state contract

- Benchmark truth remains the Rust benchmark artifact and summary path from the prior hardening feature.
- The canonical outward benchmark vocabulary remains:
  - benchmark class identity
  - corpus identity
  - preparation identity
  - status: `complete | degraded | failed`
  - memory status: `measured | not_measured | measurement_failed`
- Benchmark surfaces must remain local, corpus-bound, and environment-bound.
- Query surfaces (`dh ask`, `dh explain`, `dh trace`) must not reuse benchmark wording as proof of capability or answer quality.

### 5. Operator surface routing matrix

| Surface | Capability state | Answer state | Freshness state | Benchmark state | Routing rule |
| --- | --- | --- | --- | --- | --- |
| `dh --help` / CLI home | bounded summary only; mention supported ask/explain scope and explicit trace unsupported | none | none | none | route to `dh doctor`, `dh index`, query commands, and docs; do not impersonate a support dashboard |
| `dh doctor` | bounded Rust-backed capability summary only | none | bounded Rust-backed freshness summary or explicit “not reported here” note | none | keep doctor `condition` separate from capability/freshness sections |
| `dh ask` | secondary section via `languageCapabilitySummary` | primary section via `answerState` and evidence | only when Rust-backed freshness materially limits parser-backed trust; otherwise omit | none | no benchmark copy on query surfaces |
| `dh explain` | secondary section via `languageCapabilitySummary` | primary section via `answerState` and evidence | only when Rust-backed freshness materially limits parser-backed trust; otherwise omit | none | same split as `dh ask` |
| `dh trace` | explicit unsupported for `trace_flow` | explicit unsupported | none | none | no hidden fallback parser-backed story |
| `dh index` follow-up output | none, or route-only language | none | Rust-backed parser freshness section if available; otherwise explicit route to deeper Rust status/report | none | keep TS refreshed/unchanged counts in a separate retrieval subsection |
| Rust benchmark/parity output | none | none | benchmark-local counters may appear only as benchmark metrics, not as general workspace freshness | primary benchmark section | local/corpus/environment evidence only |
| `docs/user-guide.md` | explain vocabulary and routing only | explain query result states | explain where freshness comes from and that chunk refresh counts are not parser freshness proof | explain benchmark evidence routing | docs must not create independent statuses |

## Risks And Trade-offs

- **Doctor capability truth drift**
  - Current doctor output derives language support boundaries from TS extraction coverage (`supported | limited | fallback-only`).
  - Mitigation: doctor must consume Rust capability truth or narrow to routing-only wording. It must not keep the TS matrix as the product story.

- **Freshness source ambiguity**
  - The repo already has TS `filesRefreshed/filesUnchanged` counters and Rust parser freshness states.
  - Mitigation: keep the TS counters visible only as retrieval/chunk-pipeline diagnostics; parser freshness must come from Rust or remain explicitly unreported on that surface.

- **Bridge/startup coupling risk**
  - Pulling Rust-backed capability truth into doctor/help may increase dependence on local Rust startup behavior.
  - Mitigation: when Rust introspection is unavailable, degrade honestly and route deeper; do not silently fall back to a TS heuristic truth source.

- **State-family collapse risk**
  - High-level surfaces may try to compress capability, answer, freshness, and benchmark into one generic support statement.
  - Mitigation: keep separate sections and labels; benchmark wording never appears on query surfaces, and doctor surface condition never doubles as capability state.

- **Benchmark bleed-over risk**
  - Benchmark familiarity can tempt docs or presenters to treat benchmark success as product support proof.
  - Mitigation: benchmark output stays benchmark-only, local, corpus-bound, and environment-bound.

- **Scope creep risk**
  - A new dashboard, new query class, or release/install changes would widen this feature sharply.
  - Mitigation: stay on existing touched surfaces and additive summaries only.

## Recommended Path

- **Step 1: freeze one outward routing contract before changing wording.**
  - Fullstack should not patch doctor/help/index/query text piecemeal before the four state families and their allowed surfaces are explicit.
- **Step 2: remove TS-owned capability truth from operator-facing summaries.**
  - `dh doctor` and CLI help/home should consume Rust capability truth or stay explicitly bounded/routing-only.
- **Step 3: expose parser freshness through a Rust-authored status/report summary.**
  - `dh index` may keep retrieval diagnostics, but parser freshness must be sourced from Rust or not claimed.
- **Step 4: preserve the existing query result split.**
  - `answerState` remains invocation truth; `languageCapabilitySummary` remains capability truth; `dh trace` remains unsupported.
- **Step 5: keep benchmark truth on benchmark surfaces only and align docs/help copy.**
  - No ask/explain/trace benchmark proof and no benchmark-backed support promises.

This is the simplest adequate path because it reuses existing Rust truth surfaces, fixes the known TS summary drift, and avoids inventing a new cross-cutting dashboard feature.

## Implementation Flow

1. **Freeze the operator-facing routing matrix and vocabulary** so implementation has one source of surface truth.
2. **Replace or narrow TS high-level capability summaries** (`dh doctor`, CLI home/help) so they stop acting as product truth.
3. **Preserve query result separation** on `dh ask`, `dh explain`, and `dh trace` using the existing Rust bridge envelope.
4. **Add a Rust-backed parser freshness summary path** for status/index surfaces and keep TS refresh counters clearly retrieval-only.
5. **Reconfirm benchmark isolation** so benchmark output stays local evidence and does not bleed into support/trust messaging elsewhere.
6. **Align `docs/user-guide.md` and touched help text** to the final runtime wording and routing.

## Implementation Slices

### Slice 1: Freeze surface routing and remove TS-owned capability truth

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `apps/cli/src/commands/root.ts`
  - `packages/intelligence/src/symbols/extract-symbols.ts` _(preserve/internal-only clarification only if needed)_
  - `docs/user-guide.md`
- **Goal:** make high-level operator-facing surfaces consume Rust capability truth or stay explicitly bounded/routing-only, instead of presenting TS extraction coverage as product truth.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - keep doctor `condition` as product/install/workspace health only
  - capability-state vocabulary on outward surfaces must be `supported | partial | best-effort | unsupported`
  - if doctor cannot fetch Rust-backed capability truth reliably, it must say capability summary is unavailable on this surface and route deeper; it must not fall back to `supported | limited | fallback-only`
  - reviewer focus: no second TS-owned capability matrix survives this slice

### Slice 2: Keep query answer-state and capability-state visibly separate

- **Files:**
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Goal:** preserve `answerState` as invocation truth and `languageCapabilitySummary` as capability truth on `dh ask`, `dh explain`, and `dh trace`.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - keep answer section primary and capability section secondary
  - keep `retrievalOnly` visible when relevant
  - keep `dh trace` explicitly unsupported in both answer-state and capability-state terms
  - do not add benchmark copy to query surfaces
  - if later implementation needs to mention freshness on query surfaces, it must be a third distinct section and only when Rust freshness materially limits trust
  - reviewer focus: no surface may let a grounded-looking answer imply broader capability support

### Slice 3: Add Rust-backed parser freshness summary to status/index routing

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs` _(only if a small aggregation helper is the cleanest path)_
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `packages/runtime/src/diagnostics/rust-engine-status.ts` _(new, recommended helper)_
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `apps/cli/src/commands/index.ts`
- **Goal:** expose parser freshness as Rust-authored `retained current | refreshed current | degraded partial | not current` on touched operator-visible status surfaces without reusing TS retrieval counters as proof.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - recommended bounded path: extend existing `dh-engine status` output with a machine-readable parser-freshness summary rather than scraping human text or reading Rust DB tables directly in TS
  - `dh index` may still print retrieval refresh counts, but those counts must sit in a distinct retrieval subsection and not masquerade as parser freshness
  - `dh doctor` may show a bounded parser freshness section only when it is directly sourced from Rust; otherwise it must say parser freshness is not reported here
  - reviewer focus: no prior success, retrieval success, or TS chunk/index counts may be interpreted as Rust freshness truth

### Slice 4: Keep benchmark truth benchmark-only and align docs/help wording

- **Files:**
  - `rust-engine/crates/dh-engine/src/benchmark.rs`
  - `rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs`
  - `apps/cli/src/commands/root.ts`
  - `docs/user-guide.md`
- **Goal:** preserve benchmark introspection as benchmark truth only, with local/corpus/environment-bounded wording and explicit memory/completeness status.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - benchmark summaries must stay on benchmark/parity surfaces, not query surfaces
  - if help/docs mention benchmarks, they must explain that benchmark evidence is separate from capability, answer-state, and freshness-state
  - keep memory status explicit whenever benchmark evidence is surfaced
  - reviewer focus: no benchmark pass language may be used as general support proof

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Why sequential:
  - Slice 1 freezes the outward vocabulary and routing contract.
  - Slice 2 depends on that vocabulary to preserve answer/capability separation consistently.
  - Slice 3 depends on the same routing rules so freshness can be added without collapsing into answer or capability state.
  - Slice 4 should finalize docs/help/benchmark wording only after the earlier surface contract is stable.
- Critical-path summary:
  - routing first -> query separation second -> freshness third -> benchmark/docs last.

## Parallelization Assessment

- parallel_mode: `none`
- why: this feature changes one shared outward contract across Rust truth sources, TS presentation surfaces, and user-facing docs. Capability wording, answer/result wording, freshness routing, and benchmark routing all overlap in the same operator story. Approving parallel implementation would create a high risk of contradictory surface claims or reintroduce a TS-owned truth layer.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: prove one coherent operator story across `dh doctor`, `dh index`, `dh ask`, `dh explain`, `dh trace`, Rust benchmark/parity output, CLI help/home, and `docs/user-guide.md` without any second TS-owned capability/freshness/benchmark truth source.
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
| doctor/help capability summaries use Rust capability truth or explicit bounded routing only | from repo root: `npm run check && npm test`; from `rust-engine/`: `cargo test --workspace` when bridge capability advertisement or capability sourcing changes |
| ask/explain keep answer-state and capability-state separate | from repo root: `npm run check && npm test`; from `rust-engine/`: `cargo test --workspace` when bridge payloads change |
| `dh trace` remains explicitly unsupported with no hidden parser-backed fallback | from repo root: `npm test` |
| retrieval-only results do not imply parser-backed capability proof | from repo root: `npm test`; existing workflow/presenter tests should assert visible limitations and `retrievalOnly` handling |
| index/status freshness sections use Rust freshness truth and do not reuse TS refresh counts as proof | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm run check && npm test`; manual smoke: `cargo run -q -p dh-engine -- status --workspace <repo>` after an initial run and an unchanged rerun |
| benchmark surfaces remain local/corpus/environment-bound with explicit completeness and memory status | from `rust-engine/`: `cargo test --workspace`; manual smoke: `cargo run -q -p dh-engine -- benchmark --class parity-benchmark --workspace <fixture-or-repo>` if touched text changes need spot-checking |
| user guide and CLI help wording match runtime behavior | from repo root: `npm test` where CLI/help text is covered; manual compare of `docs/user-guide.md` against the final runtime/output wording |

Validation reality notes:

- Use real commands only: `cargo test --workspace`, `npm run check`, `npm test`.
- No repo-native lint command exists; do not invent one.
- If a touched surface cannot support a stronger introspection claim after implementation, narrow the outward wording instead of documenting a false pass.

## Integration Checkpoint

Before this feature is treated as execution-ready, one combined review pass should be able to show all of the following together:

- `dh doctor` shows:
  - its own surface condition (`healthy/degraded/unsupported/misconfigured`) separately from
  - any capability summary and parser freshness summary or routing note
- `dh ask` and `dh explain` show:
  - answer-state for the invocation
  - capability-state for the relevant query/language boundary
  - retrieval-only limitations when applicable
  - no benchmark or generic support story mixed in
- `dh trace` remains explicitly unsupported and does not imply hidden parser-backed trace fallback
- `dh index` follow-up output keeps retrieval/chunk refresh counts separate from parser freshness, and any parser freshness section is Rust-authored
- Rust benchmark/parity output stays local, corpus-bound, and environment-bound with explicit memory/completeness status
- `dh --help` / CLI home and `docs/user-guide.md` use the same bounded state vocabulary and routing story as runtime output

## Rollback Notes

- If `dh doctor` cannot consume Rust capability truth reliably, narrow doctor to routing-only capability wording rather than restoring the TS extraction-boundary matrix as product truth.
- If parser freshness cannot be surfaced safely on `dh index`, keep `dh index` retrieval-only and route to the deeper Rust-backed status/report surface; do not reinterpret refreshed/unchanged chunk counts.
- If query surfaces become noisy when freshness is added, remove or narrow the freshness section there first; preserving answer-state vs capability-state separation is more important.
- If benchmark/help/docs wording becomes ambiguous, narrow the high-level wording and keep the benchmark truth on Rust benchmark/parity surfaces only.
- If any touched TS surface drifts from Rust truth, Rust wins; remove or narrow the TS presentation rather than maintaining parallel truth models.

## Reviewer Focus Points

- Reject any implementation that leaves a TS-authored capability/freshness/benchmark matrix on operator-facing surfaces.
- Verify doctor `condition` remains a surface-health classification, not a capability-state substitute.
- Verify `answerState` and `languageCapabilitySummary` remain visibly separate on query surfaces.
- Verify `dh trace` stays explicitly unsupported and is not softened into vague partial support wording.
- Verify retrieval/chunk refresh counts are not marketed as parser freshness proof.
- Verify benchmark output remains benchmark-only, local/corpus/environment-bounded, and memory-explicit.
- Verify help/docs/runtime output use the same bounded vocabulary and route operators to the right surface when detail is not available inline.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - Rust as the only truth source for capability, freshness, and benchmark state
  - TS as presentation/routing only
  - no new query classes, no new capability families, and no dashboard-style support matrix
  - explicit separation among capability, answer, freshness, and benchmark state
- **Code Reviewer must preserve:**
  - no second TS-owned truth source
  - no use of `supported | limited | fallback-only` as outward product capability truth
  - no use of retrieval success or chunk counters as parser freshness proof
  - no benchmark wording on ask/explain/trace surfaces
- **QA Agent must preserve:**
  - scenario coverage for `dh doctor`, `dh index`, `dh ask`, `dh explain`, `dh trace`, benchmark/parity output, and `docs/user-guide.md`
  - verification that unsupported/degraded conditions remain visible
  - verification that docs/help/runtime wording tell the same bounded story
