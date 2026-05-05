---
artifact_type: implementation_baseline_report
version: 1
status: rga_01_artifact_readback_required
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-01
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: documentation
---

# RGA-01 Baseline: Rust Graph/AST Migration

## Purpose

This artifact freezes the current implementation baseline for **RGA-01 — Baseline flag and corpus freeze** without changing code. It records current repository observations that later RGA tasks must verify before claiming Rust Graph/AST migration progress.

This report intentionally does **not** claim build, test, parity, benchmark, or performance pass results. It exists to make the official corpus, command reality, known TypeScript graph consumers, known Rust/RPC surfaces, and next validation commands inspectable before RGA-02+ implementation begins.

## Official Corpus

- Official acceptance corpus for the first phase: the current **DH/OpenKit repository** at this workspace root.
- This corpus choice comes from the approved scope/solution/plan for `rust-graph-ast-migration`.
- No file-count benchmark has been run in this RGA-01 artifact. If later benchmark evidence finds the corpus is below a large-corpus target such as 3,000 files, later reports must record that limitation without silently switching the official corpus.

## Command Reality To Verify Later

Observed command surfaces in the current repository:

- Root `package.json` defines:
  - `npm run check` -> `tsc --noEmit`
  - `npm test` -> `vitest run`
  - `npm run test:watch` -> `vitest`
- `rust-engine/Cargo.toml` defines a Rust workspace with these members:
  - `dh-types`
  - `dh-storage`
  - `dh-parser`
  - `dh-indexer`
  - `dh-graph`
  - `dh-query`
  - `dh-engine`
- Repository OpenKit documentation says target-project app-native build/lint/test evidence must only be claimed after real commands are run. This RGA-01 task was explicitly constrained to **not run build/test**.

Later implementation must re-verify command availability before using these commands, because this report only records current file observations.

## Known TypeScript Graph Consumers And Legacy Surfaces

Current observations from source files:

- `packages/runtime/src/jobs/index-job-runner.ts`
  - Imports and uses `extractCallEdges`, `extractCallSites`, `extractImportEdges`, and `extractSymbolsFromFiles` in the indexing workflow.
  - Current result fields include `filesScanned`, `symbolsExtracted`, `edgesExtracted`, `callSitesExtracted`, `chunksProduced`, and diagnostics.
- `packages/retrieval/src/query/run-retrieval.ts`
  - Imports `extractImportEdges` and `extractSymbolsFromFiles` while building retrieval results.
  - Uses graph expansion through `packages/retrieval/src/query/expand-graph.ts` with `IndexedEdge` inputs.
- `packages/retrieval/src/query/expand-graph.ts`
  - Expands retrieval results from existing edge data supplied by the retrieval path.
- `packages/intelligence/src/graph/`
  - Current directory contains TypeScript graph extraction/indexing modules and tests, including call edge extraction, call site extraction, import edge extraction, graph indexing, module resolution, and reference tracking.
- `packages/intelligence/src/parser/ast-symbol-extractor.ts`
  - Current TypeScript AST symbol extraction surface used by consumers.
- `packages/storage/src/sqlite/repositories/graph-repo.ts`
  - Exports `GraphRepo` and writes/reads legacy graph structures such as nodes, edges, symbols, references, and calls.
- `packages/storage/src/sqlite/db.ts`
  - Creates legacy graph tables: `graph_nodes`, `graph_edges`, `graph_symbols`, `graph_symbol_references`, and `graph_calls`.
- `packages/shared/src/types/graph.ts`
  - Contains shared graph types used by the legacy TypeScript graph surfaces.

These are observations only. They are not a fresh consumer audit proving all consumers have been migrated or classified.

## Known Rust And RPC Surfaces

Current observations from Rust and bridge/client files:

- `rust-engine/crates/dh-engine/src/bridge.rs`
  - Has direct handler branches for `query.callHierarchy` and `query.entryPoints`.
  - Also contains other direct query handlers outside the approved migration expansion, so direct handler presence alone must not be treated as public worker/client capability evidence.
