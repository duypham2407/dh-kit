---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: PERFORMANCE-BENCHMARK-HARDENING
feature_slug: performance-benchmark-hardening
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-19-performance-benchmark-hardening.md
source_solution_package: docs/solution/2026-04-19-performance-benchmark-hardening.md
---

# QA Report: PERFORMANCE-BENCHMARK-HARDENING

## Verification Scope

- Mode/stage/task context verified: `full` / `full_qa` / `TASK-PERFORMANCE-BENCHMARK-REWORK-1 (qa_in_progress)`.
- Contract basis verified:
  - `docs/scope/2026-04-19-performance-benchmark-hardening.md`
  - `docs/solution/2026-04-19-performance-benchmark-hardening.md`
- Primary rework surfaces verified:
  - `rust-engine/crates/dh-engine/src/benchmark.rs`
  - `rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs`
- Adjacent benchmark/reporting surfaces verified for bounded wording and evidence-shape consistency:
  - `rust-engine/crates/dh-types/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `docs/architecture/openkit-reuse-indexing-benchmark-2026-04-11.md`
  - `docs/migration/PROGRESS.md`
- Explicit QA rework focus:
  - incremental timing separates baseline preparation from measured rerun timing
  - `baseline_run_ref` points to actual baseline run
  - `warm_no_change_index` degrades when mutation is observed
  - bounded benchmark truth remains local/corpus/environment scoped, with explicit memory status (`not_measured` accepted when truthful)

## Observed Result

- **PASS**
- Ready-for-full_done: **Yes**

## Evidence

Fresh validation rerun in this QA pass:

- `semgrep --config p/ci rust-engine/crates/dh-engine/src/benchmark.rs rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs` -> PASS, 0 findings.
- `semgrep --config p/security-audit rust-engine/crates/dh-engine/src/benchmark.rs rust-engine/crates/dh-engine/tests/benchmark_cli_test.rs` -> PASS, 0 findings.
- `cargo test --workspace` (from `rust-engine/`) -> PASS.
- `npm run check` (repo root) -> PASS.
- `npm test` (repo root) -> PASS (73 files passed, 371 tests passed, 4 skipped).

Targeted behavior regressions rerun:

- `cargo test -p dh-engine incremental_reindex_uses_distinct_baseline_reference_and_separate_prep_timing_note` -> PASS.
- `cargo test -p dh-engine warm_no_change_with_mutations_is_degraded` -> PASS.
- `cargo test -p dh-engine benchmark_cli_parity_outputs_structured_artifact` -> PASS.

Manual structural verification (bounded fallback where runtime syntax-outline tool was unavailable):

- `benchmark.rs` explicitly performs two-phase incremental flow: baseline prep run then measured rerun, with measured `elapsed_ms` derived from rerun timer only.
- `incremental_baseline_run_ref` is captured from baseline prep run and threaded to metadata/comparison/preparation baseline fields; invalid same-run linkage is guarded and degrades status.
- `warm_no_change_index` marks result degraded when `changed_files > 0` and sets comparison ineligible with explicit reason.
- Summary/output wording remains bounded local evidence (no SLA/universal language), and memory block remains explicitly `not_measured` with reason where instrumentation is not yet present.

## Behavior Impact

- `CR-PERF-BENCH-001` remains fixed in behavior: incremental measured latency no longer includes baseline preparation timing.
- `CR-PERF-BENCH-002` remains fixed in behavior: `baseline_run_ref` points to baseline run, not measured rerun `run_id`.
- `CR-PERF-BENCH-003` remains fixed in behavior: warm no-change benchmark degrades when mutations are observed.
- Bounded contract honesty preserved:
  - benchmark statements remain local/corpus/environment-scoped
  - no broad optimization/performance marketing claims added
  - memory status is explicit (`not_measured` where truthful) rather than silent

## Issue List

- None.

## Tool Evidence

- rule-scan: unavailable — runtime `tool.rule-scan` not exposed in this environment; substituted with Semgrep `p/ci`: 0 findings on 2 files
- security-scan: unavailable — runtime `tool.security-scan` not exposed in this environment; substituted with Semgrep `p/security-audit`: 0 findings on 2 files
- evidence-capture: 4 records written in this QA pass (`performance-benchmark-hardening-qa-manual-scans-2026-04-20`, `performance-benchmark-hardening-qa-automated-validation-2026-04-20`, `performance-benchmark-hardening-qa-syntax-outline-unavailable-2026-04-20`, `performance-benchmark-hardening-qa-report-artifact-2026-04-20`)
- syntax-outline: unavailable — runtime `tool.syntax-outline` returned invalid-path/missing-file due project-root resolution at `/Users/duypham/Code/DH/{cwd}`; manual structural verification completed on rework files

## Recommended Route

- Route to `MasterOrchestrator` for `qa_to_done` approval and `full_done` closure.
- Reason: bounded acceptance targets are satisfied, all three rework findings remain fixed with fresh evidence, and no closure-blocking QA findings remain.

## Verification Record(s)

- issue_type: `none` (QA pass)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence:
    - Semgrep p/ci + p/security-audit reruns: PASS, 0 findings
    - targeted regression tests for incremental baseline/timing and warm-no-change degradation: PASS
    - full Rust workspace tests + root checks/tests: PASS
    - manual structural verification confirms bounded benchmark truth and rework behavior fixes
  - behavior_impact: PERFORMANCE-BENCHMARK-HARDENING remains closure-safe and bounded-contract honest
  - route: `qa_to_done` approval -> `full_done`
