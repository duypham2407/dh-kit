# Plan: Full Migration — 100% Rust-owned Graph/AST Extraction (Option B)

Chuyển dịch hoàn toàn logic Graph & AST extraction từ TypeScript (`packages/intelligence/src/graph/`) xuống Rust engine để loại bỏ event-loop blocking do TS đang duyệt AST/dựng graph. Sau migration, TypeScript chỉ điều phối request, gọi Rust bridge/RPC hoặc compatibility adapter tạm thời, rồi render kết quả cuối cùng; Rust chịu trách nhiệm parse, extract, link, lưu trữ graph facts, hydrate graph và query.

## User Review Required

> [!IMPORTANT]
> **Breaking change có điều kiện**: Chỉ xóa `packages/intelligence/src/graph/` và `GraphRepo` sau khi toàn bộ production consumers đã chuyển sang Rust bridge/RPC hoặc compatibility adapter tạm thời có nội bộ gọi Rust. Không được tuyên bố “zero external consumers” nếu chưa có consumer audit mới tại thời điểm implement.

> [!IMPORTANT]
> **Phụ thuộc Feature 01-2**: Nếu dataset lớn hoặc response lớn, JSON-RPC serialization có thể trở thành bottleneck mới. Feature 01-2 (MessagePack) không nằm trong migration này, nhưng performance gates bên dưới phải đo payload size và latency để quyết định có cần làm tiếp không.

---

## Định nghĩa khóa: “100% Rust-owned Graph/AST”

### Production ownership bắt buộc

“100% Rust-owned Graph/AST” nghĩa là trong **production path**:

- Rust sở hữu toàn bộ AST parsing, symbol extraction, import/export extraction, call-site/call-edge extraction, reference extraction, module resolution, cross-file linking, graph storage writes, in-memory graph hydration và graph/query traversal.
- TypeScript chỉ được phép:
  - gọi Rust qua JSON-RPC/stdout bridge hoặc API adapter;
  - truyền query/input bounded sang Rust;
  - nhận kết quả cuối cùng đã được Rust query/compose ở mức graph facts;
  - format/render câu trả lời ở tầng app;
  - giữ compatibility adapter tạm thời trong migration nếu adapter đó **không** tự duyệt AST hoặc dựng graph bằng TS.
- TypeScript không được còn production code path tự chạy `extract-call-edges`, `extract-import-edges`, `extract-call-sites`, `module-resolver`, `GraphIndexer`, hoặc ghi production graph facts qua `GraphRepo` sau cutover.

### Non-goals

- Không hiểu cứng “đẩy hết vào `dh-graph`”. Ownership được phân bổ qua `dh-parser`, `dh-indexer`, `dh-storage`, `dh-engine`, và `dh-graph` như phần kiến trúc bên dưới.
- Không yêu cầu parity metrics đạt 100% exact count trên mọi edge nếu baseline TS vốn thiếu/khác semantics. Parity là **delete gate** và **confidence metric**, không phải cho phép giữ 5% extraction trong TS.
- Legacy TS tables/code có thể giữ read-only để baseline/parity và rollback checkpoint **trước QA pass**; sau QA pass và delete gate, không giữ compatibility window dài, xóa TS graph code/GraphRepo và xử lý lỗi phát sinh bằng fix-forward.
- Không mở rộng scope sang MessagePack/Feature 01-2, `traceFlow`, `impactAnalysis`, `semanticSearch`, hoặc query classes khác ngoài `callHierarchy` và `entryPoints`. Cross-root monorepo resolution là scope bắt buộc ngay phase đầu.

### Phân biệt “100% migration” và “coverage/parity”

- **100% migration** = 100% production extraction/query ownership chuyển sang Rust, không còn TS AST/graph extraction fallback.
- **Coverage/parity** = tỷ lệ Rust facts/queries khớp baseline TS hoặc acceptance corpus. Coverage dùng để quyết định có đủ an toàn để xóa TS code hay chưa; coverage thấp không được bù bằng cách giữ TS production fallback trong trạng thái cuối.

---

## Quyết định đã khóa từ user review

> [!IMPORTANT]
> 1. **Cross-root import resolution**: Chọn **Option B — cross-root full support ngay**. Phase đầu phải coi monorepo cross-root resolution là acceptance requirement, không phải nice-to-have. Caveat: resolver/linker phức tạp hơn; mọi unresolved cross-root edge phải được triage, không được classify là “out of scope”.
> 2. **Benchmark corpus**: Chọn **Option A — DH/OpenKit repo hiện tại là official acceptance corpus phase đầu**. Nếu file count không đạt ngưỡng lớn như 3,000 files, ghi limitation trong benchmark report nhưng không đổi corpus chính thức.
> 3. **RPC/worker protocol**: Chọn **Option B — mở rộng ngay với `callHierarchy` và `entryPoints`**. Hai method này phải vào worker/client protocol, capability advertisement và tests trước delete gate; direct handler chưa advertise không đủ.
> 4. **Rollback/deletion window**: Chọn **Option A — delete TS graph code ngay sau QA pass**. Có thể giữ rollback checkpoint trước deletion, nhưng không giữ compatibility window dài sau QA; lỗi phát sinh sau deletion xử lý bằng fix-forward trong Rust/adapter.

