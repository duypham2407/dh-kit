---
artifact_type: scope_package
version: 1
status: draft
feature_id: FEATURE-VECTOR-DB-UPGRADE
feature_slug: vector-db-upgrade
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Vector Db Upgrade

## Goal

Upgrade DH semantic retrieval from SQLite/custom ANN scan paths toward a dedicated local Vector DB capability at the Rust layer so larger codebases can produce low-latency, reliable RAG evidence without changing the externally meaningful semantic-search result contract.

## Target Users

- Developers using DH/OpenKit semantic search across medium and large repositories.
- Agents and workflows that rely on ranked code evidence for RAG, planning, review, and QA.
- Maintainers who need predictable local retrieval performance and debuggable index state.

## Problem Statement

DH currently has multiple vector search paths: TypeScript-side custom HNSW/flat ANN cache behavior and Rust-side SQLite embedding storage with in-process vector scoring. The Rust path stores embeddings in SQLite and can return semantic evidence, but search loads model-matching vectors and sorts them in process. This is simple and compatible, but it does not provide predictable millisecond retrieval as corpus size grows, and it duplicates vector-search responsibility across TypeScript and Rust surfaces.

The source improvement request in `docs/improve/feature-01-3-nang-cap-vector-db.md` proposes replacing the SQLite/custom ANN performance bottleneck with a dedicated local Vector DB such as LanceDB or Qdrant local Rust crate.

## In Scope

- Add product support for a dedicated local Vector DB-backed retrieval path in the Rust layer.
- Preserve current semantic-search caller expectations: query vector in, ranked chunk evidence out.
- Support workspace/model/dimension isolation so incompatible embedding vectors are never mixed.
- Support indexing, upserting, deleting, or invalidating chunk vectors as code chunks change.
- Support hydration or migration from existing SQLite embedding records without forcing unnecessary source re-indexing.
- Surface backend/degraded state so users and agents can tell whether retrieval used Vector DB, SQLite scan, or another fallback.
- Define performance, recall/parity, and failure-mode acceptance criteria suitable for Solution Lead design and QA verification.

## Out of Scope

- Final choice of LanceDB vs Qdrant vs another Vector DB engine; Solution Lead owns the technical trade-off.
- Changing embedding provider behavior, embedding model defaults, or embedding-generation quality.
- Replacing SQLite for non-vector storage such as chunks, files, symbols, project graph facts, sessions, or workflow state.
- Removing the existing TypeScript HNSW/ANN implementation in this feature unless required for safe compatibility.
- Introducing a hosted/remote Vector DB as the required default for local DH usage.
- Changing JSON-RPC semantic/search result shapes unless a backward-compatible extension is explicitly approved.

## Main Flows

- A workspace with existing SQLite embeddings can initialize a Vector DB index from those embeddings and run semantic search without a full source re-index.
- A new or changed chunk is embedded, written to durable storage, and made searchable through the Vector DB path.
- A deleted or stale chunk is removed or invalidated so it no longer appears in semantic results.
- A query runs against the matching workspace/model/dimension vector set and returns ranked chunk evidence compatible with current consumers.
- If Vector DB initialization or lookup fails, retrieval reports degraded state and falls back to the safest existing behavior when available.

## Business Rules

- Local-first behavior is mandatory: normal semantic search must not require a separately managed network service.
- Result compatibility is mandatory: existing semantic-search consumers must keep receiving meaningful chunk identity, file/span/content, score, and evidence metadata.
- Model/dimension isolation is mandatory: vectors from different models or dimensions must not be compared in the same search set.
- Stale evidence prevention is mandatory: updated or deleted chunks must not continue appearing after the normal indexing/update flow completes.
- Degraded fallback must be observable: silent fallback to slow scan or partial retrieval is not acceptable.
- SQLite may remain a source of durable embedding metadata or fallback data unless Solution Lead proposes a safer alternative.

## Acceptance Criteria Matrix

| ID | Acceptance Criteria | Verification Expectation |
| --- | --- | --- |
| AC1 | Semantic search returns externally compatible ranked chunk evidence for existing callers. | Contract/unit tests compare result shape and key fields against current Rust semantic search behavior. |
| AC2 | Existing SQLite embeddings can hydrate/build the Vector DB index without requiring full source re-index. | Migration/hydration test with pre-existing embeddings. |
| AC3 | Updated or deleted chunks do not appear as stale Vector DB matches after update/delete flow. | Index lifecycle tests covering upsert, delete, and orphan cleanup. |
| AC4 | Searches only compare vectors with matching workspace, model, and dimensions. | Isolation tests with mixed models/dimensions. |
| AC5 | Large-workspace retrieval uses the dedicated Vector DB path and avoids loading every embedding for each query. | Benchmark or instrumentation evidence on representative vector counts. |
| AC6 | Vector DB failure reports degraded retrieval and falls back safely where current scan behavior is available. | Failure injection tests and observable backend metadata. |
| AC7 | Local/offline usage does not require a networked Vector DB service. | Configuration/initialization test without external service dependency. |
| AC8 | Recall/ranking remains acceptably close to exact cosine scan for representative fixtures. | Parity benchmark with documented tolerance. |

## Edge Cases

- Workspace has no embeddings yet.
- Workspace has SQLite embeddings but no Vector DB files.
- Vector DB index exists but is older than embedding schema or vector metadata version.
- Chunk content hash changes while old vectors remain on disk.
- Multiple embedding models are present for the same workspace.
- Vector dimensions differ because a model changed or an embedding provider was reconfigured.
- Large repositories exceed memory assumptions that were safe for in-process scan.

## Error And Failure Cases

- Vector DB crate initialization fails because local files are missing, corrupt, locked, or incompatible.
- Vector DB query fails after embeddings were successfully generated or stored.
- Hydration from SQLite partially succeeds and leaves incomplete vector coverage.
- Delete/invalidation fails and creates stale retrieval risk.
- Approximate search returns materially different results from exact scan beyond accepted recall tolerance.
- Platform/package constraints prevent the selected local Vector DB engine from working consistently.

## Open Questions

- Should SQLite embeddings remain canonical durable records with Vector DB as a derived index, or should Vector DB become canonical for vector payloads?
- What vector count and p95 latency target define success for this feature: 100k, 1M, or another representative corpus size?
- What recall tolerance versus exact cosine scan is acceptable for agent-facing retrieval?
- Should the TypeScript HNSW index be retained, deprecated, or only used outside the Rust-backed search path?
- Where should Vector DB files live, how should they be versioned, and what cleanup/compaction lifecycle is required?
- Which platforms must the chosen local Vector DB support on day one?

## Success Signal

Semantic search on a larger indexed workspace uses the Rust Vector DB backend, returns compatible evidence, avoids full-vector scan per query, reports backend/degraded state, and demonstrates materially lower query latency with acceptable recall parity against exact scan.

## Handoff Notes For Solution Lead

- Compare LanceDB, Qdrant local, and any repository-appropriate alternative against local-first operation, packaging, migration, query speed, and Rust integration risk.
- Treat product behavior compatibility as a hard constraint unless a backward-compatible extension is explicitly justified.
- Define the durable-source-of-truth relationship between SQLite embeddings and Vector DB records.
- Include a validation plan for hydration, stale-vector prevention, model/dimension isolation, degraded fallback, result compatibility, and performance/recall evidence.
- Keep implementation scope focused on Rust-layer retrieval acceleration; do not broaden into embedding provider changes or unrelated storage replacement.
