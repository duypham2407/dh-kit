# Plan: Full Migration — 100% Graph Indexing xuống Rust (Option B)

Chuyển dịch hoàn toàn logic Graph & AST extraction từ TypeScript (`packages/intelligence/src/graph/`) xuống Rust engine, loại bỏ event loop blocking và duplicate storage.

## User Review Required

> [!IMPORTANT]
> **Breaking change**: Sau khi hoàn thành, toàn bộ 15 files trong `packages/intelligence/src/graph/` sẽ bị xóa. Mọi consumer (nếu có thêm) phải chuyển sang gọi Rust RPC.

> [!IMPORTANT]
> **Phụ thuộc Feature 01-2**: Nếu dataset lớn (>10k symbols), JSON-RPC serialization có thể trở thành bottleneck mới. Nên đánh giá xem có cần làm song song Feature 01-2 (MessagePack) hay không.

## Open Questions

> [!IMPORTANT]
> 1. **Cross-file resolution scope**: Hiện tại TS `graph-indexer.ts` chỉ resolve imports trong cùng một project (workspace boundary). Rust `dh-indexer` đã có multi-root support — có cần cross-root import resolution (VD: monorepo packages import lẫn nhau)?
> 2. **GraphRepo tables**: TS sử dụng bộ tables riêng (`graph_nodes`, `graph_edges`, `graph_symbols`, `graph_calls`, `graph_symbol_references`). Rust dùng bộ tables khác (`files`, `symbols`, `imports`, `call_edges`, `references`, `graph_edges`). Sau migration, có nên drop bộ TS tables hay giữ lại cho backward compat?
> 3. **Performance baseline**: Bạn có project benchmark cụ thể nào (>3000 files) để đo before/after không?

---

## Phân tích hiện trạng chi tiết

### Những gì Rust ĐÃ CÓ (không cần làm lại)

| Capability | Crate | Trạng thái | LOC |
|-----------|-------|------------|-----|
| Tree-sitter parse TS/JS/Python/Go/Rust | `dh-parser` | ✅ Production | ~2084 (TS adapter) |
| Extract symbols (class, function, method, etc.) | `dh-parser` `extract_symbols()` | ✅ Production | In adapter |
| Extract imports (import/require/dynamic) | `dh-parser` `extract_imports()` | ✅ Production | In adapter |
| Extract call edges (call_expression, new_expression) | `dh-parser` `extract_call_edges()` | ✅ Production | In adapter |
| Extract references (identifier tracking) | `dh-parser` `extract_references()` | ✅ Production | In adapter |
| Extract chunks (file header + symbol chunks) | `dh-parser` `extract_chunks()` | ✅ Production | In adapter |
| Workspace scanning + dirty detection | `dh-indexer` `scanner` + `dirty` | ✅ Production | ~800 |
| Incremental indexing (content hash) | `dh-indexer` `index_workspace()` | ✅ Production | ~2108 |
| Graph traversal (BFS, shortest path, callers/callees) | `dh-graph` | ✅ Production | ~734 |
| SQLite storage (files, symbols, chunks, edges, etc.) | `dh-storage` | ✅ Production | ~2000+ |
| Bridge RPC server (JSON-RPC 2.0 stdio) | `dh-engine` `bridge.rs` | ✅ Production | ~2996 |
| Progress reporting (indicatif) | `dh-indexer` | ✅ Production | Integrated |

### Những gì cần BUILD MỚI

| Feature | Vị trí | Ước tính LOC | Mô tả |
|---------|--------|-------------|-------|
| **Module resolver** | `dh-parser/src/module_resolver.rs` (NEW) | ~400 | Port `module-resolver.ts` (277 LOC TS → Rust) |
| **Cross-file link pass** | `dh-indexer/src/linker.rs` (NEW) | ~350 | Sau extract pass: resolve import targets → update edges, bind call edges cross-file |
| **tsconfig.json parser** | Part of module resolver | ~120 | Parse tsconfig/jsconfig with extends chain, strip JSON comments |
| **Integration tests** | `dh-indexer/tests/` + `dh-parser/tests/` | ~300 | Parity tests cho module resolver + link pass |
| **TS code deletion** | `packages/intelligence/src/graph/` | -15 files | Xóa toàn bộ graph directory |
| **TS storage cleanup** | `packages/storage/src/sqlite/repositories/graph-repo.ts` | -1 file | Xóa GraphRepo class |

### Những gì cần VERIFY (không cần viết code mới)

| Feature | Crate | Ghi chú |
|---------|-------|---------|
| `resolve_imports()` trait method | `dh-parser` | Đã có signature, hiện return `Vec::new()` (no-op) — cần implement |
| `bind_call_edges()` trait method | `dh-parser` | Đã có signature, hiện bind within single file only |
| `bind_references()` trait method | `dh-parser` | Đã có signature, hiện bind within single file only |

