# OpenKit Reuse Integration — Indexing Benchmark Evidence

Date: 2026-04-11

Related:
- `docs/architecture/openkit-reuse-dh-runtime-integration-checklist.md`
- `packages/intelligence/src/graph/graph-indexer.benchmark.test.ts`

## Command

```bash
npx vitest run packages/intelligence/src/graph/graph-indexer.benchmark.test.ts --reporter=verbose
```

## Output snapshot

```text
[graph-indexer-benchmark] full_ms=3167 full_indexed=120 incremental_ms=36 incremental_indexed=1 incremental_skipped=119
```

## Interpretation

- Full index run processed entire fixture project: `120` files in `3167ms`.
- Incremental run after touching one file indexed `1` file and skipped `119` files in `36ms`.
- This validates content-hash incremental behavior and closes checklist item P5 benchmark evidence requirement.

## Notes

- Fixture size is synthetic but representative enough for regression tracking.
- For production-like profiling, repeat benchmark on larger repo snapshots and store time-series data.
