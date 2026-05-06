---
artifact_type: solution_package
version: 1
status: draft
feature_id: FEATURE-VECTOR-DB-UPGRADE
feature_slug: vector-db-upgrade
source_scope_package: docs/scope/2026-05-05-vector-db-upgrade.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Vector Db Upgrade

## Chosen Approach

Use `sqlite-vec` through `rusqlite` as the first dedicated local Rust vector DB backend, with SQLite embeddings remaining the canonical durable source and the vector index treated as a derived searchable index.

- `sqlite-vec` best matches the current repo shape: Rust already uses SQLite/rusqlite, embeddings are stored as BLOBs, and the query path already runs inside `dh-storage` + `dh-query`.
- Keeping SQLite embeddings canonical makes rollback and rehydration safe: vector index tables can be rebuilt without losing embedding data.
- The backend remains local/offline and avoids a separately managed Vector DB service.
- LanceDB and Qdrant remain valid future options, but they introduce more packaging, storage lifecycle, or service-style operational risk for this first integration.
- Existing TypeScript HNSW/ANN support should stay untouched for compatibility; this work makes Rust semantic search the preferred high-performance path.

## Impacted Surfaces

- `rust-engine/Cargo.toml`
- `rust-engine/crates/dh-storage/Cargo.toml`
- `rust-engine/crates/dh-storage/src/lib.rs`
- `rust-engine/crates/dh-query/Cargo.toml`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-indexer/Cargo.toml`
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-types/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-engine/src/benchmark.rs`
- Rust tests under storage/query/indexer/engine crates
- Optional docs if vector DB files, fallback metadata, or rebuild behavior become user-visible

## Boundaries And Components

- **Storage** owns vector backend initialization, vector index schema/version state, hydration from canonical embeddings, vector upsert/delete/orphan cleanup, and backend health reporting.
- **Indexer** owns mutation calls after embedding writes, file/chunk invalidation, and cleanup flows so the derived vector index does not retain stale chunks.
- **Query** owns backend selection: try Vector DB for healthy matching workspace/model/dimensions, then fall back to current exact SQLite scan with observable degraded metadata.
- **Bridge** owns wire compatibility: keep current `matches` shape stable and expose backend/degraded facts only as additive fields.
- **Types** own explicit retrieval metadata rather than encoding backend state only in strings.

## Interfaces And Data Contracts

- Keep `SemanticSearchQuery` caller inputs backward-compatible; derive dimensions from `query_vector.len()`.
- Extend semantic result metadata with `backend`, `degraded`, and optional `degraded_reason` fields.
- Add storage-level vector index operations such as:
  - `hydrate_vector_index(workspace_id, model, dimensions)`
  - `upsert_vector_index_record(workspace_id, chunk_id, model, dimensions, content_hash, vector)`
  - `delete_vector_index_record(chunk_id)`
  - `semantic_vector_search(workspace_id, model, dimensions, query_vector, limit, min_score)`
  - `vector_backend_status(workspace_id, model, dimensions)`
- Enforce `workspace_id`, `model`, and `dimensions` before vector comparison; do not rely on model alone.
- Bridge response must preserve existing `items[0].matches` and add backend/degraded metadata backward-compatibly.

## Risks And Trade-offs

- `sqlite-vec` packaging/API compatibility is the main technical risk; implementation must spike compile/init before broad rewrites.
- Approximate or vector-extension ranking can differ from exact cosine scan; define recall tolerance before claiming parity.
- Current Rust embedding schema uses `chunk_id` as primary key, which may not support multiple models per chunk; schema or index-side uniqueness must be corrected for AC4.
- Current Rust scan loads all embeddings by model and filters workspace later during chunk hydration; vector search must filter workspace/model/dimension before comparison.
- Delete/invalidation must be explicit enough to avoid stale vector matches after chunk updates or file deletion.
- Backend metadata must be additive because existing consumers may ignore unknown fields.

## Recommended Path

