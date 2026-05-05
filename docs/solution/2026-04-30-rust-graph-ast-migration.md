---
artifact_type: solution_package
version: 2
status: approval_ready
feature_id: RUST-GRAPH-AST-MIGRATION
feature_slug: rust-graph-ast-migration
source_scope_package: docs/scope/2026-04-30-rust-graph-ast-migration.md
source_plan: docs/PLAN-rust-migration.md
gate_revision_artifact: docs/solution/2026-04-30-rust-graph-ast-migration-rga-07h-gate-revision.md
owner: SolutionLead
approval_gate: solution_to_fullstack
handoff_status: pass
parallel_mode: none
---

# Solution Package: Rust Graph/AST Migration

## Chosen Approach

Chọn hướng **Rust-owned Graph/AST end-to-end với adapter TypeScript mỏng, rollout có flag trước delete gate, và cleanup TS graph ngay sau QA pass**. Hướng này đủ vì nó bám trực tiếp vào scope đã approved và plan approved: Rust sở hữu parse/extract/link/storage/hydration/query; TypeScript chỉ điều phối bridge/RPC và render kết quả; cross-root monorepo support, RPC expansion, consumer migration, parity/performance gates và deletion timing đều là gate bắt buộc.

Không chọn big-bang rewrite toàn bộ runtime/retrieval vì scope cần giữ consumer API ổn định trong migration. Không chọn parallel execution vì dependency giữa resolver → linker/storage → hydration/query → RPC/consumer → parity/delete rất chặt; chạy song song sẽ dễ tạo contract drift và evidence khó tin cậy.

## Upstream Contract

- Scope package approved: `docs/scope/2026-04-30-rust-graph-ast-migration.md` (`handoff_status: pass`). Version 2 includes the user-approved RGA-07 deletion-gate revision.
- Plan approved: `docs/PLAN-rust-migration.md`.
- Full lane locked bởi user: `mode = full`, `lane_source = user_explicit`; solution này **không đổi lane** dù bản chất công việc là migration/modernization.
- User decisions phải giữ nguyên:
  1. Cross-root full support ngay phase đầu.
  2. DH/OpenKit repo hiện tại là official acceptance corpus phase đầu.
  3. Worker/client protocol phải mở rộng ngay cho `query.callHierarchy` và `query.entryPoints`.
  4. Delete TS graph code/GraphRepo ngay sau QA pass + delete gate; không giữ compatibility window dài.
  5. RGA-07H gate revision: legacy TS aggregate-count parity is diagnostic/context only, not a hard delete gate, when gaps are classified as legacy baseline/model-equivalence deltas rather than Rust bugs.

## Dependencies

### Runtime/config dependencies

- Chọn feature flag tạm thời cho cutover/rollback checkpoint: `DH_GRAPH_AST_ENGINE=ts|rust|compat`.
  - `ts`/`compat` chỉ hợp lệ trong pre-deletion migration window.
  - Sau QA pass + deletion, production steady state phải là Rust-only; không hứa runtime fallback sang TS graph extraction.
- Rust workspace hiện có tại `rust-engine/Cargo.toml`; các Cargo commands trong validation matrix là expected commands nếu workspace vẫn đúng tại implementation time.
- JS/TS command reality phải được FullstackAgent/QA verify lại tại thời điểm implement trước khi claim. `package.json` hiện có `check`, `test`, `test:watch`, nhưng solution này không claim đã chạy hoặc đã pass.

### Không thêm dependency ngoài scope nếu chưa cần

- Không thêm MessagePack/Feature 01-2 trong solution này; payload gates chỉ tạo follow-up decision nếu JSON-RPC trở thành bottleneck.
- Không thêm query classes ngoài current contract và `query.callHierarchy`/`query.entryPoints`.

## Impacted Surfaces

### Rust production ownership surfaces

