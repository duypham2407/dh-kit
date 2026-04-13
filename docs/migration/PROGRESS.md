# Rust Engine Migration — Progress Tracker

**Branch:** `migration/rust-engine-phase1`  
**Last updated:** 2026-04-13  
**Current phase:** Phase 1 — Slice 2 (dh-parser TS/JS adapter)

---

## Phase 1 Slices

### Slice 1: Scaffold + Storage ✅ DONE
- [x] Cargo workspace with 7 crates
- [x] `dh-types`: Full domain types (File, Symbol, Import, CallEdge, Reference, Chunk, IndexState, ExportFact, etc.)
- [x] `dh-storage`: SQLite schema init, PRAGMA defaults, all repository traits + impls, FTS5, 5 unit tests passing
- [x] `dh-engine`: Minimal CLI (init/status commands), smoke tested
- [x] `dh-parser`: LanguageAdapter trait defined (stub)
- [x] `dh-indexer`: Request/response types defined (stub)
- [x] `dh-graph`: NodeKind/EdgeKind/EdgeDetail enums (stub)
- [x] `dh-query`: QueryEngine trait (stub)
- [x] Git: committed + pushed to `migration/rust-engine-phase1`

### Slice 2: Parser TS/JS adapter 🔜 NEXT
- [ ] Add tree-sitter-typescript + tree-sitter-javascript deps to dh-parser/Cargo.toml
- [ ] Implement LanguageRegistry (register adapters, lookup by LanguageId or path)
- [ ] Implement ParserPool (per-worker cached tree-sitter parsers per language)
- [ ] Implement TypeScriptAdapter (TS/TSX/JS/JSX via one adapter):
  - [ ] `parse()` — tree-sitter parse with error recovery
  - [ ] `extract_symbols()` — functions, classes, methods, variables, interfaces, types, enums
  - [ ] `extract_imports()` — ESM, CommonJS, dynamic imports, type-only
  - [ ] `extract_exports()` — named, default, star, re-exports, type-only
  - [ ] `extract_call_edges()` — direct calls, method calls, new expressions
  - [ ] `extract_references()` — identifier reads, writes, type refs (best-effort)
  - [ ] `extract_chunks()` — FileHeader, Symbol, Method, ClassSummary chunks
  - [ ] `collect_diagnostics()` — ERROR nodes from tree
  - [ ] `structure_fingerprint()` / `public_api_fingerprint()` — blake3 hashes
  - [ ] Stub methods: `resolve_imports`, `bind_references`, `bind_call_edges`, `extract_inheritance`
- [ ] Unit tests: parse TS/JS fixtures, verify symbol/import/export/call extraction
- [ ] `cargo build && cargo test` — all green

### Slice 3: Indexer pipeline
- [ ] Scanner (ignore crate, project root detection, file inventory)
- [ ] Prefilter (mtime/size) + BLAKE3 content hashing
- [ ] Dirty set builder
- [ ] Parse dispatch to parser workers
- [ ] Single DB writer (delete-and-rewrite per file via dh-storage)
- [ ] CLI command: `dh-engine index --workspace <path>`
- [ ] Integration test: scan → parse → write to DB for a fixture repo

### Slice 4: Parity harness + benchmark
- [ ] Harness comparing Rust extractor vs TS extractor output
- [ ] Metrics: symbol counts, edge counts, cold index time, incremental time

---

## Key references

- Design: `docs/migration/deep-dive-01-indexer-parser.md`
- Architecture: `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
- Migration plan: `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md`
- Bridge spec: `docs/migration/deep-dive-02-bridge-jsonrpc.md`
- Graph engine: `docs/migration/deep-dive-03-graph-engine.md`
- Process model: `docs/migration/deep-dive-04-process-model.md`

## How to resume

```bash
git checkout migration/rust-engine-phase1
source $HOME/.cargo/env
cd rust-engine
cargo build --workspace   # verify build
cargo test --workspace    # verify tests (5 should pass)
# Then continue with Slice 2: implement dh-parser TS/JS adapter
```

## Verified environment

- Rust toolchain: `rustup stable` (rustc 1.94.1)
- `cargo build`: ✅ succeeds
- `cargo test`: ✅ 5 tests pass (dh-storage)
- CLI smoke test: ✅ `dh-engine init/status` work