Implement in sequential Rust-first slices: prove the local backend, add lifecycle synchronization, route query with fallback, add performance/recall evidence, then harden integration and docs. Keep TypeScript ANN/HNSW unchanged unless a compatibility issue requires a targeted doc or adapter update.

## Implementation Slices

### VDB-001: Dependency Spike And Storage Abstraction

- Files: `rust-engine/Cargo.toml`, `rust-engine/crates/dh-storage/Cargo.toml`, `rust-engine/crates/dh-storage/src/lib.rs`
- Goal: Prove local vector backend compiles and establish storage abstraction without changing semantic query behavior.
- Validation: `cd rust-engine && cargo test -p dh-storage`
- Notes: prefer a bundled/local API with no external service or native extension install requirement.

### VDB-002: Hydration And Lifecycle Maintenance

- Files: `rust-engine/crates/dh-storage/src/lib.rs`, `rust-engine/crates/dh-indexer/src/lib.rs`, `rust-engine/crates/dh-indexer/tests/integration_test.rs`
- Goal: Hydrate the derived vector index from existing SQLite embeddings and keep it synchronized on upsert/delete/orphan cleanup.
- Validation: `cd rust-engine && cargo test -p dh-storage && cargo test -p dh-indexer`
- Notes: fix or guard embedding uniqueness so workspace/model/dimension isolation is real.

### VDB-003: Vector-Backed Semantic Query With Safe Fallback

- Files: `rust-engine/crates/dh-types/src/lib.rs`, `rust-engine/crates/dh-query/src/lib.rs`, `rust-engine/crates/dh-engine/src/bridge.rs`
- Goal: Route semantic search through Vector DB when healthy, preserve result compatibility, and report fallback/degraded state.
- Validation: `cd rust-engine && cargo test -p dh-query && cargo test -p dh-engine`
- Notes: fallback to exact SQLite scan should set `backend=sqlite_scan`, `degraded=true`, and a clear reason.

### VDB-004: Performance, Recall Parity, And Observability

- Files: `rust-engine/crates/dh-query/src/lib.rs`, `rust-engine/crates/dh-engine/src/benchmark.rs`, relevant benchmark tests
- Goal: Prove AC5 and AC8 through deterministic parity tests and benchmark/instrumentation evidence.
- Validation: `cd rust-engine && cargo test -p dh-engine benchmark_cli_test && cargo test -p dh-query`
- Notes: recommended initial recall target is top-10 overlap >= 0.8 for approximate mode, exact parity if using exact vector scan mode.

### VDB-005: Integration Hardening And Docs Handoff

- Files: `docs/solution/2026-05-05-vector-db-upgrade.md`, optional user/architecture docs, relevant Rust tests
- Goal: Run full validation, document visible behavior, and prepare QA handoff.
- Validation: `npm test`, `npm run check`, and `cd rust-engine && cargo test --workspace` if available in the current repo state.
- Notes: do not change embedding provider defaults or TS HNSW behavior outside scope.

## Dependency Graph

- `VDB-001 -> VDB-002 -> VDB-003 -> VDB-004 -> VDB-005`
- `VDB-001` must complete first because all later work depends on confirmed crate/API and storage abstraction.
- `VDB-002` must precede query routing so Vector DB search does not run against stale or empty derived state.
- `VDB-003` must precede benchmark evidence because performance validation must exercise the real query path.
- Critical path: backend proof -> lifecycle sync -> query routing -> performance/recall evidence -> integration hardening.

## Parallelization Assessment

