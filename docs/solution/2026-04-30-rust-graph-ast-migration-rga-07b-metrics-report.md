---
artifact_type: implementation_metrics_report
version: 1
status: measured_subset_delete_gate_blocked
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07B
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: target_project_app + runtime_tooling + documentation
generated_at: 2026-05-01
---

# RGA-07B Metrics Report: Payload, Event Loop, Memory, Incremental, Hydrate, and buildEvidence Gates

## Executive result

RGA-07B produced a non-production, env-gated measurement harness and JSON artifacts for the official DH/OpenKit corpus. The measured subset is useful, but it does **not** unblock RGA-08 deletion.

Gate result: **measured subset captured; delete gate remains blocked**.

Reasons deletion remains blocked:

1. RGA-07A already showed official-corpus TS baseline/parity remains partial and not gate-eligible.
2. Hydrate p95 is still not exposed by the current CLI/benchmark JSON even though Rust `IndexReport` has `graph_hydration_ms` internally.
3. Changed incremental 1-file and 10-file temp-copy measurements were captured and both missed the approved p95 budgets.
4. Official warm index benchmark was degraded because it observed changed files in the working tree.
5. Rollback rehearsal is pending RGA-07C and is not proven by this report.

No TypeScript graph code was deleted. No production Rust or TypeScript code was modified. Measurement logic is confined to an env-gated artifact under `docs/solution/`.

## Artifacts produced

| Artifact | Purpose | Result |
| --- | --- | --- |
| `docs/solution/rga-07b-metrics-tool.test.ts` | Env-gated, non-production Vitest harness for measurements | Added; skipped unless `RGA_07B_MEASURE_METRICS=1` is set. |
| `docs/solution/rga-07b-tooling-inspection.json` | Available benchmark/tooling inventory | Generated. |
| `docs/solution/rga-07b-official-index-memory.json` | Official-corpus Rust warm-index process RSS/event-loop wrapper | Generated; warm benchmark degraded because `changed_files=1`. |
| `docs/solution/rga-07b-official-warm-index-benchmark.json` | Raw `dh-engine benchmark --class warm-no-change-index` JSON | Generated; benchmark result degraded. |
| `docs/solution/rga-07b-bridge-query-metrics.json` | JSON-RPC payload, Node event-loop, query latency, and bridge RSS measurements | Generated; measured subset passes payload/event-loop/buildEvidence budgets. |
| `docs/solution/rga-07b-incremental-metrics.json` | Temp-copy changed 1-file and 10-file incremental measurements | Generated; both p95 gates fail. |
| `docs/solution/rga-07b-measurement-summary.json` | Consolidated gate summary | Generated; `status=measured_subset_delete_gate_blocked`. |

## Tooling inspection

Observed surfaces:

- Root `package.json` scripts: `check`, `test`, `test:watch`; no native `benchmark` or `parity` npm script exists.
- Rust `dh-engine` CLI exists after build and supports:
  - `benchmark --class cold-full-index`
  - `benchmark --class warm-no-change-index`
  - `benchmark --class incremental-reindex`
  - `benchmark --class cold-query`
  - `benchmark --class warm-query`
  - `benchmark --class parity-benchmark`
  - `parity`
- Current CLI/JSON limitations recorded in `rga-07b-tooling-inspection.json`:
  - benchmark JSON does not expose payload byte distribution;
  - benchmark memory fields are `not_measured`;
  - hydrate timing exists internally in `IndexReport.graph_hydration_ms`, but is not printed by `dh-engine index` or serialized in benchmark JSON;
  - built-in `incremental-reindex` remains no-mutation evidence, so changed-file mutation samples require an external temp-copy harness.

## Measurement summary

All measurements used the official DH/OpenKit repo at `/Users/duypham/Code/DH`. The current corpus is below the approved 3,000-file large-corpus target, so these are official-corpus measurements, not large-corpus proof.

### Payload gate

Measured through direct JSON-RPC calls from the TypeScript harness to `dh-engine serve`.

| Metric | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| samples | 45 | n/a | measured |
| response payload p50 | 853 bytes | n/a | measured |
| response payload p95 | 15,171 bytes | ≤ 256 KB | measured subset pass |
| response payload max | 15,171 bytes | ≤ 1 MB | measured subset pass |

