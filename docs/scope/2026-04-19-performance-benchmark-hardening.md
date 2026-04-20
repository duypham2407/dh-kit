---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: PERFORMANCE-BENCHMARK-HARDENING
feature_slug: performance-benchmark-hardening
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Performance Benchmark Hardening

PERFORMANCE-BENCHMARK-HARDENING defines the bounded benchmark-truth contract for DH performance evidence. The feature standardizes which benchmark classes are in scope, what `cold`, `warm`, and `incremental` mean, which corpus and environment details must travel with a result, which latency and memory metrics are required when a benchmark class claims them, and how benchmark summaries must be worded so they remain local evidence instead of product-wide guarantees. This work hardens measurement truth and repeatability; it does not expand into broad optimization work, watch mode, daemon/service rollout, or performance marketing claims.

## Goal

- Give maintainers and reviewers one canonical benchmark contract for local DH engine evidence.
- Make benchmark results inspectable and comparable by benchmark class, corpus, and preparation state.
- Keep performance evidence truthful, corpus-bound, and environment-bound without turning local measurements into SLAs or universal guarantees.

## Target Users

- Maintainers running local benchmark and parity evidence during Rust/TypeScript migration and follow-on engine hardening.
- Code Reviewer and QA who need a bounded contract for judging whether benchmark evidence is honest and comparable.
- Solution Lead and downstream implementers who need explicit benchmark semantics without rediscovering them across migration notes, progress docs, and ad hoc benchmark outputs.
- Operators or maintainers reading benchmark summaries in docs or command output and who need to understand what was actually measured before trusting the result.

## Problem Statement

- The repository already contains benchmark intent, timing targets, and parity-harness references across migration artifacts, including:
  - `docs/migration/deep-dive-01-indexer-parser.md`
  - `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md`
  - `docs/solution/2026-04-14-rust-ts-parity-harness-benchmark.md`
- Those artifacts establish useful ingredients, but they do not yet form one canonical product contract for benchmark truth.
- Today the same benchmark discussion can blur multiple distinct ideas:
  - curated parity fixtures versus real-repository corpus evidence
  - cold runs versus warm/no-change runs versus incremental runs
  - correctness parity metrics versus performance metrics
  - single observed latency numbers versus repeatable latency distributions
  - measured local evidence versus universal claims about DH performance
- Without a hardened contract, benchmark output can look stronger than it is: warm results can be mistaken for cold behavior, synthetic corpora can be mistaken for real-world proof, latency can be quoted without p50/p95 context, peak RSS can disappear silently, and local runs can be overread as guarantees.
- This feature closes that trust gap. It is about benchmark truth, repeatability, and operator wording discipline, not about broad engine optimization or new runtime modes.

## In Scope

- Define the benchmark classes that DH may present as first-class local benchmark evidence in this feature:
  - cold full-index benchmark
  - warm/no-change index benchmark
  - incremental reindex benchmark
  - query latency benchmark
  - parity/correctness benchmark
- Define explicit `cold`, `warm`, and `incremental` semantics for each in-scope benchmark class.
- Define benchmark corpus requirements and labeling rules, including the distinction between curated/synthetic fixture corpora and documented real-repository corpora.
- Define repeatability requirements for benchmark setup, run metadata, and comparison boundaries.
- Define required metric expectations where the benchmark class claims them, including:
  - elapsed wall-clock timing for index-oriented benchmarks
  - p50/p95 latency for repeated query-latency reporting
  - peak RSS or an explicit `not measured` / equivalent absence state where memory reporting is in scope
- Define the required separation between correctness/parity outputs and performance outputs.
- Define operator-visible wording constraints so benchmark summaries stay local-evidence claims only.
- Define degraded/partial benchmark reporting when a corpus, metric, or measurement step cannot be completed truthfully.

## Out of Scope

- Broad engine optimization or architecture redesign whose main purpose is to improve benchmark numbers.
- Watch-mode rollout, daemon/service mode, background warm-worker rollout, remote execution, or distributed benchmark infrastructure.
- Product-wide performance marketing, SLA language, or any claim that a local benchmark proves universal behavior across machines or repositories.
- Treating one curated or synthetic corpus as sufficient proof of general real-world performance.
- Converting benchmark hardening into a broad release-governance or fleet-wide telemetry program.
- Hiding missing corpus coverage, missing memory measurement, or missing warm/cold preparation detail behind simplified “benchmark passed” wording.
- Reopening broader query/search capability scope beyond the bounded performance and parity evidence surfaces already referenced in migration planning.