---

## Kiến trúc ownership đề xuất theo crate

Yêu cầu gốc nói “đẩy xuống `dh-graph`”, nhưng solution-ready architecture nên phân bổ theo trách nhiệm thực tế:

| Crate/layer | Trách nhiệm trong migration | Không làm |
|-------------|-----------------------------|-----------|
| `dh-parser` | Tree-sitter parse, AST fact extraction, language adapters, module resolver cho TS/JS import specifier gồm workspace roots, package aliases/exports và cross-root monorepo resolution, raw facts: symbols/imports/calls/references/chunks | Không quản lý workspace lifecycle hoặc query traversal |
| `dh-indexer` | Workspace scan multi-root, dirty detection, incremental index, orchestration extract pass, cross-root cross-file link pass, build/hydrate graph projection sau khi facts đã persist | Không render câu trả lời app-level |
| `dh-storage` | SQLite persistent source-of-truth cho files/symbols/graph edges/chunks/embeddings và schema migration | Không duplicate legacy TS graph tables trong steady state |
| `dh-engine` | JSON-RPC stdio bridge, lifecycle, capability advertisement, bounded RPC contract, request/response serialization, gọi query/indexer/storage Rust | Không để TS tự tổng hợp graph facts thay Rust |
| `dh-graph` | Traversal/query algorithms trên graph đã hydrate hoặc persisted facts: dependencies, dependents, shortest path, callers/callees khi contract hỗ trợ | Không sở hữu toàn bộ extraction pipeline một mình |

`dh-query` hiện là adjacent query facade trong repo; nếu giữ, nó nên gọi `dh-graph`/`dh-storage` và không làm TS extraction.

Acceptance implication: `dh-parser` + `dh-indexer` phải nhận/khám phá đủ workspace roots/package roots của DH/OpenKit corpus, áp dụng package aliases/exports trong resolver, persist cross-root edge metadata và hydrate graph projection có thể query qua package boundary ngay phase đầu.

---

## Phân tích hiện trạng chi tiết

> Lưu ý: bảng dưới là code/artifact observation để refine plan, không phải bằng chứng validation command đã chạy.

### Những gì Rust ĐÃ CÓ / đang có khung trong repo

| Capability | Crate/layer | Trạng thái cần xử lý |
|-----------|-------------|----------------------|
| Tree-sitter parse TS/JS/Python/Go/Rust | `dh-parser` | Có trong Rust engine; cần verify với corpus migration |
| Extract symbols | `dh-parser` `extract_symbols()` | Có khung; cần parity gate |
| Extract imports | `dh-parser` `extract_imports()` | Có khung; module resolution/linking cần hoàn thiện |
| Extract call edges/call sites | `dh-parser` | Có khung; cross-file binding cần hoàn thiện |
| Extract references | `dh-parser` | Có khung; cross-file binding cần hoàn thiện |
| Extract chunks | `dh-parser` / indexer flow | Có khung; giữ ngoài graph migration nếu không block |
| Workspace scanning + dirty detection | `dh-indexer` | Có khung; cần tích hợp link pass và report metrics |
| Incremental indexing | `dh-indexer` | Có khung; cần validate freshness/invalidation |
| Graph traversal/query | `dh-graph` + `dh-query` | Dùng làm traversal/query layer, không phải toàn bộ extraction owner |
| SQLite storage | `dh-storage` | Current Rust schema quan sát có `files`, `symbols`, `graph_edges`, `chunks`, `embeddings`; xem schema decision bên dưới |
| Bridge RPC server | `dh-engine` | JSON-RPC stdio có contract bounded; cần dùng tên method thực tế |

### Những gì cần BUILD MỚI

| Feature | Vị trí đề xuất | Mô tả |
|---------|----------------|-------|
| **Module resolver** | `rust-engine/crates/dh-parser/src/module_resolver.rs` | Port `packages/intelligence/src/graph/module-resolver.ts` sang Rust và mở rộng ngay cho cross-root monorepo resolution |
| **Cross-file link pass** | `rust-engine/crates/dh-indexer/src/linker.rs` | Resolve imports → graph edges, bind calls/references cross-file và cross-root sau extract pass |
| **tsconfig/jsconfig parser** | Trong module resolver | Parse config có comments/trailing commas, `extends`, `baseUrl`, `paths` |
| **Workspace/package root discovery** | `dh-indexer` + resolver context | Discover/nhận danh sách workspace roots, package roots, package aliases và package `exports` cần cho cross-root resolution |
| **Rust graph hydration cache** | `dh-indexer`/`dh-graph` boundary | Build in-memory adjacency/symbol maps từ `dh-storage` sau index hoặc lazy-on-first-query |
| **Consumer compatibility adapter** | TS runtime boundary | Tạm giữ API shape cho consumers, nhưng adapter phải gọi Rust, không chạy TS extraction |
| **Feature flag / rollback switch** | Runtime config/env boundary | Flag mới, ví dụ `DH_GRAPH_AST_ENGINE=rust|ts|compat` (tên cần khóa khi implement) |
| **Integration tests + parity fixtures** | `rust-engine/crates/dh-parser/tests/`, `rust-engine/crates/dh-indexer/tests/` | Parity cho resolver/link pass, cross-root fixtures và end-to-end index→query |

