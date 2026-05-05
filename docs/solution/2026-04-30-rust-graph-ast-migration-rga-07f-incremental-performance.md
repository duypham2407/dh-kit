# RGA-07F Incremental Performance Report

## Scope

RGA-07F covers incremental indexing/link/hydration performance remediation evidence for the Rust Graph/AST migration. This recovery report is validation-only: it summarizes existing RGA-07F artifacts and inspected RGA-07F code paths without adding new optimizations, deleting TypeScript graph code, or starting RGA-07G/RGA-08.

## Artifacts reviewed

- `docs/solution/rga-07f-performance-summary.json`
- `docs/solution/rga-07f-after-incremental-metrics.json`
- `docs/solution/rga-07f-before-warm-no-change-index.json`
- `docs/solution/rga-07f-after-warm-no-change-index.json`
- `docs/solution/rga-07f-after2-warm-no-change-index.json`
- `docs/solution/rga-07f-after3-warm-no-change-index.json`
- `docs/solution/rga-07f-incremental-metrics-tool.test.ts`
- `rust-engine/crates/dh-indexer/src/hasher.rs`
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-indexer/src/scanner.rs`

## Optimization summary

The RGA-07F code changes target incremental work avoidance rather than adding a new benchmark mode:

1. `hash_incremental_candidates` in `dh-indexer/src/hasher.rs` skips full content hashing for unchanged candidates when existing file metadata still matches, while still checking file readability for skipped candidates.
2. `index_workspace` and `index_paths` in `dh-indexer/src/lib.rs` use incremental hash results plus a metadata-only dirty-set fallback when no files need content hashing.
3. Content-only incremental changes avoid full workspace relinking and graph hydration when the confirmed delta shows no public API or structure change, there are no deletes, and there are no fatal invalidation roots. In the measured after artifact, this is visible as `link_ms: 0` and `graph_hydration_ms: 0` for both 1-file and 10-file changed subsets.
4. Multi-file or force-full runs use a reusable `LinkWorkspaceSnapshot` so per-file linking can reuse existing workspace file/symbol context instead of repeatedly rebuilding it.
5. Existing graph edges are preserved when a refreshed current file has no replacement graph edges, preventing unnecessary edge deletion/reinsertion in unchanged/content-only flows.

`scanner.rs` only shows import/order/formatting-level differences in the inspected diff; no RGA-07F performance behavior is attributable to scanner logic.

## Incremental gate classification

Source summary: `docs/solution/rga-07f-performance-summary.json`.

| Gate | Threshold | Before RGA-07F | After measured subset | Classification |
| --- | ---: | ---: | ---: | --- |
| Changed 1-file incremental p95 | `<= 500 ms` | `3098 ms` | `287 ms` | Pass for measured subset |
| Changed 10-file incremental p95 | `<= 2000 ms` | `4935 ms` | `1831 ms` | Pass for measured subset |

The JSON records both gates as `measured_subset_pass`. This should be treated as **partial / measured-subset pass**, not full delete-gate clearance, because the artifacts also record limitations:

- measurements ran on the DH/OpenKit official corpus, which is below the 3,000-file target;
- p95 is based on three samples per mutation set;
- the benchmark used the debug `dh-engine` binary for comparability with RGA-07B, not release-profile SLA proof;
- RGA-07G parity remains out of scope and may still block RGA-08;
- RGA-08 deletion was not started.

## Warm no-change trend

The warm no-change artifacts show the no-change path improving across the RGA-07F attempts:

| Artifact | elapsed_ms | link_ms | graph_hydration_ms | changed_files | reindexed_files |
| --- | ---: | ---: | ---: | ---: | ---: |
| `rga-07f-before-warm-no-change-index.json` | `3038.471` | `551.0` | `421.0` | `0` | `0` |
| `rga-07f-after-warm-no-change-index.json` | `1219.644833` | `667.0` | `398.0` | `0` | `0` |
| `rga-07f-after2-warm-no-change-index.json` | `1120.893125` | `578.0` | `397.0` | `0` | `0` |
| `rga-07f-after3-warm-no-change-index.json` | `125.49845800000001` | `0.0` | `0.0` | `0` | `0` |

The final warm no-change artifact is consistent with the content/no-op fast path: no files changed or reindexed, no workspace relink, and no graph hydration.

## Validation performed during recovery

- `cargo check -p dh-indexer` from `rust-engine`: passed.
- `cargo test -p dh-indexer -- linker` from `rust-engine`: passed; 3 linker tests passed, all other suites filtered out.
- `tool.typecheck` on `docs/solution/rga-07f-incremental-metrics-tool.test.ts`: passed with 0 diagnostics.
- `tool.syntax-outline` was attempted on `hasher.rs`, `lib.rs`, and `scanner.rs`; Rust outline support was reported as degraded/unsupported-language, so direct file reads were used. `tool.syntax-outline` on the TypeScript metrics tool was available.

## Gate decision

RGA-07F-R can be marked `dev_done` because the missing report has been recovered, existing RGA-07F artifacts were inspected, and lightweight validation passed.

RGA-07F can be marked `dev_done` as an incremental performance remediation/reporting slice because both RGA-07F incremental p95 gates pass for the measured subset. This does **not** unblock RGA-08 by itself: RGA-07G parity and any remaining non-incremental delete-gate requirements must still pass or receive explicit user-approved exceptions.

## Remaining blocker

Keep RGA-08 blocked. The RGA-07F summary only says the incremental gate is unblocked by RGA-07F; it explicitly keeps RGA-07G parity out of scope, and this recovery did not start RGA-07G/RGA-08 or delete TS graph code.