Caveat: this is bounded direct bridge evidence, not every higher-level OpenCode app/retrieval path.

### Node event-loop gate

Measured with `node:perf_hooks monitorEventLoopDelay` in the TypeScript harness while awaiting Rust stdio responses.

| Metric | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| p50 | 11.035 ms | n/a | measured |
| p95 | 11.231 ms | ≤ 20 ms | measured subset pass |
| max | 24.150 ms | ≤ 100 ms | measured subset pass |

Caveat: this measures the harness event loop, not every UI/runtime call site.

### Bridge query latency and buildEvidence gate

Measured through direct JSON-RPC samples against the existing `dh-index.db` state.

| Method | Samples | Latency p50 | Latency p95 | Payload p95 |
| --- | ---: | ---: | ---: | ---: |
| `query.search` | 10 | 5.936 ms | 10.916 ms | 2,585 bytes |
| `query.definition` | 5 | 4.984 ms | 7.499 ms | 1,741 bytes |
| `query.relationship` | 15 | 393.067 ms | 421.137 ms | 853 bytes |
| `query.callHierarchy` | 5 | 4.932 ms | 5.059 ms | 455 bytes |
| `query.entryPoints` | 5 | 4.592 ms | 5.212 ms | 440 bytes |
| `query.buildEvidence` | 5 | 454.828 ms | 529.007 ms | 15,171 bytes |

`buildEvidence` p95 is **529.007 ms**, under the approved 1,000 ms budget for this measured subset.

Caveats:

- Some query responses are `insufficient` because the chosen bounded query labels did not all resolve to grounded graph facts in the current DB; timing/payload still measure the Rust response path.
- `query.relationship` p95 is below the 1,000 ms buildEvidence gate but is slower than other methods and should remain a performance-watch item.

### Memory / peak RSS gate

Measured via external macOS process RSS sampling (`ps -o rss= -p <pid>`) from the TypeScript harness.

| Scope | Peak RSS | p95 RSS | Notes |
| --- | ---: | ---: | --- |
| Rust `dh-engine serve` during JSON-RPC query series | 289,161,216 bytes | 284,049,408 bytes | measured, external process sampling |
| Rust official warm-index benchmark wrapper | 200,638,464 bytes | 160,055,296 bytes | measured, benchmark degraded due changed file |
| Temp-copy changed 1-file incremental samples | max 196,935,680 bytes | n/a aggregate | max of sampled process peaks |
| Temp-copy changed 10-file incremental samples | max 208,289,792 bytes | n/a aggregate | max of sampled process peaks |

Caveat: this is process RSS sampling, not allocator-level profiling; short spikes between polling intervals may be missed.

### Changed 1-file incremental gate

Measured in a temporary corpus copy to avoid destructive mutation of the repository working tree.

| Metric | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| samples | 3 | n/a | measured |
| changed files per sample | 1 | n/a | measured |
| wall p50 | 2,986.891 ms | n/a | measured |
| wall p95 | 3,110.447 ms | ≤ 500 ms | fail |
| engine duration p50 | 2,972 ms | n/a | measured |
| engine duration p95 | 3,098 ms | ≤ 500 ms | fail |

This gate is a **measured failure** for the approved 1-file incremental p95 budget.

### Changed 10-file incremental gate

Measured in the same temporary corpus copy.

| Metric | Value | Threshold | Result |
| --- | ---: | ---: | --- |
| samples | 3 | n/a | measured |
| changed files per sample | 10 | n/a | measured |
| wall p50 | 4,837.651 ms | n/a | measured |
| wall p95 | 4,948.998 ms | ≤ 2,000 ms | fail |
| engine duration p50 | 4,820 ms | n/a | measured |
| engine duration p95 | 4,935 ms | ≤ 2,000 ms | fail |

This gate is a **measured failure** for the approved 10-file incremental p95 budget.

### Hydrate p95 gate

Hydrate p95 remains **blocked / not instrumented**.

Evidence:

