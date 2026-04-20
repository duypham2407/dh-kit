---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: PERFORMANCE-BENCHMARK-HARDENING
feature_slug: performance-benchmark-hardening
source_scope_package: docs/scope/2026-04-19-performance-benchmark-hardening.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Performance Benchmark Hardening

## Chosen Approach

- Add one **Rust-authored benchmark contract** that becomes the canonical source for all in-scope benchmark truth:
  - benchmark class identity
  - corpus identity and labeling
  - cold/warm/incremental preparation semantics
  - timing, latency-distribution, and memory-measurement truth
  - degraded and failed benchmark reporting
- Keep the architecture boundary explicit and narrow:
  - **Rust owns** benchmark instrumentation, benchmark corpus execution truth, cold/warm/query timing truth, memory-measurement truth, comparison eligibility, and benchmark artifact generation.
  - **TypeScript owns** only optional bounded presentation of Rust-authored benchmark artifacts if a TS-facing reporting surface is added later. TypeScript must not compute timings, infer corpus class, infer comparison eligibility, or upgrade wording.
- Introduce a **single benchmark artifact family** in Rust that can represent all in-scope classes while keeping correctness and performance as separate sections. The recommended product surface is a new `dh-engine benchmark ...` command, while the existing `dh-engine parity ...` path remains as a compatibility wrapper or correctness-only convenience path.
- Rework the current parity harness so it stops mixing correctness and performance into one undifferentiated success story. Parity remains an in-scope benchmark class, but it must stay separately labeled from cold/warm/incremental/query timing evidence.
- Keep the feature bounded to **inspectable local benchmark evidence**. Do not widen into:
  - broad optimization work
  - daemon/watch/background warm-state rollout
  - end-to-end answer-latency claims
  - SLA or hardware-independent promises

Why this is enough:

- The repository already has the core Rust foundations needed for this feature:
  - a parity harness in `rust-engine/crates/dh-indexer/src/parity.rs`
  - indexer run reporting in `rust-engine/crates/dh-indexer/src/lib.rs`
  - a CLI surface in `rust-engine/crates/dh-engine/src/main.rs`
  - bounded Rust query surfaces in `rust-engine/crates/dh-query/src/lib.rs`
- The real gap is **benchmark truth drift**, not missing benchmark primitives:
  - parity metrics currently mix with timing metrics
  - corpus labeling is not yet canonical
  - warm/cold semantics are not yet hardened per class
  - query latency and RSS expectations are not yet encoded as one contract
- A Rust-first benchmark schema plus narrow CLI/report hardening closes that gap without inventing service infrastructure or broad telemetry storage.

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-19-performance-benchmark-hardening.md`
- Existing benchmark/parity references to preserve but not overclaim from:
  - `docs/solution/2026-04-14-rust-ts-parity-harness-benchmark.md`
  - `docs/migration/deep-dive-01-indexer-parser.md`
  - `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md`
  - `docs/architecture/openkit-reuse-indexing-benchmark-2026-04-11.md`
  - `docs/migration/PROGRESS.md`
- Real validation commands available now:
  - from `rust-engine/`: `cargo test --workspace`
  - from repo root: `npm run check`
  - from repo root: `npm test`
- Current critical path is Rust-first. No TypeScript benchmark execution path is required by the recommended solution.
- No repo-native lint command exists; do not invent one.

## Impacted Surfaces

### Rust benchmark contract and CLI surfaces

- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-engine/src/main.rs`
- `rust-engine/crates/dh-engine/src/benchmark.rs` _(new)_

### Rust index and parity execution-truth surfaces

- `rust-engine/crates/dh-indexer/src/parity.rs`
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-indexer/tests/parity_harness_test.rs`
- `rust-engine/crates/dh-indexer/tests/integration_test.rs`

### Rust query-latency execution surfaces

- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs` _(new, or equivalent Rust test coverage in existing crate test layout)_

### Optional compatibility and documentation surfaces

- `docs/architecture/openkit-reuse-indexing-benchmark-2026-04-11.md`
- `docs/migration/PROGRESS.md`