## Main Flows

- **Flow 1 — Maintainer runs a cold full-index benchmark**
  - Maintainer prepares a corpus using the declared cold-run rules.
  - DH reports the run as `cold` only when prior reusable index/warm state for that corpus has been cleared or excluded according to the declared preparation rules.
  - Output includes corpus identity, run conditions, elapsed timing, and memory status.

- **Flow 2 — Maintainer runs a warm/no-change benchmark**
  - Maintainer reruns the same unchanged corpus after a successful prior preparation run.
  - DH reports the run as `warm` only when reusable state from the same declared setup is intentionally preserved.
  - Output does not imply startup or daemon-backed behavior beyond the local prepared state.

- **Flow 3 — Maintainer runs an incremental reindex benchmark**
  - Maintainer establishes a declared baseline, applies a bounded change set, and reruns indexing.
  - DH reports the benchmark as incremental only when the mutation set and comparison baseline are explicit.
  - Output distinguishes changed work from skipped/reused scope.

- **Flow 4 — Maintainer runs a query latency benchmark**
  - Maintainer runs a declared query set against a declared prepared index state.
  - DH reports whether the latency series is cold-query, warm-query, or both, and includes sample counts plus p50/p95.
  - Output keeps query-latency evidence separate from broader product-latency or first-answer claims not measured by that benchmark.

- **Flow 5 — Reviewer reads a parity-plus-performance summary**
  - Reviewer sees parity/correctness outcomes and performance outcomes in the same artifact or summary.
  - DH keeps the metric families separated and labels which corpus and run class each number came from.
  - Reviewer can tell whether the result is fixture-bound, real-repo-bound, cold, warm, incremental, or degraded.

- **Flow 6 — A benchmark run is partial or degraded**
  - A corpus is unavailable, a metric cannot be measured, or one measurement phase fails.
  - DH surfaces the missing or degraded part explicitly.
  - The summary does not silently upgrade a partial benchmark into a full benchmark claim.

## Business Rules

### Benchmark-truth boundary

- In this feature, benchmark results are local evidence from a declared run on a declared corpus in a declared environment.
- No in-scope benchmark surface may present its result as a universal guarantee, SLA, or product-wide promise.
- Engineering targets referenced from migration planning remain engineering targets only unless a touched benchmark surface explicitly says they are local observations for a specific corpus and environment.

### Benchmark class definitions

| Benchmark class | Required meaning |
| --- | --- |
| `cold_full_index` | Measures a full index run after the declared cold-preparation step removed or excluded reusable prior index/warm state for that corpus. |
| `warm_no_change_index` | Measures a rerun on the same unchanged corpus after a successful prior run intentionally preserved reusable state relevant to that benchmark. |
| `incremental_reindex` | Measures a rerun after a declared baseline plus a bounded declared mutation set; it is not enough to say “one file changed” without recording the change set or affected scope. |
| `cold_query` | Measures first-query behavior for a declared query set after the declared cold query preparation for that benchmark session. |
| `warm_query` | Measures repeated or pre-warmed query behavior after the declared warm preparation for that same query/index setup. |
| `parity_benchmark` | Measures correctness/parity outcomes against a declared baseline corpus. If performance numbers are included alongside parity outputs, they must stay separately labeled. |

- `warm` in this feature means reusable prepared state within the declared local benchmark setup. It does not imply watch mode, daemon mode, or a persistent background service rollout.
- `cold` and `warm` semantics must be declared per benchmark class. A warm index run is not automatically equivalent to a warm query run.
- A benchmark result may not be compared directly across classes unless the summary explicitly says that the classes differ.

### Corpus and repeatability rules

- Every in-scope benchmark result must identify the corpus it measured.
- Corpus identity must distinguish at least one of the following categories:
  - curated fixture/synthetic corpus
  - DH repository corpus
  - documented external real-repository corpus
- If an external or real-repository corpus is used, the benchmark surface must identify the revision, snapshot, or other stable corpus identity needed to rerun it locally.
- If a curated or synthetic corpus is used, the benchmark surface must say so explicitly and must not present the result as general real-world proof on its own.
- Repeatability in this feature means the same declared benchmark class, corpus definition, and preparation steps can be rerun locally and produce comparable evidence shape. It does not require numerically identical timings across machines or runs.
- Benchmark comparison claims such as `faster`, `slower`, `lower RSS`, or `no regression` are only in-bounds when the compared runs use the same benchmark class, materially comparable corpus, and materially comparable preparation/configuration, or when the differences are explicitly disclosed.

