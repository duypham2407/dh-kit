---
artifact_type: implementation_note
version: 1
status: dev_done_pending_review
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
task_id: RGA-07D
source_solution_package: docs/solution/2026-04-30-rust-graph-ast-migration.md
owner: FullstackAgent
validation_surface: target_project_app + runtime_tooling + compatibility_runtime + documentation
generated_at: 2026-05-01
---

# RGA-07D Rollback Flag Implementation Note

## Result

RGA-07D adds a minimal explicit Graph/AST engine selector for the runtime and retrieval adapter boundaries that blocked RGA-07C rollback rehearsal.

The selector is intentionally conservative:

```text
DH_GRAPH_AST_ENGINE=rust|ts|compat
```

- unset/default -> `rust` / Rust-first behavior
- `rust` -> explicit Rust-first behavior
- `compat` -> compatibility-labeled Rust-first behavior; no production TS Graph/AST extraction
- `ts` -> rollback-only label; blocked in normal production adapter calls and reported as unsupported/degraded even when an explicit rollback rehearsal context is requested
- invalid values -> fail closed to Rust-first unavailable/degraded behavior with an invalid-selector label

## Why TS rollback remains degraded

The current runtime/retrieval TypeScript adapter boundaries do not safely expose a supported production rollback call into legacy TS Graph/AST extraction. Re-enabling `GraphIndexer`, `GraphRepo` writes, or `extractImportEdges`/`extractCallEdges`/`extractCallSites` as a normal production fallback would violate the approved RGA migration boundary.

Therefore `DH_GRAPH_AST_ENGINE=ts` is now observable and testable, but it does **not** silently run legacy TS graph extraction. It returns explicit degraded/unsupported state unless a later approved rollback harness adds a safe, bounded pre-deletion rehearsal implementation.

## Selector usage points

- `packages/shared/src/utils/graph-engine-selector.ts`
  - Parses and labels `DH_GRAPH_AST_ENGINE`.
  - Defaults to `rust`.
  - Marks `ts` as rollback-only and `compat` as Rust-first compatibility.
- `packages/retrieval/src/query/dependency-edge-adapter.ts`
  - Reads selector at retrieval dependency-edge boundary.
  - Returns empty dependency edges with explicit degraded state rather than production TS extraction.
  - Supports `allowTsRollbackRehearsal` as a visible unsupported rehearsal context.
- `packages/runtime/src/jobs/rust-index-graph-report-adapter.ts`
  - Reads selector at runtime index graph-report boundary.
  - Returns zero graph counts with explicit degraded state rather than production TS extraction.
  - Supports `allowTsRollbackRehearsal` as a visible unsupported rehearsal context.
- `packages/retrieval/src/query/run-retrieval.ts`
  - Emits selector label/runtime behavior in degraded retrieval telemetry.
- `packages/runtime/src/jobs/index-job-runner.ts`
  - Adds selector label to index summary diagnostics.

## Validation status

Targeted tests cover `rust`, `compat`, `ts`, explicit rollback context, invalid value fallback, and existing runtime/retrieval consumers. Search for `DH_GRAPH_AST_ENGINE` now shows production usage in the shared selector and adapter tests/usages, plus historical docs.

This task does not unblock RGA-08 by itself. RGA-07D provides a real selector seam, but safe TS rollback execution remains unsupported/degraded at these production boundaries.