### Explicit non-target surfaces for this feature

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.ts`

Non-target rule:

- Do **not** route benchmark truth through existing ask/explain/trace bridge surfaces in this feature.
- If a TypeScript benchmark viewer or renderer is added later, it must consume Rust-authored benchmark JSON only and remain presentation-only.

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Benchmark execution truth | instrumentation, corpus preparation enforcement, timing capture, query-series execution, RSS truth, degraded/failed status | none on critical path; optional later rendering only | a TS-generated second benchmark result source |
| Benchmark class semantics | exact meaning of `cold_full_index`, `warm_no_change_index`, `incremental_reindex`, `cold_query`, `warm_query`, `parity_benchmark` | wording only if later rendered | a mixed or implied class model where warm index = warm query |
| Corpus identity | corpus kind, label, revision/snapshot, mutation-set identity, query-set identity, baseline linkage | display only | unlabeled “real-world” proof or silent corpus substitution |
| Performance vs correctness separation | separate result sections and comparison eligibility | separate presentation only | one top-line “benchmark passed” statement that hides what was actually measured |
| Operator wording | canonical Rust summary fields and comparison eligibility truth | bounded formatting only | marketing-style or guarantee-style language |

### Architecture boundary to preserve

- **Rust owns structural and measurement truth.**
- **TypeScript does not own benchmark execution or metric interpretation.**
- Benchmark truth should stay in Rust CLI/report surfaces, not in knowledge-command or LLM-facing surfaces.

### Product boundary to preserve

- No new performance promises beyond local evidence.
- No broad optimization program.
- No watch mode, daemon mode, or persistent background warm-state rollout.
- No end-to-end answer-latency claim unless that exact path is separately benchmarked in another feature.

## Interfaces And Data Contracts

## 1. Benchmark command and artifact contract

Recommended CLI shape:

- `dh-engine benchmark --class <benchmark_class> --workspace <path> [benchmark-specific flags] [--output <path>]`

Recommended compatibility rule:

- `dh-engine parity --workspace <path> [--output <path>]` may remain available, but it should delegate to the new canonical benchmark artifact model for `parity_benchmark` instead of preserving the old mixed report semantics.

Recommended storage shape:

- structured JSON artifact written by Rust to a caller-supplied output path or emitted to stdout
- optional concise Rust text summary generated from the same JSON artifact
- no database persistence or telemetry service is required for this feature

## 2. Benchmark class contract

Canonical in-scope classes for this feature:

| Benchmark class | Required meaning | Required preparation truth |
| --- | --- | --- |
| `cold_full_index` | full index on a declared corpus after reusable prior index/warm state for that corpus is cleared or excluded | artifact must record that cold preparation was applied before measurement |
| `warm_no_change_index` | rerun on the same unchanged corpus with reusable state intentionally preserved from a successful prior run | artifact must record preserved-state reuse and baseline run linkage |
| `incremental_reindex` | rerun after a declared baseline plus an explicit bounded mutation set | artifact must carry baseline run ref plus mutation-set identity |
| `cold_query` | first query-series behavior for a declared Rust query set against a declared prepared index state | artifact must record index source, query-set label, and cold-query preparation |
| `warm_query` | repeated or pre-warmed query-series behavior against the same declared prepared index state | artifact must record warm-query preparation and sample-count rules |
| `parity_benchmark` | correctness/parity outcomes on a declared baseline corpus | artifact must keep correctness separate from any linked performance evidence |

Rules:

- `warm` is class-specific. A warm index run is not equivalent to a warm query run.
- `parity_benchmark` may be emitted in the same suite artifact as timing classes, but it must remain a distinct result entry or a distinct correctness section.
- Query latency here means **bounded Rust query-engine latency** for declared query sets, not CLI startup, bridge startup, LLM latency, or answer formatting latency.

## 3. Corpus labeling contract

Every result must carry a canonical corpus identity block. Recommended contract:

```text
BenchmarkCorpusRef {
  kind: curated_fixture | dh_repo | external_real_repo
  label: string
  revision_or_snapshot: string
  root_path: string
  query_set_label?: string
  mutation_set_label?: string
  notes?: string
}
```

Required meanings:

- `curated_fixture`
  - synthetic or hand-curated fixture corpus
  - never sufficient on its own for broad real-repo claims
- `dh_repo`
  - the DH repository itself at a declared revision/snapshot
- `external_real_repo`
  - a documented external repository snapshot at a declared revision/snapshot

Rules:

- The same artifact must not silently reuse a label for different revisions.
- If the corpus is curated/synthetic, the summary must say so explicitly.
- If the corpus is a real repository, the summary must include the stable rerun identity needed to reproduce it locally.
- `incremental_reindex` requires an explicit `mutation_set_label` plus enough changed-path detail to understand the mutation scope.
- Query benchmarks require a declared `query_set_label`; a benchmark result without a declared query set is degraded, not complete.

## 4. Run metadata contract

Recommended additive run metadata per result:

```text
BenchmarkRunMetadata {
  run_id: string
  benchmark_class: BenchmarkClass
  suite_id: string
  started_at: string
  finished_at: string
  engine_version: string
  build_profile: debug | release | other-explicit-value
  host_os: string
  host_arch: string
  cpu_count: number
  corpus: BenchmarkCorpusRef
  preparation: PreparationState
  baseline_run_ref?: string
  comparison_key?: string
}
```

Preparation rules by class:

- `cold_full_index`
  - preparation must declare that reusable index/warm state was cleared or excluded
- `warm_no_change_index`
  - preparation must declare the preserved baseline run and that corpus content remained unchanged
- `incremental_reindex`
  - preparation must declare baseline run, mutation set, and changed-vs-reused scope
- `cold_query`
  - preparation must declare the index source run and the cold-query reset rules
- `warm_query`
  - preparation must declare warmup or repeat rules against the same index/query setup
- `parity_benchmark`
  - preparation must declare the baseline corpus and baseline expectation source

## 5. Repeatability rules

- Repeatability in this feature means the same benchmark class, corpus identity, preparation state, build profile, and query/mutation set can be rerun and produce the same **evidence shape**.
- It does **not** require numerically identical timings across machines or runs.
- Comparative claims such as `faster`, `slower`, `lower RSS`, or `no regression` are only allowed when the compared runs share a materially equivalent comparison key:
  - benchmark class
  - corpus label + revision/snapshot
  - build profile
  - preparation signature
  - query-set label for query classes
  - mutation-set label for incremental class
- If the comparison key does not match, the artifact may show both runs side by side, but it must mark the comparison as non-equivalent or explicitly disclosed-different.

## 6. Metric contract

### Index-oriented classes

Required fields:

- elapsed wall-clock timing
- changed, reindexed, and reused-or-skipped context as applicable
- explicit memory block with measured or unmeasured status

`incremental_reindex` must additionally include:

- baseline run ref
- mutation set identity
- enough changed-vs-reused context to prove the run was incremental rather than merely smaller

### Query-latency classes

Required fields:

- `sample_count_requested`
- `sample_count_completed`
- `p50_ms`
- `p95_ms`
- declared query-set label
- explicit cold-query or warm-query preparation state
- explicit memory block with measured or unmeasured status

Recommended detail:

- keep per-query-case or per-series sample detail inside the structured artifact when feasible
- keep operator-facing summary bounded to sample count plus p50/p95

### Parity class

Required correctness fields:

- total cases
- passed cases
- failed cases
- parity percentages or equivalent correctness metrics by measured family
- per-case notes for diagnostics or degradation when present

Parity rule:

- correctness output must not be flattened into the same section as timing output.
- The current `ParityReport` mixing parity and cold/incremental timing is a direct hardening target for this feature.

### Memory contract

Every benchmark result must include a memory block:

```text
MemoryMeasurement {
  status: measured | not_measured | measurement_failed
  peak_rss_bytes?: u64
  method?: string
  scope?: string
  reason?: string
}
```

Rules:

- If measured, record `peak_rss_bytes` plus method and scope.
- If not measured, record why.
- If measurement failed mid-run, record `measurement_failed` and keep the timing or correctness result separate from the memory failure.
- No touched benchmark surface may imply memory evidence while omitting this block.

## 7. Degraded and failure contract

Recommended suite or result status values:

- `complete`
- `degraded`
- `failed`

Required behavior:

- `complete`
  - requested class completed with required metadata and required metric shape
- `degraded`
  - some requested metric, corpus, or preparation proof is missing, but truthful partial evidence still exists
- `failed`
  - requested class did not produce a truthful usable result

Degraded-report rules:

- If one corpus in a suite is unavailable, keep completed corpus results and mark suite or result degraded.
- If timing succeeds but RSS is unavailable, record timing plus `memory.status = not_measured` or `measurement_failed`.
- If parity succeeds but performance steps fail, emit correctness-only evidence with explicit performance gap.
- Never silently swap corpus, preparation mode, or benchmark class and present it as the originally requested run.

## 8. Operator wording contract

- Benchmark summaries must be local, corpus-bound, and environment-bound.
- Acceptable summary patterns:
  - `cold_full_index on corpus=dh_repo@<rev> completed locally in ...`
  - `warm_query on query_set=<label> against prepared index from run=<id> measured ...`
  - `parity_benchmark on curated_fixture corpus=<label> produced ...`
- Prohibited summary patterns:
  - `DH guarantees ...`
  - `always ...`
  - `for all repos ...`
  - any hardware-independent or SLA-style claim
- Warm results must never be described as startup or first-run behavior unless the class is actually `cold_*` and measured that way.

## Risks And Trade-offs

- **Compatibility risk with the existing parity command**
  - `dh-engine parity` already exists and today mixes correctness with cold or incremental timing.
  - Mitigation: keep the command as a compatibility wrapper or correctness-only surface, but move canonical truth to the new benchmark artifact model.

- **Query-latency scope creep risk**
  - Query benchmarks can easily drift into end-to-end product latency.
  - Mitigation: keep the query class scoped to Rust query-engine operations on declared query sets only.

- **RSS portability risk**
  - Peak RSS capture can vary by platform or method.
  - Mitigation: standardize the explicit memory block first; measured values are allowed where available, and `not_measured` or `measurement_failed` must remain honest where not available.

- **Corpus drift risk**
  - A label without revision or snapshot identity becomes non-repeatable.
  - Mitigation: require stable revision or snapshot metadata in every result.

- **Performance-marketing drift risk**
  - Once timing numbers exist, docs or summaries may overstate them.
  - Mitigation: make Rust own comparison eligibility and keep summaries corpus-bound and environment-bound.

- **Overengineering risk**
  - A broad telemetry or historical benchmark database would widen scope sharply.
  - Mitigation: keep artifact storage file-based and inspectable for this feature; no fleet telemetry or service rollout.

## Recommended Path

- **Step 1: freeze one Rust benchmark schema before adding new benchmark classes.**
  - The schema must define class identity, corpus identity, preparation state, run metadata, correctness/performance separation, and degraded/failure semantics.
- **Step 2: harden the existing parity and index benchmark surfaces against that schema.**
  - Remove mixed parity-plus-timing ambiguity first.
- **Step 3: add bounded query-latency classes using the same schema.**
  - Query latency must ship with sample count, p50/p95, and explicit cold-query or warm-query semantics.
- **Step 4: finalize conservative CLI and documentation wording.**
  - Keep Rust summaries local-evidence only and retain `parity` compatibility without preserving old ambiguity.

This is the simplest adequate path because it reuses the current Rust engine surfaces, fixes the known truth drift first, and avoids adding a new benchmark service or TS execution layer.

## Implementation Flow

1. Define the shared Rust benchmark report schema and suite or result status model.
2. Rework parity and index benchmark paths to emit the shared schema with correctness/performance separation.
3. Add cold or warm query-series benchmarking on declared query sets with latency-distribution and memory-status reporting.
4. Tighten CLI text or JSON output and compatibility docs so local benchmark evidence stays inspectable and non-marketing.

## Implementation Slices

### Slice 1: Freeze the Rust benchmark schema and benchmark-truth contract

- **Files:**
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/benchmark.rs` _(new)_
  - `rust-engine/crates/dh-engine/src/main.rs`
