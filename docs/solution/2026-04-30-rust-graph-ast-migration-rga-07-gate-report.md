---
artifact_type: implementation_gate_report
version: 1
status: delete_gate_blocked_pending_metrics
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: target_project_app + runtime_tooling + documentation
generated_at: 2026-05-01
---

# RGA-07 Gate Report: Parity, Benchmark, Payload, Event-loop Evidence

## Executive result

RGA-07 produced the requested gate evidence report and refreshed feasible validation on the current DH/OpenKit repository corpus. The implementation slice can be marked `dev_done` as an honest gate report, but the RGA-08 deletion gate is **blocked**.

RGA-08 must **not** delete `packages/intelligence/src/graph/` or `packages/storage/src/sqlite/repositories/graph-repo.ts` yet because the approved deletion gate requires parity, payload, Node event-loop delay, memory, TS-baseline comparison, full changed-mutation incremental evidence, and rollback rehearsal evidence that is not currently available from the implemented tooling.

## Official corpus

- Official corpus used for feasible benchmark attempts: current DH/OpenKit repository at `/Users/duypham/Code/DH`.
- Benchmark tool-reported corpus label: `DH@local-working-tree (DhRepo)`.
- Rust benchmark scan reported `scanned_files = 348`, which is below the 3,000-file large-corpus target in the approved plan. This is recorded as a limitation, not a corpus substitution.
- Environment reported by benchmark artifacts: `macos-aarch64 build_profile=debug`, `cpu_count = 8`.

## Gate result for RGA-08

**Blocked.**

Evidence that supports partial readiness:

- Required Rust Cargo test/check commands all completed successfully.
- Targeted npm tests established in RGA-05/RGA-06 completed successfully.
- Production import audit found no production imports of legacy TS graph extraction symbols in `packages/runtime`, `packages/retrieval`, or `packages/opencode-app`.
- Existing benchmark command classes exist and were attempted/run where feasible.
- Cold/warm Rust query benchmark p95 values are comfortably below the approved 200 ms query p95 budget for the implemented bounded query benchmark.

Blocking gaps for deletion:

- Official-corpus parity command cannot run because no official-corpus baseline JSON set exists; it fails looking for `../parity-baselines/vitest.config.ts.json`.
- No normalized TS baseline vs Rust fact parity percentages exist for the official DH/OpenKit corpus.
- No payload p50/p95/max measurement exists.
- No Node event-loop p95/max measurement exists.
- No memory/peak RSS measurement exists; benchmark artifacts explicitly report `not_measured`.
- No TS baseline comparison exists for the `Rust full index+link+hydrate ≤ 80% TS baseline` gate.
- Incremental benchmark currently uses unchanged corpus/no mutation, so it does not prove 1-file p95 ≤ 500 ms or 10-file p95 ≤ 2 s.
- Cold full index benchmark is degraded (`not_current_files = 42`, `degraded_partial_files = 2`) and cannot be used as healthy full-index deletion evidence.
- No `DH_GRAPH_AST_ENGINE=ts|rust|compat` implementation or rollback rehearsal evidence is present.

## Required Rust validation attempts

All required commands below were run from `rust-engine/` with exit status 0:

| Command | Result | Notes |
| --- | --- | --- |
| `cargo test -p dh-parser -- module_resolver` | PASS | 7 resolver tests passed. |
| `cargo test -p dh-indexer -- linker` | PASS | 3 linker tests passed. |
| `cargo test -p dh-graph` | PASS | 5 graph tests passed. |
| `cargo test -p dh-query` | PASS | 12 query tests passed. |
| `cargo test -p dh-engine -- bridge` | PASS | 15 bridge-filtered tests passed; 57 filtered out. |
| `cargo check -p dh-engine -p dh-indexer -p dh-parser -p dh-storage -p dh-graph -p dh-query` | PASS | Workspace packages checked successfully. |

Additional parity/benchmark test suites that clearly existed were run from `rust-engine/`:

| Command | Result | Notes |
| --- | --- | --- |
| `cargo test -p dh-indexer --test parity_harness_test` | PASS | 5 curated fixture parity tests passed. This validates the fixture harness only, not official-corpus parity. |
| `cargo test -p dh-engine --test benchmark_cli_test` | PASS | 3 benchmark CLI tests passed. This validates CLI artifact shape on fixtures/small temp workspace only. |

## Targeted npm validation

The targeted npm command established by RGA-05/RGA-06 was run from repository root:

```bash
npm test -- packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts packages/opencode-app/src/worker/host-bridge-client.test.ts packages/retrieval/src/query/run-retrieval.test.ts packages/retrieval/src/semantic/telemetry-collector.test.ts packages/runtime/src/jobs/index-job-runner.test.ts
```