### Required run metadata

- Each in-scope benchmark result must carry enough metadata to explain what was measured, including at minimum:
  - benchmark class
  - corpus identity
  - cold/warm/incremental preparation state
  - relevant build/config toggles that materially affect the result when they are part of the run
  - sample count for latency distributions when applicable
- If the benchmark summary compares against another run, it must identify the baseline run or baseline condition.

### Metric rules

- Index-oriented benchmark classes must report elapsed wall-clock timing.
- Incremental benchmarks must also report the declared mutation scope and enough changed-versus-reused context to show the result was truly incremental.
- Query latency benchmarks must report latency as a declared sample distribution rather than as a single anecdotal timing only.
- Where query latency is in scope, the benchmark output must include at least:
  - sample count
  - p50 latency
  - p95 latency
- Peak RSS is in scope for benchmark classes that claim memory evidence. Those results must either:
  - report peak RSS with the measurement method or scope clearly labeled, or
  - explicitly state that RSS was not measured for that run
- Memory silence is not allowed when a touched benchmark surface implies memory evidence.
- Correctness/parity metrics and performance metrics must remain separate even when produced by the same command or artifact.

### Operator wording rules

- Operator-facing wording must describe benchmark outcomes as local benchmark evidence only.
- Acceptable wording is corpus-bound and environment-bound, for example “on this corpus” or equivalent bounded phrasing.
- Unacceptable wording includes unqualified claims such as “DH guarantees,” “always,” “for all repos,” or equivalent universal language.
- Warm results must not be described as startup, cold, or first-run behavior.
- Query latency results must not be presented as general end-to-end answer latency unless that exact end-to-end path was what the benchmark measured.
- If a benchmark omits a corpus, omits RSS, or only partially completes, the summary must say what still works, what is limited, and why.

### Degraded and failure reporting rules

- If one corpus in a benchmark suite cannot run, the suite may still report completed corpus results, but the missing corpus must be surfaced explicitly.
- If timing is measured but RSS is unavailable, the benchmark may report timing-only evidence only when the missing memory measurement is explicit.
- If parity/correctness measurement succeeds but performance measurement fails, the benchmark may report correctness-only evidence only when the performance gap is explicit.
- A benchmark surface must never silently substitute a different corpus, different preparation mode, or different benchmark class and present it as the originally requested benchmark.

## Acceptance Criteria Matrix

- **AC1** — **Given** a cold full-index benchmark result, **when** a reviewer inspects it, **then** the result explicitly identifies itself as `cold_full_index`, names the corpus, and includes the declared cold-preparation context rather than assuming the reader knows it.
- **AC2** — **Given** a warm/no-change index benchmark result, **when** a reviewer inspects it, **then** the result explicitly identifies itself as warm, preserves the same corpus identity, and does not imply cold/startup semantics.
- **AC3** — **Given** an incremental reindex benchmark result, **when** a reviewer inspects it, **then** the result identifies the baseline condition plus the bounded mutation scope and does not market the run as generally incremental without that context.
- **AC4** — **Given** a query latency benchmark result, **when** it is presented as benchmark evidence, **then** it declares whether it measures cold query behavior, warm query behavior, or both, and includes sample count plus p50/p95 latency.
- **AC5** — **Given** a touched benchmark surface that claims memory evidence is in scope, **when** a reviewer inspects the result, **then** the result either reports peak RSS with clear scope/method labeling or explicitly states that RSS was not measured.
- **AC6** — **Given** a curated or synthetic corpus benchmark result, **when** it is surfaced to operators or maintainers, **then** the result labels that corpus class explicitly and does not treat it as universal real-world proof by itself.
- **AC7** — **Given** a benchmark summary that includes both parity/correctness and performance evidence, **when** a reviewer inspects it, **then** the two metric families remain separately labeled and are not collapsed into one undifferentiated success claim.
- **AC8** — **Given** a benchmark summary uses comparative wording such as `faster`, `slower`, `lower RSS`, or `no regression`, **when** the reviewer inspects the evidence, **then** the baseline run/class/corpus context is explicit enough to understand what is being compared.
- **AC9** — **Given** any operator-facing benchmark wording, **when** Code Reviewer or QA inspects it, **then** the wording frames the result as local evidence and avoids universal-guarantee, SLA, or performance-marketing language.
- **AC10** — **Given** a warm benchmark result, **when** it is described in docs or output, **then** it does not imply watch mode, daemon/service rollout, or a persistent background-warm product mode unless that separate feature is actually in scope and measured.
- **AC11** — **Given** a benchmark suite where one corpus or one metric cannot be completed truthfully, **when** the suite reports results, **then** the missing or degraded part is explicit and the completed parts are not overstated as full-suite coverage.
- **AC12** — **Given** the completed scope package, **when** Solution Lead begins technical design, **then** they can define benchmark classes, corpus rules, cold/warm semantics, metric reporting, and operator wording boundaries without inventing product semantics or widening scope into optimization work.

