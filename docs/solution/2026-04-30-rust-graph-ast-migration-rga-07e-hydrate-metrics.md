---
artifact_type: implementation_metrics_report
version: 1
status: hydrate_p95_measured_degraded_delete_gate_blocked
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07E
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: target_project_app + runtime_tooling + documentation
generated_at: 2026-05-01
---

# RGA-07E Hydrate Metrics Report

## Executive result

RGA-07E resolves the missing hydrate-p95 instrumentation gap called out by RGA-07B. Hydrate metrics are now exposed through the Rust benchmark artifact shape rather than through a docs-only workaround:

- `dh-engine benchmark --class hydrate-graph` is available as a Rust benchmark surface.
- Index benchmark JSON now exposes single-run `link_ms` and `graph_hydration_ms` under `results[].index_timing`.
- Hydrate benchmark JSON now exposes repeated hydration distribution under `results[].graph_hydration`, including sample counts, p50, p95, max, graph size, and freshness metadata.

Gate result: **hydrate p95 is measurable; measured official-corpus subset is below the 2s p95 threshold, but the run is degraded and does not unblock RGA-08 deletion**.

RGA-07E did not optimize incremental performance (RGA-07F), did not produce final official parity (RGA-07G), and did not delete TS graph code.

## Artifacts produced

| Artifact | Purpose | Result |
| --- | --- | --- |
| `docs/solution/rga-07e-hydrate-graph-benchmark.json` | Raw `dh-engine benchmark --class hydrate-graph` JSON | Generated. |
| `docs/solution/rga-07e-hydrate-metrics-summary.json` | Consolidated RGA-07E gate summary | Generated. |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07e-hydrate-metrics.md` | Human-readable metrics report | Generated. |

## Instrumentation added

### Rust benchmark/report surface

- Added `BenchmarkClass::HydrateGraph` and CLI value `--class hydrate-graph`.
- Added `GraphHydrationBenchmarkMetrics` to the benchmark artifact schema.
- Added `graph_hydration: Option<GraphHydrationBenchmarkMetrics>` to `BenchmarkResult`.
- Extended `IndexBenchmarkMetrics` with:
  - `link_ms`
  - `graph_hydration_ms`
- Extended benchmark summary output with:
  - index `link` and `graph_hydration` values
  - hydrate distribution line with samples, p50, p95, max, node/edge counts, and freshness

### Measurement semantics

`hydrate-graph` performs a normal Rust index preparation for the requested workspace, then runs `HydratedGraphProjection::hydrate` five times against the produced index state. This exposes a real distribution (`p50`, `p95`, `max`) instead of reusing a single opaque `IndexReport.graph_hydration_ms` value.

This benchmark measures Rust in-memory graph projection construction only. It does not include index extraction, link pass, bridge startup, query latency, or Node event-loop delay.

## Measurement summary

Command:

```bash
cd /Users/duypham/Code/DH/rust-engine && cargo run -p dh-engine -- benchmark --class hydrate-graph --workspace /Users/duypham/Code/DH --output /Users/duypham/Code/DH/docs/solution/rga-07e-hydrate-graph-benchmark.json
```

Measured official corpus: `/Users/duypham/Code/DH` local working tree.

| Metric | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| hydrate samples requested | 5 | n/a | measured |
| hydrate samples completed | 5 | n/a | measured |
| hydrate p50 | 417.508 ms | n/a | measured |
| hydrate p95 | 463.391 ms | ≤ 2,000 ms | measured degraded subset pass |
| hydrate max | 463.391 ms | n/a | measured |
| nodes hydrated | 5,951 | n/a | measured |
| persisted edges hydrated | 74,315 | n/a | measured |
| synthetic edges hydrated | 11,196 | n/a | measured |
| freshness | partial | current preferred | degraded |

Index preparation metrics from the same artifact:

| Metric | Value |
| --- | ---: |
| elapsed | 77,966 ms |
| link | 630 ms |
| single-run graph hydration | 418 ms |
| scanned files | 353 |
| changed files | 11 |
| reindexed files | 353 |
| refreshed current files | 351 |
| degraded partial files | 2 |
| not current files | 32 |

Freshness caveat: the hydrated graph projection freshness was `partial` because `2 indexed file(s) have degraded partial freshness`; the baseline index report also had `not_current_files=32`. The p95 measurement is still real, but it is not clean current hot-path proof.

## Gate matrix

| Gate | RGA-07E result | Delete-gate impact |
| --- | --- | --- |
| Hydrate p95 measurable | Implemented in Rust benchmark JSON and CLI | Resolves missing instrumentation gap |
| Hydrate p95 ≤ 2s | Measured degraded subset pass (`p95=463.391 ms`) | Partial positive evidence only |
| Large-corpus 3k-file hydrate proof | Not available; official corpus scanned 353 files | Limitation remains |
| Current hot-path freshness | Degraded (`partial`, 32 not-current files) | Deletion remains blocked |
| Incremental performance failures | Out of scope for RGA-07E; pending RGA-07F | Still blocks deletion |
| Final official parity | Out of scope for RGA-07E; pending RGA-07G | Still blocks deletion |

## Validation commands run

```bash
cd /Users/duypham/Code/DH/rust-engine && cargo fmt --package dh-types --package dh-engine
cd /Users/duypham/Code/DH/rust-engine && cargo check -p dh-engine -p dh-types
cd /Users/duypham/Code/DH/rust-engine && cargo test -p dh-engine -- benchmark
cd /Users/duypham/Code/DH/rust-engine && cargo test -p dh-types
cd /Users/duypham/Code/DH/rust-engine && cargo run -p dh-engine -- benchmark --class hydrate-graph --workspace /Users/duypham/Code/DH --output /Users/duypham/Code/DH/docs/solution/rga-07e-hydrate-graph-benchmark.json
```

Rule-scan evidence must be captured after this report and artifacts exist. Expected changed scope includes Rust benchmark/type surfaces, CLI args, Cargo manifest, benchmark CLI tests, and RGA-07E docs/JSON artifacts.

## RGA-07E conclusion

RGA-07E can move to `dev_done` if rule-scan and workflow evidence capture succeed, because instrumentation/report artifacts exist and required Cargo/benchmark validation passed. RGA-08 deletion remains blocked by known non-RGA-07E limitations: degraded/currentness caveats in hydrate evidence, RGA-07F incremental performance failures, and RGA-07G official parity gaps.