### Những gì cần VERIFY (không được assume pass)

| Surface | File/area | Ghi chú |
|---------|-----------|---------|
| Parser trait methods | `dh-parser` | `resolve_imports()`, `bind_call_edges()`, `bind_references()` cần verify implementation depth; nếu no-op/within-file/same-root only thì phải complete cho cross-root scope |
| RPC contract | `rust-engine/crates/dh-engine/src/worker_protocol.rs`, `bridge.rs` | Dùng current names `query.*`; mở rộng và advertise `query.callHierarchy` + `query.entryPoints`; không dùng `dh.query.*` nếu không có contract |
| TS consumers | `packages/runtime`, `packages/retrieval`, `packages/opencode-app`, tests | Consumer audit là gate trước delete |
| Legacy TS storage schema | `packages/storage/src/sqlite/db.ts`, `graph-repo.ts` | Xác định freeze/read-only/drop sequence |

---

## Schema / Source-of-truth Strategy

### Quyết định đề xuất

`dh-storage` là source-of-truth duy nhất cho production graph facts sau cutover. Trong steady state:

- Canonical Rust tables: `files`, `symbols`, `graph_edges` và các bảng phụ trợ hiện có (`chunks`, `embeddings`, index state) trong Rust schema.
- `graph_edges` là canonical edge table cho import/dependency/call/reference relationships, phân biệt bằng `kind`, `from_node_kind`, `to_node_kind`, `resolution`, `confidence`, vị trí line/column và `payload_json` khi cần metadata đặc thù.
- Không tạo duplicate production storage giữa Rust schema và TS legacy `graph_nodes`, `graph_edges`, `graph_symbols`, `graph_calls`, `graph_symbol_references`.
- Nếu benchmark chứng minh generic `graph_edges` không đủ nhanh cho call hierarchy hoặc references, dedicated tables/materialized indexes chỉ được thêm như **derived read model** do Rust tạo, không phải source-of-truth thứ hai.

### Legacy TS tables

- Trong cutover window: legacy TS `graph_*` tables có thể được retain read-only để rollback hoặc parity comparison.
- Sau delete gate: drop hoặc migrate away `GraphRepo` và TS `graph_*` schema references; không để app tiếp tục ghi song song.
- Nếu phải giữ một compatibility adapter cho external API shape, adapter đọc/gọi Rust source-of-truth và không ghi legacy tables.

---

## SQLite vs in-memory Rust graph decision

### Hướng đề xuất: hybrid persistent + hydrated in-memory graph

Yêu cầu “Rust query trong bộ nhớ” nên được hiểu là hot query path chạy trên Rust in-memory projection, không phải loại bỏ SQLite.

- SQLite (`dh-storage`) giữ persistent index/facts để restart, incremental indexing, cache invalidation và auditability.
- Rust hydrate graph projection từ SQLite sau index hoặc lazy-on-first-query: adjacency maps theo file/symbol, symbol-name index, import alias map, call/reference maps.
- Hot query (`dependencies`, `dependents`, `definition`, `usage`, call hierarchy nếu mở contract) đọc từ in-memory graph khi projection current.
- Fallback SQLite chỉ dùng khi graph cold/stale, và response phải báo degraded/cold-start latency nếu có.
- Index/link pass invalidate hoặc refresh projection theo workspace/run id; không để query dùng stale graph mà không có freshness marker.

Trade-off: hybrid giữ rollback/persistence an toàn hơn pure in-memory, đồng thời vẫn đạt mục tiêu không block event loop và không query từng hop bằng TS.

---

## Proposed Changes

### Phase 0: Baseline, flag, corpus và contract freeze (trước khi code migration)

**Goal:** có rollback path và baseline đo được trước khi thay production path.

- Tạo/khóa feature flag cho engine ownership, ví dụ `DH_GRAPH_AST_ENGINE=ts|rust|compat` (tên cuối cần verify trong runtime config style hiện có), chỉ dùng cho migration/rollback checkpoint trước deletion.
- Khóa official acceptance corpus phase đầu là **DH/OpenKit repo hiện tại**; capture baseline trên corpus này: files, symbols, import edges, call edges/call sites, references nếu có, workspace roots/package roots, cross-root imports, index time, query latency, Node event-loop delay.
- Nếu DH/OpenKit corpus không đạt khoảng 3,000 files, benchmark report phải ghi limitation và risk; corpus chính thức vẫn là DH/OpenKit cho phase đầu trừ khi user mở decision mới.
- Freeze RPC contract dùng cho migration: current worker-to-host methods là `query.search`, `query.definition`, `query.relationship`, `query.buildEvidence`, đồng thời thêm required expansion `query.callHierarchy` và `query.entryPoints`.
- Ghi rõ direct/internal handlers không được coi là public contract nếu chưa được advertise trong `worker_protocol.rs`, capability advertisement và TS clients.

### Phase 1: Module Resolver + cross-root monorepo resolution (Tuần 1-2)

Port logic từ `packages/intelligence/src/graph/module-resolver.ts` sang `dh-parser` và mở rộng ngay cho cross-root monorepo resolution giữa workspace/package roots.

#### [NEW] `rust-engine/crates/dh-parser/src/module_resolver.rs`