---

## Proposed Changes

### Phase 1: Module Resolver (Tuần 1-2)

Port logic từ `packages/intelligence/src/graph/module-resolver.ts`.

#### [NEW] `dh-parser/src/module_resolver.rs`

**Struct & types cần tạo:**
```rust
pub enum ResolutionStatus { Resolved, Unresolved, Ambiguous, External, Unsafe, Degraded }
pub enum ResolutionReason { RelativeTargetFound, AliasTargetFound, AliasConfigMissing, ... }
pub enum ResolutionKind { Relative, Alias }

pub struct ModuleResolutionResult {
    pub specifier: String,
    pub status: ResolutionStatus,
    pub reason: ResolutionReason,
    pub resolved_abs_path: Option<PathBuf>,
    pub resolution_kind: Option<ResolutionKind>,
    pub config_path: Option<PathBuf>,
}

struct AliasConfig {
    config_path: PathBuf,
    config_dir: PathBuf,
    base_url_abs: Option<PathBuf>,
    paths: HashMap<String, Vec<String>>,
}
```

**Functions cần port:**
1. `resolve_module_specifier()` — Entry point: relative vs bare specifier routing
2. `resolve_bare_specifier()` — tsconfig/jsconfig alias resolution
3. `resolve_local_candidate()` — Extension probing (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`) + `index.*` fallback
4. `find_alias_config()` — Walk up directory tree to find tsconfig.json/jsconfig.json
5. `load_alias_config()` — Parse config, follow `extends` chain (max depth 8), merge paths
6. `match_alias_pattern()` — Wildcard `*` pattern matching
7. `strip_json_comments()` — Remove `//` and `/* */` comments + trailing commas from JSON

**Key decisions:**
- Dùng `std::path` thay cho Node.js `path` module
- Dùng `std::fs::metadata()` thay cho `fs.existsSync()` (faster, no allocation)
- Cache parsed tsconfig per directory trong `HashMap<PathBuf, AliasConfig>` để tránh re-parse
- Workspace boundary check dùng `Path::starts_with()`

#### [MODIFY] `dh-parser/src/lib.rs`
- Thêm `pub mod module_resolver;`
- Update `ExtractionContext` struct thêm `workspace_root: &Path` field (nếu chưa có) để module resolver biết workspace boundary

#### [MODIFY] `dh-parser/src/adapters/typescript.rs`
Implement `resolve_imports()` sử dụng module resolver mới:
```rust
fn resolve_imports(
    &self,
    ctx: &ExtractionContext<'_>,
    imports: &mut [Import],
    symbols: &[Symbol],
) -> Vec<UnresolvedImport> {
    let mut unresolved = Vec::new();
    for import in imports.iter_mut() {
        let result = module_resolver::resolve_module_specifier(
            &import.raw_specifier,
            &ctx.abs_path,  // containing file
            Some(ctx.workspace_root),
        );
        match result.status {
            ResolutionStatus::Resolved => {
                import.resolved_path = result.resolved_abs_path;
            }
            _ => {
                unresolved.push(UnresolvedImport { /* ... */ });
            }
        }
    }
    unresolved
}
```

---

### Phase 2: Cross-file Link Pass (Tuần 2-3)

#### [NEW] `dh-indexer/src/linker.rs`

Sau khi `index_workspace()` extract xong tất cả facts, chạy link pass để resolve cross-file relationships.

**Logic:**
```
link_workspace(db, workspace_id):
  1. Load ALL imports with resolved_path != NULL
  2. For each resolved import:
     a. Lookup target file_id from resolved_path
     b. If found → insert GraphEdge(source_file_id → target_file_id, kind=Import)
     c. For each imported symbol name:
        - Lookup exported symbol in target file → get target_symbol_id
        - Update import.resolved_symbol_id = target_symbol_id
  3. Load ALL call_edges with resolved = false
  4. For each unresolved call:
     a. If callee_qualified_name matches a local symbol → bind locally
     b. If callee_qualified_name matches an imported name → follow import chain → bind cross-file
     c. Update call_edge.callee_symbol_id, call_edge.resolved = true
  5. Load ALL references with resolved = false
  6. For each unresolved reference:
     a. Same resolution logic as call edges
     b. Update reference.target_symbol_id, reference.resolved = true
```

**Key decisions:**
- Link pass runs **after** ALL files are extracted (not per-file) để có complete symbol table
- Dùng `HashMap<String, Vec<(i64, i64)>>` (symbol_name → [(file_id, symbol_id)]) cho fast lookup
- Link pass là **idempotent** — có thể re-run mà không duplicate edges
- Dùng SQLite transaction cho atomic commit

#### [MODIFY] `dh-indexer/src/lib.rs`
- Thêm `pub mod linker;`
- Gọi `linker::link_workspace()` cuối `index_workspace()`, sau extract loop
- Update `IndexReport` thêm fields: `linked_imports`, `linked_calls`, `linked_references`

---

### Phase 3: Bridge RPC Verification (Tuần 3-4)

#### [VERIFY] `dh-engine/src/bridge.rs`
**Existing RPC methods đã hoạt động — cần verify với linked data:**
- `dh.query.findSymbol` ✅
- `dh.query.findReferences` ✅
- `dh.query.findDependencies` ✅ (sử dụng graph_edges)
- `dh.query.findDependents` ✅ (sử dụng graph_edges)
- `dh.query.callHierarchy` ✅ (sử dụng call_edges resolved)
- `dh.query.gotoDefinition` ✅
- `dh.query.entryPoints` ✅
- `dh.query.buildEvidence` ✅

Không cần thêm RPC method mới. Verify bằng integration test: index → link → query → check response.

---

### Phase 4: Test Parity & Benchmarks (Tuần 4-5)

#### [NEW] Module resolver tests
`rust-engine/crates/dh-parser/tests/module_resolver_test.rs` (~150 LOC)
- Parity target: `module-resolver.test.ts` (~15 test cases)

#### [NEW] Link pass integration tests
`rust-engine/crates/dh-indexer/tests/linker_test.rs` (~200 LOC)
- Parity target: `graph-indexer.test.ts`

#### [NEW] Full parity benchmark
Add benchmark case trong `dh-engine/src/benchmark.rs`:
```rust
BenchmarkClass::GraphLinkPass => {
    // 1. Index workspace (extract only)
    // 2. Run link pass
    // 3. Measure: linked imports, calls, references
}
```

---

### Phase 5: TS Code Deprecation & Deletion (Tuần 5-6)

#### [DELETE] TS Graph Directory — 15 files
Xóa toàn bộ folder `packages/intelligence/src/graph/` (15 files, ~70KB).

#### [DELETE] TS GraphRepo — 2 files
Xóa `packages/storage/src/sqlite/repositories/graph-repo.ts` và test file tương ứng.

#### Consumers
Search result cho `GraphIndexer` import xác nhận **zero external consumers** — chỉ có internal tests import nó. Không cần sửa consumer nào khác.

---

## Tóm tắt thay đổi

### Rust (New & Modified)
| Action | File | Effort |
|--------|------|--------|
| **NEW** | `dh-parser/src/module_resolver.rs` | ~400 LOC |
| **NEW** | `dh-indexer/src/linker.rs` | ~350 LOC |
| **NEW** | `dh-parser/tests/module_resolver_test.rs` | ~150 LOC |
| **NEW** | `dh-indexer/tests/linker_test.rs` | ~200 LOC |
| **MODIFY** | `dh-parser/src/lib.rs` | +5 LOC |
| **MODIFY** | `dh-parser/src/adapters/typescript.rs` | +30 LOC |
| **MODIFY** | `dh-indexer/src/lib.rs` | +15 LOC |
| **MODIFY** | `dh-engine/src/benchmark.rs` | +30 LOC |

**Total new Rust: ~1,180 LOC**

### TypeScript (Deleted)
| Action | Count | Bytes removed |
|--------|-------|---------------|
| **DELETE** | 15 files `graph/` | ~70,343 bytes |
| **DELETE** | 2 files `graph-repo` | ~14,718 bytes |

**Total TS removed: 17 files, ~85 KB**

---

## Verification Plan

### Automated Tests
```bash
# Phase 1: Module resolver unit tests
cargo test -p dh-parser -- module_resolver

# Phase 2: Link pass integration tests  
cargo test -p dh-indexer -- linker

# Phase 3: Full pipeline (index → link → query)
cargo test -p dh-indexer -- integration_test

# Phase 4: Existing graph query tests
cargo test -p dh-graph
cargo test -p dh-query
```

### Manual Verification
1. **Parity check**: Chạy `dh-engine index --workspace .` trên DH project, so sánh:
   - Symbol count (Rust) ≈ Symbol count (TS GraphRepo)
   - Import edge count (Rust) ≈ Import edge count (TS GraphRepo)
   - Call edge count (Rust) ≈ Call edge count (TS GraphRepo)
2. **Performance benchmark**: Đo thời gian index trên project >3000 files.
3. **End-to-end**: Sau khi xóa TS code, chạy `dh ask "who calls handleRequest"` và verify answer có evidence từ Rust graph.

### Regression Gate
Trước khi delete TS code (Phase 5):
- [ ] Tất cả `cargo test` pass
- [ ] Parity report: Rust ≥ 95% coverage so với TS
- [ ] `dh doctor` reports healthy
- [ ] `dh index --workspace .` completes without errors
- [ ] `dh ask` / `dh explain` / `dh trace` return evidence-backed answers