Result: **PASS** — 5 test files passed, 49 tests passed.

This is target-project app validation for the targeted TS tests only. It is not full `npm test` or `npm run check` evidence.

## Production import audit

OpenKit import graph status was checked and is currently degraded/read-only with zero indexed nodes/edges/symbols. Because graph indexing was unavailable in this session, the audit used OpenKit search/fallback grep evidence.

Audit commands/checks:

- `tool.import-graph status`: degraded/read-only; graph database empty and indexing mutations unavailable.
- Search under `packages/runtime` for `extractCallEdges|extractCallSites|extractImportEdges|GraphRepo|GraphIndexer|graph-repo|intelligence/src/graph`.
- Search under `packages/retrieval` for the same extraction/storage symbols.
- Search under `packages/opencode-app` for the same extraction/storage symbols.
- Search under `packages` for direct imports from `graph-indexer.js`, `graph-repo.js`, `extract-call-edges.js`, `extract-call-sites.js`, and `extract-import-edges.js`.

Audit result:

- `packages/runtime`: no production legacy extraction imports. Matches are the new Rust graph-report adapter names (`RuntimeIndexGraphReport`, `loadRuntimeIndexGraphReportFromRustBridge`) and are allowed RGA-06 adapter boundaries.
- `packages/retrieval`: no matches for legacy graph extraction/storage symbols.
- `packages/opencode-app`: no matches for legacy graph extraction/storage symbols.
- Remaining direct imports are inside legacy graph implementation/tests/benchmark and storage graph repo tests:
  - `packages/intelligence/src/graph/graph-indexer.ts` imports `extract-import-edges` and `GraphRepo` internally.
  - `packages/intelligence/src/graph/*.test.ts` imports legacy extraction/indexer test subjects.
  - `packages/intelligence/src/graph/graph-indexer.benchmark.test.ts` imports `GraphIndexer`/`GraphRepo`.
  - `packages/storage/src/sqlite/repositories/graph-repo.ts` still exports `GraphRepo`.
  - `packages/storage/src/sqlite/repositories/graph-repo.test.ts` still tests `GraphRepo`.
  - `packages/storage/src/sqlite/db.ts` still creates legacy graph tables.

Classification: no production import leftover was found in migrated runtime/retrieval/opencode-app consumers, but legacy TS graph implementation and `GraphRepo` still exist as RGA-08 delete candidates. They must not be deleted in RGA-07.

## Benchmark and parity command attempts

### Existing command discovery

- Root `package.json` scripts are only `check`, `test`, and `test:watch`; no npm benchmark/parity script exists.
- `rust-engine/Cargo.toml` has no `[[bench]]` entry and no Criterion dependency discovered.
- Existing Rust benchmark/parity CLI commands are implemented in `dh-engine`:
  - `cargo run -p dh-engine -- benchmark --class <class> --workspace <path> --output <path>`
  - `cargo run -p dh-engine -- parity --workspace <path> --output <path>`
- Existing benchmark classes: `cold-full-index`, `warm-no-change-index`, `incremental-reindex`, `cold-query`, `warm-query`, `parity-benchmark`.

### Official-corpus parity attempts

Both official-corpus parity attempts failed because baseline JSON files are unavailable for the DH/OpenKit corpus:

| Command | Result | Blocking reason |
| --- | --- | --- |
| `cargo run -p dh-engine -- benchmark --class parity-benchmark --workspace /Users/duypham/Code/DH --output docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-parity-benchmark.json` | FAIL | `read baseline JSON /Users/duypham/Code/parity-baselines/vitest.config.ts.json` → no such file. |
| `cargo run -p dh-engine -- parity --workspace /Users/duypham/Code/DH --output docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-parity-command.json` | FAIL | Same missing baseline JSON condition. |

No parity output JSON was created by these failed commands.

### Official-corpus benchmark artifacts produced

| Command class | Artifact | Result summary |
| --- | --- | --- |
| `cold-full-index` | `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-cold-full-index.json` | Degraded. `elapsed_ms = 65356.543`, `scanned_files = 348`, `changed_files = 348`, `reindexed_files = 348`, `deleted_files = 21`, `refreshed_current_files = 346`, `degraded_partial_files = 2`, `not_current_files = 42`, memory not measured. |
| `warm-no-change-index` | `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-warm-no-change-index.json` | Complete. `elapsed_ms = 2725.112`, `scanned_files = 348`, `changed_files = 0`, `reindexed_files = 0`, `retained_current_files = 346`, memory not measured. |
| `incremental-reindex` | `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-incremental-reindex.json` | Degraded by design. `elapsed_ms = 2615.480`, unchanged corpus/no mutation; does not prove changed-file incremental p95. |
| `cold-query` | `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-cold-query.json` | Complete. `sample_count_requested = 25`, `sample_count_completed = 25`, `p50_ms = 4.047`, `p95_ms = 4.513`, memory not measured. |
| `warm-query` | `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-warm-query.json` | Complete. `sample_count_requested = 25`, `sample_count_completed = 25`, `p50_ms = 4.122`, `p95_ms = 4.546`, memory not measured. |

