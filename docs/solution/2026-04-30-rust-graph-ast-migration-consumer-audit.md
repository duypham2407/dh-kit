# Rust Graph/AST Migration — RGA-06C Consumer Audit

Date: 2026-05-01  
Work item: `rust-graph-ast-migration`  
Task: `RGA-06C — Audit production graph imports and validate consumer cutover`

## Audit scope

This audit checked production imports/usages across `packages/` for:

- `extractCallEdges`
- `extractCallSites`
- `extractImportEdges` and same-module legacy variants surfaced during the audit
- `GraphIndexer`
- `GraphRepo`
- direct imports from `packages/intelligence/src/graph/*`

The audit intentionally does **not** delete `packages/intelligence/src/graph/` or `packages/storage/src/sqlite/repositories/graph-repo.ts`; those remain pre-delete legacy surfaces for RGA-08.

## Tools and search coverage

- OpenKit import graph status: degraded/read-only with an empty index, so it was not used as authoritative dependency evidence.
- OpenKit/Grep audit over `packages/` for the scoped symbols and graph import paths.
- OpenKit syntax outlines were used for the runtime/retrieval adapters and legacy graph/storage files before classification.

Representative audit patterns:

```text
\bextractCallEdges\b
\bextractCallSites\b
\bextractImportEdges\b
\bGraphIndexer\b
\bGraphRepo\b
packages/intelligence/src/graph|intelligence/src/graph|/graph/(extract|graph-indexer|graph-repo|module-resolver)
extract-call-edges|extract-call-sites|extract-import-edges|graph-indexer|module-resolver|graph-repo
graph-repo\.js|repositories/graph-repo|graph_nodes|graph_edges|graph_symbols|graph_calls|graph_symbol_references|replaceAllForNode|upsertNode\(
```

## Results summary

No production imports/usages of the scoped legacy TS graph extractors, `GraphIndexer`, `GraphRepo`, or direct `packages/intelligence/src/graph/*` imports were found outside legacy graph/storage surfaces and tests/benchmarks.

RGA-06A and RGA-06B already removed the production runtime/retrieval imports:

- `packages/retrieval/src/query/run-retrieval.ts` now imports `loadDependencyEdgesFromRustBridge` from `./dependency-edge-adapter.js` instead of `extractImportEdges`.
- `packages/runtime/src/jobs/index-job-runner.ts` now imports `loadRuntimeIndexGraphReportFromRustBridge` from `./rust-index-graph-report-adapter.js` instead of `extractCallEdges`, `extractCallSites`, or `extractImportEdges`.

Both adapters are explicit degraded Rust-boundary placeholders for currently unavailable package-local Rust bridge/report APIs. They avoid running legacy TS graph extraction in the production path.

## Finding classification

| Area | Matches | Classification | Notes |
| --- | ---: | --- | --- |
| `extractCallEdges` | 5 | legacy/test-only | Definition in `packages/intelligence/src/graph/extract-call-edges.ts`; tests in `extract-call-edges.test.ts`. No production consumer outside the legacy graph directory. |
| `extractCallSites` | 5 | legacy/test-only | Definition in `packages/intelligence/src/graph/extract-call-sites.ts`; tests in `extract-call-sites.test.ts`. No production consumer outside the legacy graph directory. |
| `extractImportEdges` | 6 scoped-symbol matches; broader variant matches remain internal legacy graph only | legacy/test-only | Definition/test usage in `packages/intelligence/src/graph/extract-import-edges.*`; `GraphIndexer` still uses `extractImportEdgesRegex`/`extractImportEdgesWithDiagnostics` internally as legacy pre-delete implementation. No production consumer outside the legacy graph directory. |
| `GraphIndexer` | 12 | legacy/test/benchmark-only | Class definition in `packages/intelligence/src/graph/graph-indexer.ts`; test/benchmark usage in `graph-indexer.test.ts` and `graph-indexer.benchmark.test.ts`. No production import outside the legacy graph directory. |
| `GraphRepo` | 16 scoped-symbol matches; broader storage/schema matches are legacy schema/repo/test | legacy/test/storage-pre-delete-only | `GraphRepo` definition remains in storage per RGA-06C instructions. It is imported by legacy `GraphIndexer` and graph/storage tests/benchmarks only. No production consumer outside legacy graph/storage surfaces. |
| Direct imports from `packages/intelligence/src/graph/*` outside graph package | 0 | clean | No direct production imports from package consumers were found. Internal relative imports inside the legacy graph directory remain allowed until RGA-08. |

## Remaining allowed legacy/test imports

Allowed until RGA-08 delete gate:

- `packages/intelligence/src/graph/extract-call-edges.ts`
- `packages/intelligence/src/graph/extract-call-edges.test.ts`
- `packages/intelligence/src/graph/extract-call-sites.ts`
- `packages/intelligence/src/graph/extract-call-sites.test.ts`
- `packages/intelligence/src/graph/extract-import-edges.ts`
- `packages/intelligence/src/graph/extract-import-edges.test.ts`
- `packages/intelligence/src/graph/module-resolver.test.ts`
- `packages/intelligence/src/graph/graph-indexer.ts`
- `packages/intelligence/src/graph/graph-indexer.test.ts`
- `packages/intelligence/src/graph/graph-indexer.benchmark.test.ts`
- `packages/storage/src/sqlite/repositories/graph-repo.ts`
- `packages/storage/src/sqlite/repositories/graph-repo.test.ts`
- legacy graph table declarations in `packages/storage/src/sqlite/db.ts`

These are classified as legacy, parity, benchmark, schema, or test surfaces. They are not production consumer cutover blockers for RGA-06C, but remain delete/tombstone candidates for RGA-08.

## Validation references

RGA-06A and RGA-06B targeted validation evidence already exists:

- `rga-06a-retrieval-consumer-validation-2026-05-01`
- `rga-06b-runtime-index-job-validation-2026-05-01`
- `rga-06b-rule-scan-2026-05-01`

RGA-06C added this audit artifact and should record a fresh audit evidence entry after rule scan.

## Decision

The RGA-06C audit is clean for the scoped graph-import/legacy-consumer patterns. RGA-06C can move to `dev_done`. Because RGA-06A and RGA-06B are already `dev_done`, parent `RGA-06` can also move to `dev_done` if the workflow task-board update succeeds.