- **Goal:** define one shared Rust benchmark artifact model for classes, corpus identity, run metadata, metric separation, memory status, and degraded or failed reporting.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - add canonical enums or structs for benchmark class, corpus kind, run metadata, suite or result status, memory block, comparison eligibility, and query/index/parity result shapes
  - keep artifact truth Rust-authored from the beginning
  - define the new canonical benchmark CLI or report entrypoint here, with compatibility strategy for the existing `parity` command
  - reviewer focus: there must be one schema and one truth source, not parallel ad hoc report shapes

### Slice 2: Harden existing parity and index benchmarking into separated benchmark classes

- **Files:**
  - `rust-engine/crates/dh-indexer/src/parity.rs`
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-indexer/tests/parity_harness_test.rs`
  - `rust-engine/crates/dh-indexer/tests/integration_test.rs`
  - `rust-engine/crates/dh-engine/src/main.rs`
- **Goal:** emit `parity_benchmark`, `cold_full_index`, `warm_no_change_index`, and `incremental_reindex` as truthfully labeled results with explicit corpus and preparation metadata.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - remove or relocate cold or incremental timing from the old parity-only summary so parity correctness stands on its own
  - define explicit cold and warm index preparation rules in code and tests
  - require incremental output to carry baseline run ref plus mutation-set identity
  - attach the memory block to each result with measured or explicit unmeasured status
  - reviewer focus: no remaining mixed correctness or performance success story and no unlabeled warm or index reuse

### Slice 3: Add bounded query-latency benchmark classes with repeatability rules

- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/benchmark.rs` _(new)_
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs` _(new, or equivalent Rust test coverage)_
- **Goal:** add `cold_query` and `warm_query` result generation for declared Rust query sets with sample count plus p50 and p95, without claiming end-to-end answer latency.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - keep query sets explicit and bounded to current Rust query-engine classes
  - require query-set labeling and explicit cold-query or warm-query preparation metadata
  - store query latency results separately from parity and separately from index timings, while allowing them to coexist in the same suite artifact
  - make memory status explicit for query classes too
  - reviewer focus: no anecdotal single-number latency, no bridge or LLM latency creep, and no hidden failed samples

### Slice 4: Finalize CLI or operator wording, degraded reporting, and compatibility notes

- **Files:**
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `docs/architecture/openkit-reuse-indexing-benchmark-2026-04-11.md`
  - `docs/migration/PROGRESS.md`
- **Goal:** ensure Rust text output and benchmark docs describe results as local benchmark evidence only and surface degraded or failed status explicitly.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - keep operator text corpus-bound and environment-bound
  - update or narrow legacy example wording that reads like benchmark proof without corpus or preparation detail
  - preserve compatibility for `dh-engine parity` without preserving the old ambiguity
  - reviewer focus: wording must stay inspectable and local, never promotional or universal

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- Why sequential:
  - Slice 1 defines the shared schema and status model.
  - Slice 2 must land before query benchmarking so the artifact already proves correctness/performance separation.
  - Slice 3 depends on the shared schema from Slice 1 and the result-shape conventions hardened in Slice 2.
  - Slice 4 must consume the final Rust artifact and wording contract, not an intermediate one.
- Critical-path summary:
  - schema first -> parity/index separation second -> query latency third -> wording/docs last.

## Parallelization Assessment

- parallel_mode: `none`
- why: the feature depends on one shared benchmark schema, one shared parity-vs-performance separation model, one shared corpus or preparation contract, and one shared Rust CLI/report wording path. Running index/parity and query benchmarking in parallel would risk incompatible artifact shapes and conflicting semantics.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: prove one coherent suite story across curated fixture parity, DH repo index timing, bounded query latency, memory status, degraded suite handling, and operator wording without any TS-owned truth source.
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
| benchmark class labels and preparation semantics are explicit for cold, warm, incremental, query, and parity | from `rust-engine/`: `cargo test --workspace`; Rust tests must assert emitted class identity and preparation metadata per result |
| parity or correctness no longer collapses into timing or performance proof | from `rust-engine/`: `cargo test --workspace`; parity harness tests must assert correctness output stands alone and any linked timing remains separately labeled |
| cold, warm, and incremental index results carry corpus identity, baseline linkage, and mutation-set truth | from `rust-engine/`: `cargo test --workspace`; indexer integration coverage must prove unchanged, warm reuse, and incremental mutation reporting stay distinct |
| query latency results include query-set label, sample count, p50, and p95 | from `rust-engine/`: `cargo test --workspace`; Rust benchmark tests must cover both cold-query and warm-query result shapes |
| memory silence is impossible on touched benchmark surfaces | from `rust-engine/`: `cargo test --workspace`; tests must assert `measured`, `not_measured`, or `measurement_failed` is always present |
| degraded or partial benchmark suites surface what completed, what is limited, and why | from `rust-engine/`: `cargo test --workspace`; suite or result status tests must cover missing corpus, missing RSS, and performance-step failure cases |
| operator wording stays local-evidence only | from `rust-engine/`: `cargo test --workspace`; manual spot-check of Rust CLI text or JSON after implementation should verify corpus-bound wording and absence of SLA or guarantee language |
| no TS benchmark truth source is introduced on the recommended path | no TS critical-path change required; if implementation later adds TS rendering, then also run `npm run check && npm test` and verify TS consumes Rust JSON without reinterpretation |

Validation reality notes:

- Use real commands only: `cargo test --workspace`, `npm run check`, and `npm test`.
- No repo-native lint command exists.
- The benchmark command introduced by this feature is a planned product surface, not an existing pre-change validation dependency.

## Integration Checkpoint

Before implementation is considered ready for `solution_to_fullstack`, one combined review pass must be able to show all of the following with one coherent artifact family:

- curated parity fixtures produce a `parity_benchmark` result with correctness-only truth and explicit corpus labeling
- the DH repository can produce `cold_full_index`, `warm_no_change_index`, and `incremental_reindex` results with explicit preparation semantics, baseline linkage, and mutation-set labeling
- a declared bounded Rust query set can produce `cold_query` or `warm_query` results with sample count plus p50 and p95
- every touched result includes explicit memory status: measured, not measured, or measurement failed
- if one corpus or one metric is unavailable, the suite reports degraded status instead of silently upgrading to full coverage
- CLI text and JSON summaries frame output as local benchmark evidence only
- no ask, explain, or trace TS surface is used as a benchmark truth source

## Rollback Notes

- If a unified `benchmark` command creates too much compatibility churn, keep `dh-engine parity` as a correctness-only surface and add the new benchmark suite alongside it. Do **not** keep the old mixed correctness-plus-timing ambiguity.
- If peak RSS capture proves unreliable on a platform, ship explicit `not_measured` or `measurement_failed` first rather than hiding memory status.
- If query latency cannot yet meet repeatable cold or warm semantics for a declared query set, keep the query class degraded or unsupported rather than emitting anecdotal timing.
- If external real-repo corpus automation is not ready, keep the initial critical path to curated fixtures plus DH repo corpus labeling; do not silently substitute a different corpus class.
- If docs or examples cannot support stronger wording honestly, narrow them first and defer broader documentation polish.

## Reviewer Focus Points

- Reject any implementation that lets TypeScript own benchmark execution, timing interpretation, corpus labeling, or comparison eligibility.
- Reject any implementation that still mixes parity correctness and performance timing into one undifferentiated benchmark pass or fail story.
- Verify that every result identifies benchmark class, corpus label, revision or snapshot, preparation state, and baseline linkage where applicable.
- Verify that `warm_no_change_index` and `warm_query` stay distinct and do not imply daemon, watch, or background runtime behavior.
- Verify that `incremental_reindex` records mutation-set truth rather than vague “one file changed” wording.
- Verify that query latency always includes sample count plus p50 and p95 when the class is reported as benchmark evidence.
- Verify that memory status is never silent.
- Verify that comparative wording is emitted only when class, corpus, preparation, and build context are actually comparable.
- Verify that operator wording remains corpus-bound, environment-bound, and local-evidence only.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - Rust as the only benchmark execution truth source
  - explicit benchmark-class semantics
  - corpus labeling and revision identity
  - correctness/performance separation
  - no optimization or marketing scope creep
- **Code Reviewer must preserve:**
  - no hidden class equivalence between warm index and warm query
  - no silent corpus substitution
  - no memory omission
  - no universal language or SLA-style wording
- **QA Agent must preserve:**
  - positive coverage for curated fixture parity, DH repo cold/warm/incremental index, and bounded query latency
  - degraded coverage for missing corpus, missing RSS, and partial measurement failure
  - verification that summaries remain inspectable local evidence rather than broad performance claims