**Struct & types cần tạo:**

```rust
pub enum ResolutionStatus { Resolved, Unresolved, Ambiguous, External, Unsafe, Degraded }
pub enum ResolutionReason { RelativeTargetFound, AliasTargetFound, AliasConfigMissing, /* ... */ }
pub enum ResolutionKind { Relative, Alias, PackageExport, WorkspacePackage }

pub struct ModuleResolutionResult {
    pub specifier: String,
    pub status: ResolutionStatus,
    pub reason: ResolutionReason,
    pub resolved_abs_path: Option<PathBuf>,
    pub resolution_kind: Option<ResolutionKind>,
    pub config_path: Option<PathBuf>,
    pub source_root: Option<PathBuf>,
    pub target_root: Option<PathBuf>,
}

struct AliasConfig {
    config_path: PathBuf,
    config_dir: PathBuf,
    base_url_abs: Option<PathBuf>,
    paths: HashMap<String, Vec<String>>,
}

struct WorkspaceResolutionContext {
    workspace_roots: Vec<PathBuf>,
    package_roots: Vec<PathBuf>,
    package_aliases: HashMap<String, PathBuf>,
    package_exports: HashMap<String, PackageExports>,
}
```

**Functions cần port:**

1. `resolve_module_specifier()` — entry point: relative vs bare specifier routing, với awareness về source root/package root.
2. `resolve_bare_specifier()` — tsconfig/jsconfig alias resolution.
3. `resolve_local_candidate()` — extension probing (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`) + `index.*` fallback.
4. `find_alias_config()` — walk up directory tree to find `tsconfig.json`/`jsconfig.json`.
5. `load_alias_config()` — parse config, follow `extends` chain (max depth 8), merge paths.
6. `match_alias_pattern()` — wildcard `*` pattern matching.
7. `strip_json_comments()` — remove `//`, `/* */`, trailing commas.
8. `discover_workspace_roots()` hoặc nhận root list từ `dh-indexer` runtime config — xác định workspace roots/package roots cho DH/OpenKit corpus.
9. `load_package_aliases_and_exports()` — đọc alias/package name và `exports` cần thiết để resolve cross-root package imports.
10. `resolve_package_export_candidate()` — map bare package specifier/subpath sang file thật trong package root khi package alias/exports tồn tại.

**Key decisions:**

- Dùng `std::path` và bounded filesystem metadata checks thay cho Node.js `path`/`fs.existsSync()`.
- Cache parsed tsconfig/jsconfig per directory/workspace trong Rust để tránh re-parse.
- Cross-root monorepo resolution là acceptance requirement phase đầu: resolver phải hỗ trợ nhiều `workspace_roots`, package aliases và package `exports` khi repo/corpus khai báo chúng.
- Unresolved cross-root import không được coi là unsupported scope mặc định; phải có `ResolutionReason` rõ (`PackageExportMissing`, `AliasConfigMissing`, `TargetOutsideAllowedRoots`, `AmbiguousCrossRootCandidate`, v.v.) và xuất hiện trong parity/performance report.

#### [MODIFY] `rust-engine/crates/dh-parser/src/lib.rs`

- Thêm `pub mod module_resolver;`.
- Update extraction context để resolver biết `workspace_root`, `workspace_roots`, `package_roots`, alias/export metadata và root boundary nếu chưa có.

#### [MODIFY] `rust-engine/crates/dh-parser/src/adapters/typescript.rs`

- Implement `resolve_imports()` bằng module resolver Rust.
- Không dùng TS resolver trong production path sau flag cutover.

---

### Phase 2: Cross-root Cross-file Link Pass (Tuần 2-3)

#### [NEW] `rust-engine/crates/dh-indexer/src/linker.rs`

Sau khi `index_workspace()` extract xong tất cả facts trên toàn bộ DH/OpenKit workspace roots/package roots, chạy link pass để resolve cross-file và cross-root relationships.

**Logic:**

```text
link_workspace(db, workspace_id):
  1. Load imports / import-like graph facts có resolved_path, source_root/target_root hoặc resolver metadata
  2. For each resolved import:
     a. Lookup target file_id from resolved_path
     b. Insert/update graph_edges(source_file_id -> target_file_id, kind=Import/Dependency)
     c. Bind imported symbol names to exported symbols where possible
  3. Load unresolved call/reference facts
  4. Bind local symbols first, then imported symbols, then mark unresolved/external/ambiguous
  5. Persist resolution/confidence/reason atomically in Rust storage
  6. Refresh/invalidate in-memory graph projection for all impacted roots in the workspace
```

**Key decisions:**

- Link pass runs **after** all files across workspace roots are extracted để có complete symbol table.
- Link pass idempotent — re-run không duplicate edges.
- Dùng SQLite transaction cho atomic commit.
- Edge semantics nằm trong Rust `graph_edges`; không ghi song song legacy TS graph tables.
- Cross-root edges là first-class graph edges với metadata root/source package/target package; query `dependencies`, `dependents`, `callHierarchy`, `entryPoints` phải nhìn thấy edge hợp lệ qua package boundary.

#### [MODIFY] `rust-engine/crates/dh-indexer/src/lib.rs`

- Thêm `pub mod linker;`.
- Gọi `linker::link_workspace()` cuối index flow.
- Update report fields: `linked_imports`, `linked_cross_root_imports`, `linked_calls`, `linked_cross_root_calls`, `linked_references`, `unresolved_imports`, `unresolved_cross_root_imports`, `unresolved_calls`, `unresolved_references`, `workspace_root_count`, `package_root_count`, `graph_hydration_ms`.

---

### Phase 3: RPC Contract Expansion & Verification (Tuần 3-4)

#### Current RPC names đã verify trong repo

Current bounded worker-to-host query contract trong `rust-engine/crates/dh-engine/src/worker_protocol.rs` và TS bridge clients dùng:

- `query.search`
- `query.definition`
- `query.relationship` với `relation`: `usage`, `dependencies`, `dependents`
- `query.buildEvidence`

User đã khóa requirement mở rộng worker/client protocol ngay trong migration này:

- `query.callHierarchy`
- `query.entryPoints`

Lifecycle/bridge methods liên quan:

- `dh.initialize`
- `dh.initialized`
- `dh.ready`
- `runtime.ping`
- `session.runCommand`
- `dh.shutdown`

Không khóa các tên cũ/sai như `dh.query.findSymbol`, `dh.query.findReferences`, `dh.query.findDependencies`, `dh.query.findDependents`, `dh.query.gotoDefinition` vì không thấy đây là current advertised contract trong repo.

#### Mapping dùng cho migration

| Use case | Current RPC path |
|----------|------------------|
| File/symbol discovery | `query.search` |
| Definition/goto definition | `query.definition` |
| References/usages | `query.relationship` + `relation: "usage"` |
| File dependencies/imports | `query.relationship` + `relation: "dependencies"` |
| File dependents | `query.relationship` + `relation: "dependents"` |
| Evidence-backed broad answer | `query.buildEvidence` |
| Call hierarchy | `query.callHierarchy` |
| Entry point discovery | `query.entryPoints` |

#### Contract decision đã khóa

`bridge.rs` có thêm direct handlers như `query.callHierarchy`, `query.entryPoints`, `query.traceFlow`, `query.impactAnalysis`, `query.semanticSearch`, nhưng current worker protocol first-wave không advertise/allow một số method đó qua `route_worker_query()`; test hiện còn assert `query.callHierarchy` không thuộc worker-to-host methods. Quyết định đã khóa: migration này phải mở rộng worker/client protocol cho `query.callHierarchy` và `query.entryPoints` trước khi consumer migration phụ thuộc vào chúng.

**Required updates trước delete gate:**

- `worker_protocol.rs` advertise/allow `query.callHierarchy` và `query.entryPoints` trong worker-to-host methods.
- TS bridge/client capability advertisement expose hai capability này với trạng thái thật (`available` hoặc degraded/unavailable nếu Rust chưa sẵn sàng).
- `route_worker_query()` route hai method này qua Rust engine, không qua TS graph traversal.
- Tests hiện tại phải đổi từ “not advertised” sang positive coverage cho `callHierarchy`/`entryPoints` request/response, capability advertisement và error shape khi method unsupported by language.
- `traceFlow`, `impactAnalysis`, `semanticSearch` vẫn ngoài scope migration này trừ khi user approve decision mới.

---

### Phase 4: Consumer Migration Plan (Tuần 3-5)

Không được xóa TS graph code cho tới khi các consumers sau được audit và chuyển:

| Consumer/surface | Trạng thái quan sát | Migration action |
|------------------|---------------------|------------------|
| `packages/runtime/src/jobs/index-job-runner.ts` | Production job import `extractCallEdges`, `extractCallSites`, `extractImportEdges` từ TS graph | Chuyển sang Rust indexer/bridge report hoặc compatibility adapter gọi Rust; `IndexJobResult` fields lấy từ Rust report |
| `packages/retrieval/src/query/run-retrieval.ts` | Import `extractImportEdges` | Chuyển sang `query.relationship`/Rust dependency query hoặc adapter gọi Rust |
| `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` | Đã dùng `query.search`, `query.definition`, `query.relationship`, `query.buildEvidence`; cần mở rộng `callHierarchy`/`entryPoints` | Giữ/align current contract và thêm advertised `query.callHierarchy` + `query.entryPoints` capability/test trước delete gate |
| `packages/opencode-app/src/worker/host-bridge-client.ts` | Host-backed bridge supported methods tương ứng current contract | Thêm host-backed support cho `query.callHierarchy` + `query.entryPoints`; không thêm method khác chưa advertise |
| `packages/intelligence/src/graph/*.test.ts` | Legacy/parity tests import TS extractors/indexer | Port thành Rust parity fixtures hoặc delete cùng TS code sau gates |
| `packages/storage/src/sqlite/repositories/graph-repo.ts` và tests | Legacy TS graph storage | Freeze writes, retain read-only only through pre-deletion rollback checkpoint, then delete after QA pass/delete gate |
| `packages/storage/src/sqlite/db.ts` graph table schema | Tạo legacy `graph_nodes`, `graph_edges`, `graph_symbols`, `graph_calls`, `graph_symbol_references` | Mark legacy; remove/drop after QA pass/delete gate unless DB migration safety requires a documented read-only tombstone migration |

Consumer audit phải chạy lại trước Phase 6 bằng code search/import graph. Kết quả “chỉ còn tests” mới cho phép delete production TS graph code. Nếu sau deletion phát hiện consumer gap, xử lý fix-forward bằng Rust/adapter thay vì khôi phục compatibility window dài.

---

### Phase 5: Test Parity & Benchmarks (Tuần 4-5)

#### [NEW] Module resolver tests

`rust-engine/crates/dh-parser/tests/module_resolver_test.rs`

- Parity target: `packages/intelligence/src/graph/module-resolver.test.ts`.
- Cover relative paths, alias paths, `baseUrl`, `extends`, missing config, external packages, ambiguous/unsafe paths.
- Cross-root acceptance fixtures: workspace roots, package aliases, package `exports`, package subpath imports, same-name ambiguous packages, root boundary escape attempts.

#### [NEW] Link pass integration tests

`rust-engine/crates/dh-indexer/tests/linker_test.rs`

- Parity target: `packages/intelligence/src/graph/graph-indexer.test.ts` và call/import extractor tests.
- Cover index → extract → link → storage → query.
- Cover cross-root import/dependency edges, imported symbol binding across package roots, cross-root call/reference binding where supported, and unresolved cross-root triage reasons.

#### [NEW/MODIFY] RPC protocol tests

`rust-engine/crates/dh-engine/tests/` và TS bridge/client tests tương ứng

- Positive tests cho advertised `query.callHierarchy` và `query.entryPoints` trong worker protocol.
- Capability advertisement tests chứng minh TS clients nhìn thấy hai capability này trước delete gate.
- Error-shape tests cho unsupported language/query scope không được fallback sang TS graph traversal.

#### [NEW] Full parity benchmark

Add benchmark/report surface trong Rust engine hoặc existing benchmark module:

```rust
BenchmarkClass::GraphLinkPass => {
    // 1. Index workspace (extract + link)
    // 2. Hydrate in-memory graph
    // 3. Measure facts, latency, memory, payload, event-loop proxy metrics
}
```

Official corpus phase đầu là **DH/OpenKit repo hiện tại**. Benchmark report phải ghi `files`, `workspace_root_count`, `package_root_count`, `symbols`, `imports`, `cross_root_imports`, `call_edges/call_sites`, `references`, `unresolved_*`, latency/memory/payload/event-loop metrics. Nếu file count của DH/OpenKit thấp hơn ngưỡng lớn đề xuất, report limitation nhưng không thay corpus chính thức.

---

### Phase 6: Rollback checkpoint, QA pass & immediate TS deletion (Tuần 5-6)

#### Rollback/feature flag checkpoint

- Default first cutover: `rust`; `compat`/`ts` chỉ được dùng nếu cần cho migration checkpoint trước QA pass/delete gate.
- Rollback path: switch flag về `ts` hoặc `compat` **trước khi** TS code deletion để rehearse recovery. Sau QA pass và deletion, không giữ runtime flag fallback; rollback là revert commit/branch hoặc fix-forward.
- Compatibility checkpoint phải chứng minh:
  - production consumers không import TS graph extractors trực tiếp;
  - Rust path trả đủ report fields cho runtime/retrieval;
  - legacy tables không còn production writes;
  - operator-facing answers dùng expanded RPC contract có `query.callHierarchy` và `query.entryPoints` advertised đúng;
  - event-loop blocking gate pass.
- Sau QA pass: delete TS graph code ngay theo user decision; không giữ compatibility window dài qua release/QA cycle kế tiếp.

#### [DELETE candidate] TS Graph Directory

Xóa `packages/intelligence/src/graph/` ngay sau QA pass + regression gate. Nếu lỗi phát sinh sau deletion, sửa Rust resolver/linker/RPC adapter hoặc revert commit có chủ đích; không tái lập TS production extraction fallback.

#### [DELETE candidate] TS GraphRepo

Xóa `packages/storage/src/sqlite/repositories/graph-repo.ts` và tests ngay sau QA pass + regression gate khi legacy graph tables không còn production consumer/write dependency.

#### [SCHEMA cleanup candidate]

Xóa/drop legacy graph table creation trong `packages/storage/src/sqlite/db.ts` trong cùng cleanup sau QA pass nếu DB migration path an toàn. Nếu cần giữ DB backward compatibility tạm thời, document tables là legacy/read-only/tombstoned và không còn writes; không được giữ `GraphRepo` hoặc TS extraction fallback vì lý do rollback window dài.

---

## Performance Acceptance Gates

Các gate này cần before/after evidence; plan refinement này không claim đã chạy.

| Metric | Benchmark requirement | Acceptance target đề xuất |
|--------|-----------------------|----------------------------|
| Corpus size | Official corpus phase đầu là DH/OpenKit repo hiện tại; ghi limitation nếu `< 3,000` files nhưng không đổi corpus chính thức | Report `files`, `workspace_root_count`, `package_root_count`, `symbols`, `imports`, `cross_root_imports`, `call_edges/call_sites`, `references`, `unresolved_*` |
| Cross-root resolution | Measure resolver/linker trên DH/OpenKit workspace roots/package roots | Cross-root imports/dependencies trong corpus được resolve hoặc triage 100%; không có untriaged cross-root miss trước deletion |
| Full index+link time | Measure TS baseline vs Rust extract+cross-root link+hydrate | Rust ≤ 80% TS baseline time hoặc user-approved threshold; không được chậm hơn baseline nếu mục tiêu là giảm blocking |
| Incremental index time | 1 file changed, 10 files changed, config/package alias/export changed | 1-file p95 ≤ 500ms; 10-file p95 ≤ 2s; config/root/package-export invalidation report rõ scope |
| Query latency hydrated | `query.definition`, `query.relationship usage/dependencies/dependents`, `query.callHierarchy`, `query.entryPoints`, search | p50 ≤ 50ms, p95 ≤ 200ms cho bounded default limit |
| Broad evidence latency | `query.buildEvidence` bounded default budget | p50 ≤ 300ms, p95 ≤ 1,000ms hoặc record bottleneck/payload reason |
| In-memory graph hydrate | Sau index hoặc cold start | Hydrate p95 ≤ 2s cho 3k-file corpus; stale/cold status visible nếu vượt |
| Memory peak | Rust engine during index+hydrate | Peak RSS ≤ TS baseline +25% hoặc ≤ user-approved absolute cap; record graph node/edge counts |
| JSON-RPC payload | Default bounded query responses | p95 payload ≤ 256KB, max default response ≤ 1MB; nếu vượt, escalate Feature 01-2 decision |
| Node event-loop blocking | Measure Node event-loop delay while indexing/querying via TS wrapper | p95 delay ≤ 20ms, max ≤ 100ms; no synchronous TS AST/graph traversal in production path |
| Parity facts | Compare normalized TS baseline vs Rust trên DH/OpenKit corpus | Symbols ≥ 99%; imports/dependencies gồm cross-root scope ≥ 99%; calls/references ≥ 95% with all misses triaged; critical acceptance fixtures 100% pass |

Nếu DH/OpenKit corpus không đạt size tối thiểu, benchmark report phải ghi limitation/risk và user-visible caveat, nhưng corpus chính thức phase đầu không đổi. Delete TS code vẫn có thể đi tiếp sau QA pass nếu các gates còn lại đạt hoặc có user-approved exception rõ.

---

## Regression Gate trước khi xóa TS code

Trước Phase 6 deletion:

- [ ] Consumer audit mới xác nhận không còn production imports tới `packages/intelligence/src/graph/*` hoặc `GraphRepo` writes.
- [ ] Expanded RPC contract names được verify: `query.search`, `query.definition`, `query.relationship`, `query.buildEvidence`, `query.callHierarchy`, `query.entryPoints`; TS clients không gọi method chưa advertise.
- [ ] `query.callHierarchy` và `query.entryPoints` đã có worker/client protocol routing, capability advertisement và tests pass trước deletion.
- [ ] Feature flag/rollback path đã được test trước deletion như checkpoint; sau QA pass không giữ TS runtime fallback/window dài.
- [ ] Rust storage là source-of-truth; legacy TS graph tables không còn production writes.
- [ ] Performance gates đạt hoặc có user-approved exception rõ.
- [ ] DH/OpenKit repo hiện tại đã được dùng làm official acceptance corpus phase đầu; nếu `< 3,000` files, limitation đã được ghi trong report.
- [ ] Cross-root monorepo resolution gate đạt: workspace roots/package roots, package aliases/exports, cross-root imports/dependencies được resolve hoặc triage 100%, không có untriaged cross-root miss.
- [ ] Parity report đạt thresholds:
  - `symbol_coverage = matched_symbols / normalized_baseline_symbols ≥ 99%`.
  - `import_coverage = matched_supported_import_edges / normalized_supported_baseline_import_edges ≥ 99%`, gồm supported cross-root imports/dependencies trong DH/OpenKit corpus.
  - `call_reference_coverage = matched_supported_call_or_reference_edges / normalized_supported_baseline_call_or_reference_edges ≥ 95%`, với mọi gap được phân loại `baseline_missing`, `unsupported_scope`, `rust_bug`, hoặc `accepted_semantic_delta`.
  - Critical fixture queries 100% pass; không có `rust_bug` severity blocking.
- [ ] `Rust ≥95% coverage` không được hiểu là “5% traffic vẫn dùng TS”. Production traffic phải chạy Rust; coverage chỉ đo parity.
- [ ] Event-loop blocking gate pass: no production TS AST traversal, Node p95 delay ≤ 20ms trong benchmark.
- [ ] QA pass đã đạt; ngay sau đó delete TS graph code/GraphRepo theo quyết định user. Lỗi sau deletion xử lý fix-forward hoặc revert có chủ đích, không duy trì compatibility window dài.

---

## Tóm tắt thay đổi

### Rust (New & Modified)

| Action | File/area | Effort |
|--------|-----------|--------|
| **NEW** | `rust-engine/crates/dh-parser/src/module_resolver.rs` | ~400 LOC |
| **NEW** | `rust-engine/crates/dh-indexer/src/linker.rs` | ~350 LOC |
| **NEW/MODIFY** | in-memory graph hydration boundary in `dh-indexer`/`dh-graph` | TBD by design |
| **NEW** | `rust-engine/crates/dh-parser/tests/module_resolver_test.rs` | ~150 LOC |
| **NEW** | `rust-engine/crates/dh-indexer/tests/linker_test.rs` | ~200 LOC |
| **NEW/MODIFY** | cross-root resolver/linker fixtures for workspace roots, package aliases/exports | required |
| **MODIFY** | `rust-engine/crates/dh-parser/src/lib.rs` | small |
| **MODIFY** | `rust-engine/crates/dh-parser/src/adapters/typescript.rs` | medium |
| **MODIFY** | `rust-engine/crates/dh-indexer/src/lib.rs` | medium |
| **MODIFY** | `rust-engine/crates/dh-engine/src/worker_protocol.rs`, `bridge.rs` | add `query.callHierarchy` + `query.entryPoints` |

### TypeScript (Migration then deletion candidates)

| Action | File/area | Condition |
|--------|-----------|-----------|
| **MODIFY** | `packages/runtime/src/jobs/index-job-runner.ts` | Move production graph extraction to Rust path |
| **MODIFY** | `packages/retrieval/src/query/run-retrieval.ts` | Remove direct TS import-edge extraction |
| **MODIFY** | `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` | Keep current RPC names/capabilities aligned and advertise `callHierarchy`/`entryPoints` |
| **MODIFY** | `packages/opencode-app/src/worker/host-bridge-client.ts` | Add host-backed `query.callHierarchy` + `query.entryPoints` only after protocol advertises them |
| **DELETE candidate** | `packages/intelligence/src/graph/` | Immediately after QA pass + consumer/parity/performance/regression gates |
| **DELETE candidate** | `packages/storage/src/sqlite/repositories/graph-repo.ts` | Immediately after QA pass when no production writes/read dependency remains |
| **CLEANUP candidate** | `packages/storage/src/sqlite/db.ts` legacy graph tables | Same cleanup after QA pass if DB migration safe; otherwise legacy/read-only/tombstone only |

---

## Verification Plan

> Đây là validation plan cho implementation sau này. Artifact refinement này không claim đã chạy app build/lint/test hoặc cargo tests.

### Automated validation cần capture khi implement

Chạy từ `rust-engine/` nếu Cargo workspace vẫn đúng:

```bash
# Phase 1: Module resolver unit tests
cargo test -p dh-parser -- module_resolver

# Phase 2: Link pass integration tests
cargo test -p dh-indexer -- linker

# Phase 3: Full pipeline (index → link → query)
cargo test -p dh-indexer -- integration

# Phase 3: RPC protocol expansion
cargo test -p dh-engine -- call_hierarchy
cargo test -p dh-engine -- entry_points

# Graph/query crates impacted by traversal/query
cargo test -p dh-graph
cargo test -p dh-query
cargo test -p dh-engine -- bridge
```

Nếu JS/TS package test command tại thời điểm implement chưa được project config xác nhận là repo-native command, không được bịa `npm test` pass; thay vào đó ghi validation path unavailable hoặc cite đúng command đã được thêm/xác minh.

### Manual / benchmark verification

1. **Baseline capture**: trước migration, đo TS path trên benchmark corpus: files, symbols, imports, calls/call-sites, references, index time, query latency, event-loop delay.
2. **Rust parity report**: sau Rust extract+link+hydrate, so sánh normalized facts theo coverage definitions trong regression gate.
3. **RPC E2E**: gọi current methods `query.search`, `query.definition`, `query.relationship`, `query.buildEvidence` và expanded methods `query.callHierarchy`, `query.entryPoints`; không dùng `dh.query.*` names.
4. **Capability advertisement check**: TS bridge/client và worker protocol advertise `callHierarchy`/`entryPoints` đúng capability state trước delete gate.
5. **Consumer smoke**: runtime index job và retrieval query chạy qua Rust path/adapter, không import TS graph extractors.
6. **Rollback rehearsal**: trước deletion, switch flag về TS/compat và xác nhận rollback path còn hoạt động; sau QA pass/deletion, ghi rõ không còn runtime fallback window dài, lỗi xử lý fix-forward hoặc revert có chủ đích.
7. **Cross-root resolver/linker check**: trên DH/OpenKit corpus, ghi workspace roots/package roots, package aliases/exports được hỗ trợ, cross-root imports/dependencies resolved/triaged, không có untriaged miss.
8. **Event-loop check**: đo Node event-loop delay khi TS wrapper gọi Rust indexing/query; p95/max theo performance gates.
9. **Payload check**: log JSON-RPC payload p50/p95/max cho default query budgets; nếu vượt gate, mở decision cho Feature 01-2.

### Delete gate summary

Chỉ delete TS graph code khi: production ownership đã 100% Rust, DH/OpenKit corpus baseline/parity/performance report có limitation nếu cần, cross-root resolution gate không còn untriaged miss, `callHierarchy`/`entryPoints` đã được protocol-advertised và test, consumer audit sạch, parity/performance gates đạt hoặc được user approve exception, rollback checkpoint trước deletion hoàn tất, QA pass đạt, và schema source-of-truth không còn duplicate production writes. Sau QA pass/delete gate, delete ngay; lỗi sau đó xử lý fix-forward hoặc revert có chủ đích, không duy trì TS graph compatibility window dài.