- `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - Current `WORKER_TO_HOST_QUERY_METHODS` contains `query.search`, `query.definition`, `query.relationship`, and `query.buildEvidence`.
  - Current tests assert `query.callHierarchy` is **not** accepted by `is_worker_to_host_query_method`, which is the protocol gap RGA-05 must close.
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - Current `V2_METHODS`, `BridgeDirectQueryMethod`, and `BridgeSessionDelegatedMethod` cover `query.search`, `query.definition`, `query.relationship`, and `query.buildEvidence`, not `query.callHierarchy` or `query.entryPoints`.
- `packages/opencode-app/src/worker/host-bridge-client.ts`
  - Current `HOST_BACKED_BRIDGE_SUPPORTED_METHODS` covers `dh.initialize`, `query.search`, `query.definition`, `query.relationship`, and `query.buildEvidence`, not `query.callHierarchy` or `query.entryPoints`.
- `rust-engine/crates/dh-engine/src/benchmark.rs`
  - Contains benchmark support for existing `BenchmarkClass` variants.
- `rust-engine/crates/dh-types/src/lib.rs`
  - Current `BenchmarkClass` variants are `ColdFullIndex`, `WarmNoChangeIndex`, `IncrementalReindex`, `ColdQuery`, `WarmQuery`, and `ParityBenchmark`.
  - No `GraphLinkPass` benchmark class is currently present in the observed enum.

## Current Benchmark Limitation

No benchmark was run for this RGA-01 artifact.

Therefore this report does not claim:

- corpus file count;
- workspace/package root counts;
- symbol/import/call/reference counts;
- cross-root import count;
- TS baseline timing;
- Rust timing;
- query latency;
- payload size;
- memory use;
- Node event-loop delay;
- parity percentages;
- benchmark pass/fail state.

Later implementation must capture those measurements before any delete gate or parity/performance claim.

## RGA-01 Next Validation Commands For Later Implementation

Do not treat these as executed by this artifact. They are the next validation commands or checks to run later when implementation is allowed to run build/test/benchmark commands.

From repository root, after re-verifying command reality:

```bash
npm run check
npm test
```

From `rust-engine/`, after re-verifying the Cargo workspace still matches `rust-engine/Cargo.toml`:

```bash
cargo test -p dh-parser -- module_resolver
cargo test -p dh-indexer -- linker
cargo test -p dh-indexer -- integration
cargo test -p dh-engine -- call_hierarchy
cargo test -p dh-engine -- entry_points
cargo test -p dh-graph
cargo test -p dh-query
cargo test -p dh-engine -- bridge
```

RGA-01/RGA-07 benchmark and evidence checks to run later:

```bash
cargo run -p dh-engine -- benchmark --class cold-full-index --workspace <DH/OpenKit repo root> --output <artifact path>
cargo run -p dh-engine -- benchmark --class warm-no-change-index --workspace <DH/OpenKit repo root> --output <artifact path>
cargo run -p dh-engine -- benchmark --class incremental-reindex --workspace <DH/OpenKit repo root> --output <artifact path>
cargo run -p dh-engine -- benchmark --class cold-query --workspace <DH/OpenKit repo root> --output <artifact path>
cargo run -p dh-engine -- benchmark --class warm-query --workspace <DH/OpenKit repo root> --output <artifact path>
cargo run -p dh-engine -- parity --workspace <DH/OpenKit repo root> --output <artifact path>
```

Additional later checks required by the approved solution:

- Run a fresh consumer audit before deletion to classify remaining references to `packages/intelligence/src/graph/`, TypeScript AST symbol extraction, and `GraphRepo` as production, test, baseline-only, or delete-candidate.
- Verify worker protocol, TS stdio client, and host-backed client all advertise/route `query.callHierarchy` and `query.entryPoints` before consumer migration depends on them.
- Record whether `DH_GRAPH_AST_ENGINE=ts|rust|compat` exists or is added later for the pre-deletion rollback checkpoint; this RGA-01 artifact did not modify config or code to add the flag.
- Run OpenKit scan evidence at later implementation handoff as required by the full-delivery workflow; this RGA-01 artifact only performs documentation read-back.

## RGA-01 Status

- Baseline artifact created from current repo observations only.
- No code was modified.
- TypeScript graph code was not deleted.
- Build/test/benchmark commands were not run.
- Artifact read-back remains the only validation for this RGA-01 slice.
