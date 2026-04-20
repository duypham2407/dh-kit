# Rust Engine Migration — Progress Tracker

**Branch:** `migration/rust-engine-phase1`  
**Last updated:** 2026-04-14  
**Current phase:** Phase 1 complete — Slice 4 verified

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

### Slice 2: Parser TS/JS adapter ✅ DONE
- [x] Rust toolchain contract (`rust-toolchain.toml`, channel 1.94.1, rustfmt + clippy)
- [x] Opt-in consent-gated Rust bootstrap (`scripts/install-dev-tools.sh`)
- [x] Installer tests updated and passing (15/15)
- [x] Add tree-sitter-typescript + tree-sitter-javascript deps to dh-parser/Cargo.toml
- [x] Implement LanguageRegistry (register adapters, lookup by LanguageId or path)
- [x] Implement ParserPool (per-worker cached tree-sitter parsers per language)
- [x] Implement TypeScriptAdapter (TS/TSX/JS/JSX via one adapter):
  - [x] `parse()` — tree-sitter parse with error recovery
  - [x] `extract_symbols()` — functions, classes, methods, variables, interfaces, types, enums
  - [x] `extract_imports()` — ESM, CommonJS, dynamic imports, type-only
  - [x] `extract_exports()` — named, default, star, re-exports, type-only
  - [x] `extract_call_edges()` — direct calls, method calls, new expressions
  - [x] `extract_references()` — identifier reads, writes, type refs (best-effort)
  - [x] `extract_chunks()` — FileHeader, Symbol, Method, ClassSummary chunks
  - [x] `collect_diagnostics()` — ERROR nodes from tree
  - [x] `structure_fingerprint()` / `public_api_fingerprint()` — blake3 hashes
  - [x] Stub methods: `resolve_imports`, `bind_references`, `bind_call_edges`, `extract_inheritance`
- [x] High-level `extract_file_facts()` API (tree handling stays inside dh-parser)
- [x] Unit tests: 5 parser tests (registry dispatch, fixture extraction, TSX/JS/JSX variants, error recovery, header span)
- [x] Code review passed (3 issues found and resolved across 2 review cycles)
- [x] `cargo build && cargo test` — all green (10 tests: 5 parser + 5 storage)

### Slice 3: Indexer pipeline ✅ DONE
- [x] Scanner (`scanner.rs`): recursive workspace walking, `.gitignore` support via `ignore` crate, hardcoded excludes (node_modules, .git, target, etc.)
- [x] Content hasher (`hasher.rs`): BLAKE3 content hashing with graceful read-error handling
- [x] Dirty set builder (`dirty.rs`): new/changed/deleted file detection via content_hash + mtime comparison
- [x] Indexer pipeline (`lib.rs`): scan → hash → dirty → parse → write flow, file-atomic transactions
- [x] Hash-failure honesty: unreadable files marked `ParseStatus::Failed` with stale facts cleared
- [x] `index_paths` returns explicit not-implemented error (honest stub)
- [x] Single DB writer (delete-and-rewrite per file via dh-storage, within transactions)
- [x] CLI command: `dh-engine index --workspace <path> [--force-full]`
- [x] Integration tests: 3 tests (end-to-end incremental + delete, hash read failure, index_paths stub)
- [x] Code review passed (3 issues found and resolved across 2 review cycles: tree boundary fix, hash failure fix, index_paths stub)
- [x] `cargo build && cargo test` — all green (13 tests: 3 indexer + 5 parser + 5 storage)

### Slice 4: Parity harness + benchmark ✅ DONE
- [x] Fixture-driven parity harness (`src/parity.rs`)
- [x] Curated corpus: 5 TS fixtures + JSON baselines
- [x] Structured parity report JSON output (`parity-report.json`)
- [x] CLI command: `dh-engine parity --workspace <path> [--output <path>]`
- [x] Metrics reported: symbol/import/call/reference/chunk parity + cold/incremental timing
- [x] Benchmark hardening follow-up: canonical `dh-engine benchmark` artifact path now separates correctness from index/query timing classes and carries explicit memory-measurement status (`measured|not_measured|measurement_failed`) for each result
- [x] Syntax-error fixture handled honestly (`ParsedWithErrors` + diagnostics)
- [x] Regression test for over-count mismatch parity formula
- [x] Code review passed after narrowed-boundary re-review and metric-formula fix
- [x] `cargo build && cargo test` — all green (18 tests: 3 indexer integration + 5 parity + 5 parser + 5 storage)
- [x] Parity CLI verified: 5/5 fixture cases pass, 100% parity on curated corpus

---

## Key references

- Design: `docs/migration/deep-dive-01-indexer-parser.md`
- Architecture: `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
- Migration plan: `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md`
- Solution package: `docs/solution/2026-04-13-rust-ts-code-intelligence-migration.md`
- Bridge spec: `docs/migration/deep-dive-02-bridge-jsonrpc.md`
- Graph engine: `docs/migration/deep-dive-03-graph-engine.md`
- Process model: `docs/migration/deep-dive-04-process-model.md`

## How to resume

```bash
git checkout migration/rust-engine-phase1
source $HOME/.cargo/env
cd rust-engine
cargo build --workspace   # verify build
cargo test --workspace    # verify tests (18 should pass)
cargo run -p dh-engine -- parity --workspace crates/dh-indexer/tests/fixtures/parity --output crates/dh-indexer/tests/fixtures/parity-report.json
# Phase 1 is complete; next work would be Phase 2 planning/bridge work if approved
```

## Verified environment

- Rust toolchain: `rustup stable` (rustc 1.94.1) via `rust-toolchain.toml`
- `cargo build`: ✅ succeeds (2 pre-existing dh-storage warnings)
- `cargo test`: ✅ 18 tests pass (3 indexer + 5 parity + 5 parser + 5 storage)
- CLI smoke test: ✅ `dh-engine init/status/index/parity` work
- Installer tests: ✅ 15/15 pass

## Benchmark wording boundary

- Benchmark outputs in this migration track are local corpus-bound evidence only.
- They do not imply SLA guarantees, hardware-independent performance promises, or universal behavior across all repositories.