## Edge Cases

- A curated parity fixture corpus produces excellent numbers but is too small to stand in for a real repository benchmark.
- The same repository is benchmarked at different revisions, making direct comparison invalid unless the revision difference is disclosed.
- A warm benchmark accidentally reuses undeclared state from a previous run beyond what the benchmark class intended.
- A query benchmark measures first-query behavior on a prepared index, while another measures repeated queries; both must stay labeled distinctly.
- A benchmark captures elapsed timing but the chosen environment does not expose RSS with the same method on every platform.
- One corpus in a multi-corpus suite is missing locally, unavailable, or too large for the current machine.
- Debug/release or other materially different build/config settings change the result enough that a naive comparison would mislead.
- A parity harness command emits correctness metrics successfully while a linked performance measurement step times out or fails.

## Error And Failure Cases

- The feature fails if cold and warm benchmark results can be surfaced without explicit preparation semantics.
- The feature fails if incremental benchmark output omits the baseline or change-set context and still claims to prove incremental behavior.
- The feature fails if query latency is reported as benchmark truth without declaring sample count and p50/p95 where that latency class is in scope.
- The feature fails if peak RSS is implied, compared, or discussed without either a reported measurement or an explicit `not measured` state.
- The feature fails if curated/synthetic corpus results are surfaced as if they were universal or real-world representative proof without qualification.
- The feature fails if parity/correctness metrics and performance metrics blur together so reviewers cannot tell what actually passed.
- The feature fails if operator wording turns local benchmark evidence into a product-wide performance guarantee or marketing claim.
- The feature fails if warm benchmark wording implies watch mode, daemon/service mode, or other runtime rollout work that is outside this scope.
- The feature fails if solution work expands into broad optimization or runtime-mode expansion instead of keeping the benchmark contract truthful and bounded.

## Open Questions

- None blocking at Product Lead handoff.
- Solution Lead may choose the concrete benchmark commands, artifact formats, and evidence storage shape, but those choices must preserve the benchmark-truth, corpus, metric, and wording rules in this scope.

## Success Signal

- Maintainers can rerun declared benchmark classes on declared corpora and understand exactly what kind of evidence they produced.
- Reviewers can distinguish cold, warm, incremental, query-latency, and parity evidence without guessing.
- Benchmark summaries become honest enough that local numbers support migration or hardening decisions without being mistaken for universal guarantees.
- Latency and memory evidence, when claimed, are explicit enough that omissions and degraded runs are visible rather than hidden.
- Solution design can proceed without rediscovering corpus rules, metric requirements, or wording constraints from scattered migration artifacts.

## Handoff Notes For Solution Lead

- Preserve the core scope boundary: benchmark results are local evidence only, never universal guarantees.
- Preserve the migration references as calibration inputs, not as outward promises:
  - `docs/solution/2026-04-14-rust-ts-parity-harness-benchmark.md`
  - `docs/migration/deep-dive-01-indexer-parser.md`
  - `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md`
- Treat timing targets from `deep-dive-01-indexer-parser.md` as engineering targets or comparison inputs only. Do not convert them into operator-facing guarantees unless the wording remains explicitly corpus-bound and environment-bound.
- Keep parity/correctness and performance reporting separate even if the implementation uses one command or one artifact to emit both.
- The solution package must explicitly define:
  - benchmark classes and their preparation steps
  - cold versus warm semantics per class
  - corpus registry/identity expectations
  - required metadata captured with each run
  - latency and RSS reporting behavior
  - degraded/partial benchmark reporting behavior
  - operator wording constraints for docs and command output
- Do not widen this feature into broad optimization work, watch mode, daemon/service rollout, or generic performance-marketing surfaces.
- If a touched benchmark surface cannot truthfully produce RSS or p95 yet, design the result shape so the absence is explicit rather than silent.