- `rust-engine/crates/dh-parser/src/lib.rs`
- `rust-engine/crates/dh-parser/src/adapters/typescript.rs`
- `rust-engine/crates/dh-parser/src/module_resolver.rs` (new)
- `rust-engine/crates/dh-parser/tests/module_resolver_test.rs` (new)
- `rust-engine/crates/dh-indexer/src/lib.rs`
- `rust-engine/crates/dh-indexer/src/linker.rs` (new)
- `rust-engine/crates/dh-indexer/tests/linker_test.rs` (new)
- `rust-engine/crates/dh-storage/src/lib.rs`
- `rust-engine/crates/dh-graph/src/lib.rs`
- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/worker_protocol.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-engine/src/benchmark.rs`
- `rust-engine/crates/dh-engine/tests/` (new/modified protocol and bridge tests)

### TypeScript consumers/adapters to migrate

- `packages/runtime/src/jobs/index-job-runner.ts`
  - Current observation: imports TS graph extractors (`extractCallEdges`, `extractCallSites`, `extractImportEdges`) and TS symbol extraction.
  - Target: call Rust indexer/bridge or adapter that internally calls Rust; `IndexJobResult` fields derive from Rust report.
- `packages/retrieval/src/query/run-retrieval.ts`
  - Current observation: imports `extractImportEdges` and TS symbol extraction in retrieval path.
  - Target: use Rust graph/index/query outputs; retrieval may still rank/render, but must not run production AST/graph extraction.
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - Current observation: `V2_METHODS`, `BridgeDirectQueryMethod`, `BridgeSessionDelegatedMethod` include first-wave methods but not `query.callHierarchy`/`query.entryPoints`.
  - Target: advertise and type both methods with real capability state and error shape.
- `packages/opencode-app/src/worker/host-bridge-client.ts`
  - Current observation: `HOST_BACKED_BRIDGE_SUPPORTED_METHODS` includes first-wave methods but not `query.callHierarchy`/`query.entryPoints`.
  - Target: host-backed route and parse both methods without TS graph fallback.
- `packages/storage/src/sqlite/repositories/graph-repo.ts`
  - Current observation: `GraphRepo` class still exists and writes/reads legacy graph structures.
  - Target: freeze before delete gate, then delete immediately after QA pass + gate.
- `packages/storage/src/sqlite/db.ts`
  - Target: remove legacy graph table creation when migration-safe; otherwise document read-only/tombstone state with no writes and no `GraphRepo`.
- `packages/intelligence/src/graph/`
  - Target: delete after QA pass + delete gate.
- `packages/intelligence/src/graph/*.test.ts` and storage graph tests
  - Target: port to Rust parity fixtures or delete/classify as non-production before cleanup.

### Evidence/report surfaces

- `docs/solution/2026-04-30-rust-graph-ast-migration.md` (this artifact)
- Recommended implementation evidence artifacts:
  - `docs/solution/2026-04-30-rust-graph-ast-migration-baseline.md`
  - `docs/solution/2026-04-30-rust-graph-ast-migration-consumer-audit.md`
  - `docs/solution/2026-04-30-rust-graph-ast-migration-parity.md`
  - `docs/solution/2026-04-30-rust-graph-ast-migration-benchmark.md`
  - `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07h-gate-revision.md`
- QA artifact expected later: `docs/qa/2026-04-30-rust-graph-ast-migration.md`

## Boundaries And Components

### Boundary decision

Rust owns **facts and traversal**; TypeScript owns **process orchestration and presentation only**.

| Component | Owns after cutover | Must not own after cutover |
| --- | --- | --- |
| `dh-parser` | Tree-sitter parse, symbols/imports/calls/references extraction, TS/JS module resolver, cross-root resolution metadata | Workspace lifecycle, app-level rendering |
| `dh-indexer` | Multi-root workspace scan orchestration, dirty detection, extract pass, cross-file/cross-root link pass, report metrics, hydration invalidation/refresh | TS graph table writes, UI/retrieval answer formatting |
| `dh-storage` | SQLite source-of-truth for canonical graph facts and index state | Duplicate legacy TS graph source-of-truth |
| `dh-graph` | In-memory/persisted graph traversal algorithms: dependencies, dependents, callers/callees, entry points | AST extraction or TS adapter concerns |
| `dh-query` | Query facade over `dh-graph`/`dh-storage` for graph-backed query contracts | Reintroducing TS graph semantics |
| `dh-engine` | JSON-RPC stdio bridge, worker protocol, capability advertisement, request/response serialization, benchmark entrypoints | Letting TS synthesize graph facts |
| TS runtime/retrieval/opencode-app | Call Rust, pass bounded params, render/rank output, preserve public API shape | AST traversal, graph edge construction, graph fact writes, hidden TS fallback |

### Allowed TS responsibilities

- Process spawn/lifecycle around Rust bridge.
- Passing repo root, query, limits, workspace/root hints, and budget options to Rust.
- Rendering, ranking, or packaging already-composed Rust results for app users.
- Temporary adapter API shape during cutover if adapter calls Rust internally and does not traverse AST/build graph/write facts.

### Forbidden TS steady-state responsibilities

- Production `extract-call-edges`, `extract-call-sites`, `extract-import-edges`, `module-resolver`, `GraphIndexer`, `GraphRepo` writes, or equivalent replacement in TS.
- Any “5% fallback” where parity misses are routed to TS extraction.
- Long-lived `DH_GRAPH_AST_ENGINE=ts|compat` production mode after delete gate.

## Interfaces And Data Contracts

### Feature flag contract

```text
DH_GRAPH_AST_ENGINE = "ts" | "rust" | "compat"
```

- Default during first cutover should become `rust` once RGA-02/RGA-03/RGA-04 are ready.
- `ts`/`compat` are only for pre-deletion rollback rehearsal.
- RGA-08 cleanup must remove or hard-disable production TS fallback semantics; if flag remains, non-`rust` values must fail closed or be documented as unavailable after deletion.

### Resolver result contract

Rust resolver should expose a typed result equivalent to the plan, with enough metadata for reports and deletion gates:

| Field | Required meaning |
| --- | --- |
| `specifier` | Import/export/call/reference specifier or target token. |
| `status` | `resolved`, `unresolved`, `ambiguous`, `external`, `unsafe`, `degraded` or Rust enum equivalents. |
| `reason` | Specific reason; no generic “out of scope” for cross-root misses. |
| `resolved_abs_path` | Canonical resolved path when applicable. |
| `resolution_kind` | `relative`, `alias`, `package_export`, `workspace_package`, etc. |
| `config_path` | tsconfig/jsconfig/package metadata source when used. |
| `source_root` / `target_root` | Workspace/package roots for cross-root triage. |
| `confidence` | Needed for link/query/report decisions when resolution is partial. |

### Storage graph fact contract

Canonical Rust storage should use `dh-storage` as source-of-truth. `graph_edges` or derived tables must carry enough metadata to distinguish fact kinds and triage state:

- `kind`: import/dependency/call/reference or equivalent enum.
- `from_node_kind`, `to_node_kind`, `from_file_id`, `to_file_id`, optional symbol IDs.
- `resolution`, `resolution_reason`, `confidence`.
- `source_root`, `target_root`, package/source metadata.
- line/column/span fields for evidence and query output.
- `payload_json` only for bounded metadata that does not become a hidden second source-of-truth.

Legacy TS graph tables may exist only as pre-delete baseline/rollback read-only artifacts; production writes must stop before deletion.

### Index report contract

Rust index/link/hydrate report must feed TS `IndexJobResult`-style consumers without TS extraction. Required fields include:

- `files_scanned`, `workspace_root_count`, `package_root_count`
- `symbols_extracted`, `imports_extracted`, `call_sites_extracted`, `references_extracted`
- `linked_imports`, `linked_cross_root_imports`
- `linked_calls`, `linked_cross_root_calls`
- `linked_references`
- `unresolved_imports`, `unresolved_cross_root_imports`, `unresolved_calls`, `unresolved_references`
- `graph_hydration_ms`, `index_ms`, `link_ms`, `total_ms`
- `payload_bytes`, `event_loop_delay_p95_ms` when measured from TS wrapper
- `triage`: grouped unresolved/ambiguous/external/unsafe/degraded cases with reason/severity

### Hydrated graph/query contract

- SQLite remains persistent source-of-truth; hot query path uses Rust in-memory graph projection when current.
- Projection must have freshness markers: `current`, `cold`, `stale`, or equivalent state in response metadata.
- If projection is cold/stale and SQLite fallback is used, response must expose degraded/cold-start state rather than pretending hot-path latency.
- Supported query methods for this scope:
  - `query.search`
  - `query.definition`
  - `query.relationship` with `usage`, `dependencies`, `dependents`
  - `query.buildEvidence`
  - `query.callHierarchy`
  - `query.entryPoints`

### RPC/capability contract

- `worker_protocol.rs`, `bridge.rs`, TS stdio client, and host-backed client must agree on method names exactly.
- Direct/internal handler presence is not enough; methods must be in worker/client protocol and capability advertisement.
- Unsupported language/scope must use documented error shapes (`METHOD_NOT_SUPPORTED`, `CAPABILITY_UNSUPPORTED`, or existing equivalent) and must not fall back to TS traversal.

## Risks And Trade-offs

| Risk / trade-off | Decision and execution consequence |
| --- | --- |
| Cross-root resolver complexity | Implement first, not late; no delete gate until every cross-root miss is resolved or triaged. |
| Rust/TS contract drift | Keep RPC expansion and TS clients in a dedicated slice after Rust query shape stabilizes; no parallel client work against guessed response contracts. |
| Payload bottleneck | Measure payload p50/p95/max; open Feature 01-2 decision only if gate fails. |
| Legacy schema cleanup safety | Prefer removal; if unsafe, tombstone read-only/no-write and delete `GraphRepo` regardless. |
| QA-pass deletion timing mutates source after QA | Treat deletion as a gated cleanup checkpoint; because it changes source, require focused post-delete review/QA evidence before `full_done`. |
| App-native validation command drift | Fullstack/QA must re-verify package/Cargo command reality before claiming pass. |
| Rust syntax/code intelligence tool support degraded for `.rs` outlines | Implementation should rely on Cargo tests, Rust module boundaries, and direct source review; solution does not assume syntax-outline completeness for Rust files. |

## Recommended Path

1. Freeze baseline and flag first, using DH/OpenKit as official corpus.
2. Build Rust cross-root module resolver in `dh-parser` and tests before any consumer cutover.
3. Add Rust link pass/storage/report fields in `dh-indexer`/`dh-storage` and verify idempotent cross-root edges.
4. Hydrate graph and route query traversal through `dh-graph`/`dh-query`.
5. Expand RPC worker/client protocol for `query.callHierarchy` and `query.entryPoints`.
6. Migrate TS consumers to Rust bridge/adapter and run fresh consumer audit.
7. Capture Rust golden/critical fixture, production consumer audit, targeted Cargo/npm validation, performance/event-loop/payload evidence, RGA-07G delta classification, and rollback-selector caveats under the RGA-07H revised gate.
8. After the revised delete gate allows cleanup implementation, delete TS graph code/GraphRepo in RGA-08 and run focused post-delete review/QA checks.

## Implementation Slices

### RGA-01 — Baseline, flag, corpus freeze

- **Owner:** FullstackAgent
- **Primary output:** baseline/flag implementation and `docs/solution/2026-04-30-rust-graph-ast-migration-baseline.md`
- **Files/areas:**
  - Runtime config/env boundary where graph engine selection belongs.
  - `rust-engine/crates/dh-engine/src/benchmark.rs`
  - Existing TS graph baseline path under `packages/intelligence/src/graph/` and storage read path for baseline only.
  - Evidence records in workflow state.
- **Goal:** capture before-state and create controlled pre-deletion rollback switch.
- **Details:**
  - Lock official corpus to current DH/OpenKit repo.
  - Record file count, workspace/package root counts, symbols/imports/calls/references, cross-root imports, index/query latency, payload size, memory, and Node event-loop delay.
  - Record limitation if corpus has fewer than 3,000 files; do not change corpus.
  - Add/confirm `DH_GRAPH_AST_ENGINE` semantics for pre-deletion migration only.
  - Freeze current RPC method list and explicitly record missing `query.callHierarchy`/`query.entryPoints` as protocol gap to close.
- **Validation hooks:**
  - Baseline report exists and is read back by FullstackAgent.
  - Expected Rust benchmark entrypoint may be validated later from `rust-engine/`; do not claim cargo pass in this slice unless run.
  - JS/TS commands must be re-verified at implementation time before use.

### RGA-02 — Rust module resolver with cross-root support

- **Owner:** FullstackAgent
- **Primary output:** Rust resolver module + tests + cross-root fixtures
- **Files/areas:**
  - `rust-engine/crates/dh-parser/src/module_resolver.rs` (new)
  - `rust-engine/crates/dh-parser/src/lib.rs`
  - `rust-engine/crates/dh-parser/src/adapters/typescript.rs`
  - `rust-engine/crates/dh-parser/tests/module_resolver_test.rs` (new)
- **Goal:** Rust resolves TS/JS relative, alias, package export, workspace package, and cross-root specifiers with triage metadata.
- **Details:**
  - Port TS module resolver behavior and extend for multi-root/package-root awareness.
  - Parse `tsconfig.json`/`jsconfig.json` with comments/trailing commas, `extends`, `baseUrl`, `paths`.
  - Read package names/exports/subpaths needed for DH/OpenKit corpus.
  - Cache config/package metadata safely.
  - Every unresolved/ambiguous/external/unsafe/degraded result must carry reason and root/package context.
  - `typescript.rs` uses the Rust resolver for import resolution; no TS resolver in production path after cutover.
- **Validation hooks:**
  - Expected command from `rust-engine/`: `cargo test -p dh-parser -- module_resolver`
  - Add fixture coverage for relative paths, aliases, package exports/subpaths, ambiguous packages, root escape, missing config, and DH/OpenKit cross-root cases.

### RGA-03 — Rust link pass, storage writes, and report fields

- **Owner:** FullstackAgent
- **Primary output:** idempotent cross-file/cross-root link pass and Rust storage source-of-truth
- **Files/areas:**
  - `rust-engine/crates/dh-indexer/src/linker.rs` (new)
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs`
  - `rust-engine/crates/dh-indexer/tests/linker_test.rs` (new)
- **Goal:** after extraction across all roots, Rust links imports/calls/references, writes canonical facts, and emits report fields needed by TS consumers and evidence gates.
- **Details:**
  - Link pass runs after all workspace/package roots are extracted.
  - Use transactions and idempotent upserts/deletes to avoid duplicate edges on rerun.
  - Bind imported symbols where possible; unresolved binding gets typed triage rather than silent drop.
  - Persist canonical graph facts through `dh-storage`, not legacy TS graph tables.
  - Add report fields listed in the Index report contract.
- **Validation hooks:**
  - Expected command from `rust-engine/`: `cargo test -p dh-indexer -- linker`
  - Expected full pipeline subset: `cargo test -p dh-indexer -- integration`
  - Storage review must prove no parallel production writes to TS legacy graph tables.

### RGA-04 — Graph hydration and Rust query integration

- **Owner:** FullstackAgent
- **Primary output:** hydrated in-memory graph projection and Rust query path
- **Files/areas:**
  - `rust-engine/crates/dh-indexer/src/lib.rs`
  - `rust-engine/crates/dh-graph/src/lib.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-storage/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** supported graph queries read Rust-composed graph results from current hydrated graph or documented degraded/cold state.
- **Details:**
  - Hydrate adjacency, symbol-name, import alias, call/reference maps after index/link or lazy-on-first-query.
  - Invalidate/refresh projection when index/link pass changes graph facts.
  - Implement query traversal for definition, usage/dependencies/dependents, call hierarchy, entry points, and build evidence as scoped by approved contract.
  - Query responses include freshness/degraded/cold-state metadata when not using current hot projection.
- **Validation hooks:**
  - Expected commands from `rust-engine/`: `cargo test -p dh-graph`, `cargo test -p dh-query`, `cargo test -p dh-engine -- bridge`
  - Query latency/payload metrics captured in RGA-07 before deletion.

### RGA-05 — RPC protocol and capability expansion

- **Owner:** FullstackAgent
- **Primary output:** public worker/client support for `query.callHierarchy` and `query.entryPoints`
- **Files/areas:**
  - `rust-engine/crates/dh-engine/src/worker_protocol.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-engine/tests/`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/worker/host-bridge-client.ts`
  - Related TS bridge/client tests if present or added.
- **Goal:** direct handler, worker protocol, TS stdio client, host-backed client, and advertised capabilities all expose the same supported method set.
- **Details:**
  - Add `query.callHierarchy` and `query.entryPoints` to Rust worker-to-host allowed/advertised methods.
  - Add TS type unions, `V2_METHODS`, `HOST_BACKED_BRIDGE_SUPPORTED_METHODS`, request building, result parsing, and error mapping.
  - Capabilities must report true state (`available`, degraded, or unsupported-equivalent) rather than assume support.
  - Keep `traceFlow`, `impactAnalysis`, `semanticSearch` out of scope unless user opens a new decision.
- **Validation hooks:**
  - Expected commands from `rust-engine/`: `cargo test -p dh-engine -- call_hierarchy`, `cargo test -p dh-engine -- entry_points`
  - JS/TS bridge tests: implementation must verify exact command reality first; candidate commands are `npm run check` and targeted `npm test -- <test-file-or-name>` only if supported at that time.

### RGA-06 — TypeScript consumer migration and adapter cutover

- **Owner:** FullstackAgent
- **Primary output:** production TS consumers call Rust path only, plus fresh consumer audit
- **Files/areas:**
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/retrieval/src/query/run-retrieval.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/worker/host-bridge-client.ts`
  - `packages/storage/src/sqlite/repositories/graph-repo.ts` (freeze/remove writes before deletion)
  - `packages/storage/src/sqlite/db.ts` (mark legacy behavior)
  - `packages/intelligence/src/graph/*.test.ts` and related tests/fixtures
  - `docs/solution/2026-04-30-rust-graph-ast-migration-consumer-audit.md`
- **Goal:** runtime indexing, retrieval, bridge/client, and storage consumers no longer depend on TS AST/graph extraction or GraphRepo writes.
- **Details:**
  - Replace direct imports of TS graph extractors with Rust bridge/indexer report or adapter that calls Rust.
  - Replace production TS symbol AST extraction where it feeds Graph/AST facts with Rust outputs.
  - Retrieval can continue semantic ranking/rendering, but graph expansion/dependency facts must come from Rust.
  - Consumer audit must run fresh before deletion using code search/import graph and classify remaining references as production/test/baseline-only/delete-candidate.
  - If tests still depend on TS graph fixtures, port to Rust parity fixtures or explicitly schedule deletion with RGA-08.
- **Validation hooks:**
  - Candidate JS/TS commands must be verified at implementation time before use: `npm run check`, `npm test`/targeted Vitest invocation if still defined.
  - Consumer audit is blocker evidence; no delete if production import/write remains.

### RGA-07 / RGA-07H — Rust golden-fixture, benchmark, payload, event-loop, and evidence gates

- **Owner:** FullstackAgent, with Code Reviewer/QA consuming evidence later
- **Primary output:** Rust-owned golden/critical fixture reports, benchmark reports, RGA-07G delta classification, RGA-07H gate-decision artifact, and workflow verification evidence
- **Files/areas:**
  - `rust-engine/crates/dh-engine/src/benchmark.rs`
  - Rust benchmark/test fixtures across parser/indexer/graph/query/engine crates
  - `docs/solution/2026-04-30-rust-graph-ast-migration-parity.md` / RGA-07G delta classification artifacts
  - `docs/solution/2026-04-30-rust-graph-ast-migration-benchmark.md`
- **Goal:** prove Rust path is safe enough for deletion using the user-approved Rust-owned replacement gate, or identify blocker/user-approved exceptions.
- **Details:**
  - Legacy TS aggregate-count parity is no longer a hard delete gate because RGA-07G classified the major gaps as legacy TS baseline weakness/model non-equivalence, not confirmed Rust bugs.
  - Replacement gate requires Rust golden/critical fixture queries 100% pass; production consumer audit clean for runtime/retrieval/opencode-app; targeted Rust Cargo and npm validations pass for changed surfaces; performance payload/event-loop/hydrate/buildEvidence/incremental measured-subset evidence exists with caveats recorded; and RGA-07G deltas are documented/classified.
  - TS aggregate parity can remain diagnostic/context evidence; it re-blocks deletion only if the delta classification identifies a Rust bug, untriaged critical query miss, production consumer dependency on TS graph extraction, or missing replacement-gate evidence.
  - Performance gates: Rust full index+link+hydrate ≤ 80% TS baseline or user-approved exception; incremental 1-file p95 ≤ 500ms, 10-file p95 ≤ 2s; hydrated query p95 ≤ 200ms; buildEvidence p95 ≤ 1,000ms; hydrate p95 ≤ 2s for 3k-file target or report limitation; payload p95 ≤ 256KB and max ≤ 1MB; Node p95 delay ≤ 20ms, max ≤ 100ms.
  - If DH/OpenKit corpus is below 3,000 files, report limitation but keep it official corpus.
  - Capture rollback-selector behavior before deletion; current TS rollback execution may remain explicitly degraded/unsupported if production TS extraction cannot be safely re-enabled.
  - Record the exact gate replacement in `docs/solution/2026-04-30-rust-graph-ast-migration-rga-07h-gate-revision.md` before RGA-08 cleanup starts.
- **Validation hooks:**
  - Expected Rust command set from `rust-engine/`:
    - `cargo test -p dh-parser -- module_resolver`
    - `cargo test -p dh-indexer -- linker`
    - `cargo test -p dh-indexer -- integration`
    - `cargo test -p dh-engine -- call_hierarchy`
    - `cargo test -p dh-engine -- entry_points`
    - `cargo test -p dh-graph`
    - `cargo test -p dh-query`
    - `cargo test -p dh-engine -- bridge`
  - JS/TS app-native validation: verify commands at implementation time before claiming. Do not substitute OpenKit runtime/workflow checks for app build/lint/test.
  - OpenKit scan evidence gate before code review: `tool.rule-scan` on changed scope or repo root, with direct/substitute/manual evidence labeling.

### RGA-08 — Revised-gate delete cleanup and focused recheck

- **Owner:** FullstackAgent for cleanup; Code Reviewer and QAAgent for focused post-delete recheck
- **Primary output:** TS graph code/GraphRepo deleted, no long compatibility window, post-delete evidence recorded
- **Files/areas:**
  - `packages/intelligence/src/graph/` (delete)
  - `packages/storage/src/sqlite/repositories/graph-repo.ts` (delete)
  - `packages/storage/src/sqlite/db.ts` (drop/remove legacy graph schema or tombstone read-only/no-write)
  - Graph tests/fixtures/imports under TS packages (port/delete/classify)
  - Any exports/barrels/shared types that only existed for TS graph production path
- **Goal:** execute the locked user decision: delete TS graph production code once the RGA-07H revised gate unblocks cleanup implementation, then require focused post-delete code review and QA before closure.
- **Details:**
  - This slice must not start until RGA-01..RGA-07/RGA-07H replacement-gate evidence is recorded and no replacement-gate blocker remains.
  - Because deletion mutates source, run a focused post-delete code-review/QA loop before `full_done`.
  - If schema removal is unsafe, leave only documented read-only/tombstone table compatibility; no `GraphRepo`, no production writes, no TS extraction fallback.
  - Bugs after deletion are fix-forward in Rust/adapter or intentional revert; do not resurrect long-lived TS fallback.
- **Validation hooks:**
  - Fresh consumer audit after deletion: no production imports from `packages/intelligence/src/graph/` and no `GraphRepo` writes.
  - Candidate JS/TS commands and Cargo commands must be re-verified before claim.
  - OpenKit rule + security scan before QA closure: `tool.rule-scan` and `tool.security-scan` with scan evidence fields.

## Dependency Graph

Critical path:

```text
RGA-01 baseline/flag/corpus
  -> RGA-02 Rust resolver
  -> RGA-03 link pass/storage/report
  -> RGA-04 hydration/query
  -> RGA-05 RPC protocol expansion
  -> RGA-06 TS consumer migration/audit
  -> RGA-07/RGA-07H revised gate evidence
  -> RGA-08 delete cleanup implementation
  -> focused post-delete review/QA
```

Sequential constraints for task board if used:

- `RGA-01 -> RGA-02 -> RGA-03 -> RGA-04 -> RGA-05 -> RGA-06 -> RGA-07 -> RGA-08`
- `RGA-05 -> RGA-06` because TS consumers must not depend on guessed RPC shapes.
- `RGA-06 -> RGA-07` because parity/performance evidence must reflect migrated production consumers.
- `RGA-07/RGA-07H -> RGA-08` because delete cleanup is forbidden before Rust golden/critical fixture evidence, consumer audit, targeted validations, performance caveats, RGA-07G delta classification, rollback-selector caveats, and focused review/QA gates are explicit.

## Parallelization Assessment

- `parallel_mode`: `none`
- `why`: Cross-boundary dependencies are high and contract drift risk is unacceptable. Resolver output shapes feed linker/storage; linker facts feed hydration/query; query shapes feed RPC; RPC capability shapes feed TS clients; consumer migration must be audited before parity/delete evidence. Parallel implementation would likely create inconsistent contracts and unreliable evidence.
- `safe_parallel_zones`: `[]`
- `sequential_constraints`:
  - `RGA-01 -> RGA-02 -> RGA-03 -> RGA-04 -> RGA-05 -> RGA-06 -> RGA-07 -> RGA-08`
- `integration_checkpoint`: `IC-1 Rust cutover readiness after RGA-07; IC-2 post-delete focused recheck after RGA-08`
- `max_active_execution_tracks`: `1`

Task board recommendation: create a full-delivery task board only for **visibility and dependency tracking**, not for parallel execution. Every task should remain queued until its predecessor passes its validation hook and evidence is recorded.

## Validation Matrix

| Acceptance target | Slice(s) | Validation path | Evidence surface/caveat |
| --- | --- | --- | --- |
| AC-01 baseline corpus/report | RGA-01 | Baseline report on DH/OpenKit corpus; read back report; record limitation if `< 3,000` files | `documentation`, `target_project_app` only for measured app commands actually run |
| AC-02 Rust production ownership | RGA-02..RGA-06 | Consumer audit proves TS no longer extracts Graph/AST facts or writes graph facts; Rust tests for parser/indexer/query | Rust Cargo = `target_project_app` for Rust workspace when actually run; audit = `documentation`/`runtime_tooling` if tool-assisted |
| AC-03 cross-root resolution | RGA-02/RGA-03/RGA-07 | `cargo test -p dh-parser -- module_resolver`; `cargo test -p dh-indexer -- linker`; cross-root triage report | Expected commands; Fullstack must run before claiming |
| AC-04 graph queries via Rust | RGA-04/RGA-05/RGA-07 | `cargo test -p dh-graph`; `cargo test -p dh-query`; `cargo test -p dh-engine -- bridge`; benchmark query latency | Rust workspace evidence only after commands run |
| AC-05 RPC capability expansion | RGA-05 | `cargo test -p dh-engine -- call_hierarchy`; `cargo test -p dh-engine -- entry_points`; TS bridge/client tests after verifying command reality | Must prove advertised protocol, not direct handler only |
| AC-06 consumer audit clean | RGA-06/RGA-08 | Fresh import/code search or graph-backed audit before deletion and after deletion | `runtime_tooling` if using search/graph tools; document false positives/non-production refs |
| AC-07 revised deletion gate | RGA-07/RGA-07H | Rust golden/critical fixtures 100%; production consumer audit clean; targeted Cargo/npm validation pass; performance measured-subset evidence with caveats; RGA-07G TS-vs-Rust deltas classified | Legacy TS aggregate parity is diagnostic/context only and blocks deletion only if it reveals a Rust bug, untriaged critical miss, or missing replacement-gate evidence |
| AC-08 performance/event-loop/payload | RGA-07 | Benchmark report: index/link/hydrate/query memory/payload/event-loop metrics | If payload fails, open Feature 01-2 decision; do not silently expand scope |
| AC-09 rollback checkpoint | RGA-01/RGA-07 | Rehearse `DH_GRAPH_AST_ENGINE` pre-deletion switch; document no post-delete fallback promise | Pre-deletion only |
| AC-10 immediate cleanup | RGA-08 | Delete TS graph dir/GraphRepo; focused post-delete audit/review/QA | Cleanup after RGA-07H revised-gate readiness; source mutation requires focused code review/QA before closure |
| AC-11 validation labels | All | Every evidence item labels `runtime_tooling`, `compatibility_runtime`, `target_project_app`, `documentation`, etc. | OpenKit runtime scans are not app build/lint/test evidence |

### Required scan/tool evidence gates

- Before `full_code_review`: run `tool.rule-scan` against changed scope or repo root. Record direct status, substitute/manual status if any, finding counts, classification summary, false-positive rationale, validation surface, and artifact refs.
- Before `full_qa` / QA closure: run both `tool.rule-scan` and `tool.security-scan` with the same scan evidence fields.
- These scan tools produce `runtime_tooling` evidence; preserving them in workflow state is `compatibility_runtime`. They do **not** replace Cargo/JS/TS app-native validation.

### Expected app-native commands to verify at implementation time

Rust commands from `rust-engine/` if workspace still matches current `Cargo.toml`:

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

JS/TS commands are candidate validation only until FullstackAgent/QA re-verify command reality at implementation time:

```bash
npm run check
npm test
```

Do not claim JS/TS pass from these commands unless they are actually run successfully after implementation. Do not replace missing/failed JS/TS commands with OpenKit workflow-state, rule-scan, or runtime checks.

## Integration Checkpoint

### IC-1 — Rust cutover readiness before code-review/QA gate

RGA-01..RGA-07 must leave these facts inspectable:

- Rust owns extraction/link/storage/hydration/query for production Graph/AST facts.
- Cross-root misses are all resolved or triaged with reason/severity; no untriaged cross-root miss.
- `query.callHierarchy` and `query.entryPoints` are supported/advertised through worker protocol and TS clients.
- Runtime/retrieval/opencode-app consumers no longer import TS graph extractors for production paths.
- Legacy graph tables have no production writes.
- Rust golden/critical fixture, performance/payload/event-loop, consumer-audit, targeted-validation, and RGA-07G delta-classification gates pass or have explicit user-approved exception.
- Pre-deletion rollback selector behavior is documented, including degraded/unsupported TS rollback execution caveats.
- OpenKit rule-scan evidence exists before code review.

### IC-2 — Revised delete gate and post-delete closure

After RGA-07H confirms revised-gate cleanup readiness:

- Execute RGA-08 cleanup immediately.
- Run fresh consumer audit for deleted surfaces.
- Run focused code review for cleanup diff and source-of-truth claims.
- Run focused QA verification for no TS graph fallback, no GraphRepo writes, and Rust query behavior still intact.
- Record OpenKit rule + security scan evidence before QA closure.

## Rollback Notes

- Rollback switch is only for pre-deletion migration checkpoint: `DH_GRAPH_AST_ENGINE=ts|compat` may be used to rehearse recovery before RGA-08.
- Before RGA-08, rollback means reverting flag to `ts`/`compat` or reverting the migration branch if Rust cutover fails.
- After RGA-08, there is no long-running TS Graph/AST fallback. Recovery paths are:
  - fix-forward in Rust resolver/linker/storage/query/adapter;
  - intentional revert of deletion/migration commit if production-blocking;
  - user-approved follow-up decision for payload transport if JSON-RPC gate fails.
- Schema rollback must not preserve GraphRepo writes in steady state. If legacy tables remain, they are read-only/tombstoned with documented no-write guarantees.

## Reviewer Focus Points

### Scope compliance first

- Verify every user-locked decision is preserved.
- Reject any implementation that keeps TS production AST/graph extraction or GraphRepo writes after cutover.
- Reject any deletion attempt before consumer audit, Rust golden/critical fixture evidence, targeted Cargo/npm validations, performance caveat classification, RGA-07G delta classification, rollback-selector caveats, and scan evidence; reject closure before focused post-delete code review and QA.
- Confirm `query.callHierarchy`/`query.entryPoints` are public worker/client capabilities, not only direct handlers.

### Code quality and correctness

- Rust resolver: deterministic path handling, bounded filesystem traversal, config cache invalidation, explicit ambiguous/unresolved reasons, no unsafe root escape.
- Link pass/storage: idempotent transactions, no duplicate edges, clear resolution/confidence semantics, no hidden duplicate source-of-truth.
- Hydration/query: freshness markers, cold/stale behavior explicit, bounded result sizes, no stale graph answers without disclosure.
- RPC/TS clients: exact method names, consistent error shapes, no guessed method strings, no broad `any` escapes without rationale.
- Consumer migration: TS adapters call Rust and do not reconstruct graph facts locally.
- Evidence: app-native command output, scan evidence, parity reports, and unavailable validation paths are labeled honestly.

## QA Focus Points

- Re-run/inspect official corpus evidence and limitation note if corpus is small.
- Verify RGA-07H revised gate evidence instead of re-imposing legacy TS aggregate parity thresholds as a hard blocker.
- Verify cross-root imports/dependencies/calls/references are resolved or triaged; no untriaged cross-root misses.
- Verify query behavior for definition, usage, dependencies, dependents, call hierarchy, entry points, and buildEvidence via Rust path.
- Verify Node event-loop delay gate while TS wrapper invokes Rust.
- Verify payload gates and decide whether Feature 01-2 follow-up is needed.
- Verify no production imports from `packages/intelligence/src/graph/` and no `GraphRepo` writes before deletion; repeat after deletion.
- Verify post-delete behavior has no promised TS fallback and any remaining legacy schema is read-only/tombstoned.

## Handoff Payload

- **Artifact path:** `docs/solution/2026-04-30-rust-graph-ast-migration.md`
- **Chosen approach:** sequential Rust-owned migration with TS adapter cutover, evidence gates, and post-QA immediate cleanup.
- **Task board:** recommended for visibility only; `parallel_mode: none`.
- **Critical path:** RGA-01 → RGA-02 → RGA-03 → RGA-04 → RGA-05 → RGA-06 → RGA-07/RGA-07H revised gate → RGA-08 cleanup implementation → focused post-delete code review/QA.
- **Must preserve:** full lane lock, official DH/OpenKit corpus, cross-root phase-one support, public RPC expansion for call hierarchy/entry points, no long TS fallback after QA/delete, and honest validation-surface labeling.