## Approved threshold assessment

| Gate requirement | Current evidence | Gate state |
| --- | --- | --- |
| Symbols ≥ 99% official-corpus parity | Not available; official-corpus parity command fails due missing baseline JSON. | Blocked |
| Imports/dependencies including cross-root ≥ 99% | Not available; official-corpus parity command fails due missing baseline JSON. | Blocked |
| Calls/references ≥ 95% with gaps triaged | Not available; official-corpus parity command fails due missing baseline JSON. | Blocked |
| Critical fixtures 100% pass | Curated fixture harness test passed; benchmark CLI parity fixture tests passed. | Partial only |
| Rust full index+link+hydrate ≤ 80% TS baseline or exception | Rust cold full index artifact exists but is degraded; no TS baseline; no hydrate-specific metric. | Blocked |
| Incremental 1-file p95 ≤ 500 ms | No changed 1-file mutation benchmark exists. | Blocked |
| Incremental 10-file p95 ≤ 2 s | No changed 10-file mutation benchmark exists. | Blocked |
| Hydrated query p95 ≤ 200 ms | Implemented bounded query benchmark p95 is ~4.5 ms for top-symbol queries. Does not prove every approved graph query class/end-to-end bridge path. | Partial pass |
| buildEvidence p95 ≤ 1,000 ms | Not separately measured by benchmark class. | Blocked |
| Hydrate p95 ≤ 2 s for 3k-file target or limitation | Corpus benchmark scanned 348 files; hydrate p95 not instrumented. | Blocked/limitation |
| Payload p95 ≤ 256 KB and max ≤ 1 MB | No payload measurement tooling found/run. | Blocked |
| Node event-loop p95 ≤ 20 ms and max ≤ 100 ms | No Node event-loop measurement tooling found/run. | Blocked |
| Memory | Benchmark artifacts report `not_measured`. | Blocked |
| Rollback rehearsal before deletion | No `DH_GRAPH_AST_ENGINE` implementation found and no rollback rehearsal performed. | Blocked |

## Rollback checkpoint

Searches for `DH_GRAPH_AST_ENGINE`, `GRAPH_AST`, `graphAst`, and `GraphAst` in TypeScript and Rust scopes found no implementation. Therefore rollback rehearsal is unavailable for this gate. RGA-08 must not proceed until either:

1. the approved rollback checkpoint is implemented and rehearsed before deletion, or
2. the user explicitly approves a documented exception to delete without rollback rehearsal.

## Missing/unavailable metrics

- Official-corpus normalized TS-vs-Rust parity report.
- Official-corpus parity gap classification/triage.
- TS baseline index/link/hydrate/query timing.
- Rust-vs-TS performance ratio.
- Hydrate-specific p95.
- Changed 1-file and 10-file incremental p95.
- Payload p50/p95/max.
- Node event-loop p95/max.
- Peak RSS/memory measurement.
- buildEvidence-specific p95.
- Rollback rehearsal via `DH_GRAPH_AST_ENGINE=ts|rust|compat`.

## Scan/tool evidence

OpenKit `tool.rule-scan` was run directly on the RGA-07 gate report and generated JSON benchmark artifacts.

| Scope | Direct tool status | Result | Caveat |
| --- | --- | --- | --- |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-gate-report.md` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for Markdown. |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-cold-full-index.json` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for JSON. |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-warm-no-change-index.json` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for JSON. |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-incremental-reindex.json` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for JSON. |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-cold-query.json` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for JSON. |
| `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07-warm-query.json` | available | succeeded, 0 findings | Semgrep reported 0 targets scanned for JSON. |

Classification summary: `blocking=0`, `true_positive=0`, `non_blocking_noise=0`, `false_positive=0`, `follow_up=0`, `unclassified=0`.

OpenKit rule-scan is `runtime_tooling` evidence and does not replace Cargo/npm `target_project_app` validation. The scan result is useful as direct tool availability and finding evidence for the report/artifact scope, but its limitation is that Markdown/JSON artifacts had no parsed Semgrep targets.

## RGA-07 conclusion

RGA-07 is a completed evidence-gate report if the workflow evidence records are captured and the task board is updated to `dev_done`. The deletion gate for RGA-08 remains blocked because multiple approved metrics and rollback evidence are unavailable. RGA-08 should remain non-deleting until the missing metrics are implemented/captured or the user explicitly approves exceptions.