- parallel_mode: `limited`
- why: Storage abstraction and lifecycle work are sequential at first; after VDB-001, benchmark/test harness prep can overlap with lifecycle work if files do not overlap.
- safe_parallel_zones: [`rust-engine/crates/dh-engine/tests/`, `rust-engine/crates/dh-query/tests/`, `docs/`]
- sequential_constraints: [`VDB-001 -> VDB-002 -> VDB-003`, `VDB-003 -> VDB-004 -> VDB-005`]
- integration_checkpoint: after `VDB-003`, run Rust query/engine tests and inspect bridge response compatibility before performance tuning.
- max_active_execution_tracks: 2 after `VDB-001`; 1 before that.

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Scope AC | Validation Path |
| --- | --- |
| AC1 compatible ranked evidence | Contract tests in `dh-query` and bridge tests in `dh-engine`; existing match fields remain present. |
| AC2 hydrate from SQLite embeddings | Storage/indexer test seeds `embeddings`, builds vector index, queries without source re-index. |
| AC3 stale vector prevention | Storage/indexer tests cover content hash change, chunk/file delete, and orphan cleanup. |
| AC4 workspace/model/dimension isolation | Mixed workspace/model/dimension fixtures assert only exact matching vector set is searched. |
| AC5 no full load per query | Instrumented test or benchmark verifies healthy vector path does not call full embedding scan. |
| AC6 degraded fallback | Failure injection forces vector init/query failure and asserts `backend=sqlite_scan`, `degraded=true`, and fallback results. |
| AC7 local/offline usage | Init test runs without external vector DB process or network service dependency. |
| AC8 recall/ranking parity | Deterministic top-k parity test versus exact cosine scan with documented tolerance. |

## Integration Checkpoint

After `VDB-003`, Fullstack must provide evidence for:

- `cd rust-engine && cargo test -p dh-storage`
- `cd rust-engine && cargo test -p dh-indexer`
- `cd rust-engine && cargo test -p dh-query`
- `cd rust-engine && cargo test -p dh-engine`
- One sample `query.semanticSearch` response showing unchanged `matches` plus additive backend/degraded metadata.

## Rollback Notes

- SQLite embeddings remain canonical, so rollback can disable Vector DB routing and use current exact scan without losing embedding data.
- Do not delete or rewrite canonical `embeddings` rows during vector index rebuild.
- If vector index schema/version is incompatible, mark backend degraded and rehydrate from SQLite rather than failing semantic search outright.
- If selected crate causes platform packaging failures, keep storage abstraction with exact scan behavior and route dependency decision back to Solution Lead before broad rewrites.

## Reviewer Focus Points

- Backend is truly local-first and does not require a managed service.
- Semantic result compatibility and bridge response shape are additive.
- Workspace/model/dimension filters happen before vector comparison.
- Stale vectors are removed on chunk update/delete and cannot appear after normal indexing completes.
- Fallback is observable, not silent.
- Performance evidence exercises the real vector-backed query path.

## Implementation Notes

- The first implementation keeps SQLite embeddings as canonical records and adds a derived `vector_index` table plus per-workspace/model/dimension `sqlite-vec` `vec0` virtual tables named from `vector_index_vec0_*`.
- `dh-storage` registers `sqlite-vec` locally through `rusqlite` auto-extension, so normal operation remains offline and does not require a networked vector service.
- `dh-query` now routes semantic search through storage-level vector search, returning the existing match fields plus additive `backend`, `degraded`, `degraded_reason`, and `scanned_records` metadata.
- The bridge keeps `items[0].matches` stable and adds `backend`, `degraded`, `degradedReason`, and `scannedRecords` alongside those matches.
- Indexing and file invalidation prune derived vector records when chunks are rewritten or deleted; SQLite embeddings remain the rebuild/fallback source of truth.
- Current performance evidence is deterministic backend instrumentation and benchmark probe coverage, not a large-corpus latency proof. Large representative corpus latency/recall measurement remains a QA/follow-up risk if no suitable corpus is available locally.

## Task Board Suggestions

- `VDB-001-storage-backend-spike`: Add local vector backend dependency and storage abstraction.
- `VDB-002-hydration-lifecycle`: Hydrate from SQLite and sync upsert/delete/orphan cleanup.
- `VDB-003-query-routing-fallback`: Route semantic search through vector backend with additive degraded metadata.
- `VDB-004-performance-recall`: Add benchmark/parity evidence and no-full-scan instrumentation.
- `VDB-005-integration-docs`: Run full validation, document visible storage/fallback behavior, prepare QA handoff.