- `dh-indexer::IndexReport` contains `graph_hydration_ms` and `link_ms` fields.
- `dh-engine index` stdout currently prints only aggregate `duration_ms`, changed/reindexed/deleted counts, and embedding status.
- `dh-engine benchmark` JSON serializes `IndexBenchmarkMetrics`, but that type currently lacks `graph_hydration_ms` and `link_ms`.

No hydrate p95 was fabricated. The needed follow-up is to expose per-run hydrate timing through benchmark artifacts or a dedicated metrics command.

### Official warm-index benchmark attempt

Command produced `docs/solution/rga-07b-official-warm-index-benchmark.json`.

Result:

| Metric | Value |
| --- | ---: |
| status | degraded |
| elapsed | 5,078.099 ms |
| scanned files | 350 |
| changed files | 1 |
| reindexed files | 1 |
| retained current files | 347 |
| not current files | 0 |

This is useful memory/process evidence but not clean warm-no-change benchmark evidence because it detected a changed file.

## Commands run

```bash
cd /Users/duypham/Code/DH/rust-engine && cargo build -p dh-engine
cd /Users/duypham/Code/DH && RGA_07B_MEASURE_METRICS=1 npm test -- docs/solution/rga-07b-metrics-tool.test.ts
```

The metrics harness internally ran these non-destructive or temp-copy commands:

```bash
/Users/duypham/Code/DH/rust-engine/target/debug/dh-engine benchmark --class warm-no-change-index --workspace /Users/duypham/Code/DH --output /Users/duypham/Code/DH/docs/solution/rga-07b-official-warm-index-benchmark.json
/Users/duypham/Code/DH/rust-engine/target/debug/dh-engine serve --workspace /Users/duypham/Code/DH
/Users/duypham/Code/DH/rust-engine/target/debug/dh-engine index --workspace <temp-copy> --force-full
/Users/duypham/Code/DH/rust-engine/target/debug/dh-engine index --workspace <temp-copy>
```

The temp-copy mutation harness removed its temporary copy after measurements.

## Gate matrix

| Gate | RGA-07B result | Delete-gate impact |
| --- | --- | --- |
| JSON-RPC payload p50/p95/max | Measured subset pass (`p95=15,171 bytes`, `max=15,171 bytes`) | Partial positive evidence only |
| Node event-loop p95/max while TS calls Rust | Measured subset pass (`p95=11.231 ms`, `max=24.150 ms`) | Partial positive evidence only |
| Peak RSS/memory during Rust query/index | Measured via external process RSS | Partial positive evidence; no allocator profile |
| Changed 1-file incremental p95 ≤ 500 ms | Measured failure (`engine p95=3,098 ms`) | Blocks deletion gate |
| Changed 10-file incremental p95 ≤ 2 s | Measured failure (`engine p95=4,935 ms`) | Blocks deletion gate |
| Hydrate p95 ≤ 2 s | Not instrumented | Blocks deletion gate |
| buildEvidence p95 ≤ 1,000 ms | Measured subset pass (`p95=529.007 ms`) | Partial positive evidence only |
| TS baseline comparison | Blocked by RGA-07A partial baseline | Blocks deletion gate |
| Rollback rehearsal | Pending RGA-07C | Blocks deletion gate until RGA-07C completes |

## Scan/tool evidence

OpenKit `tool.rule-scan` must be run after this report and the generated artifacts exist. Expected scope:

- `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07b-metrics-report.md`
- `docs/solution/rga-07b-metrics-tool.test.ts`
- `docs/solution/rga-07b-tooling-inspection.json`
- `docs/solution/rga-07b-official-index-memory.json`
- `docs/solution/rga-07b-official-warm-index-benchmark.json`
- `docs/solution/rga-07b-bridge-query-metrics.json`
- `docs/solution/rga-07b-incremental-metrics.json`
- `docs/solution/rga-07b-measurement-summary.json`

Scan evidence is `runtime_tooling` and does not replace Cargo/npm command evidence.

## RGA-07B conclusion

RGA-07B can move to `dev_done` because the requested report and JSON artifacts exist and capture both measured metrics and honest blockers. It must **not** be interpreted as delete-gate pass evidence. RGA-08 remains blocked until parity/TS-baseline comparison, hydrate p95, incremental performance failures, and rollback rehearsal are resolved or explicitly accepted by the user as documented exceptions.
