# Deep Dive 01 — Rust Indexer + Parser Design

**Date:** 2026-04-13  
**Author:** System Architect  
**Status:** Proposed implementation guide  
**Context:** DH Rust core — foundation layer cho code understanding engine

---

## 0. Scope of this document

Tài liệu này là deep-dive cho **Module 1: Indexer** và **Module 2: Parser** đã được nêu ở `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`.

Mục tiêu của 2 module này là biến:

```text
raw source files
-> normalized structural facts
-> graph-ready entities
-> retrieval-ready chunks
-> evidence-ready provenance
```

Nói ngắn gọn:

- **Indexer** chịu trách nhiệm biết *cần đọc file nào, khi nào, theo workspace nào, và re-index phần nào*
- **Parser** chịu trách nhiệm biết *đọc syntax tree ra sao, extract symbol/import/call/reference thế nào, và normalize dữ liệu ra schema chung*

Đây là foundation cho:

- Graph Engine
- Query Engine
- Evidence Builder
- Hybrid Retrieval
- Future incremental watch mode

> Design note: đây là **target architecture**, không phải mô tả implementation Rust đã tồn tại trong repo hôm nay.

---

## 1. Architectural principles

### 1.1 Structural-first, not text-first

DH không index theo line window cố định. DH index theo **semantic unit**:

- module/file header
- function
- method
- class
- interface/type block
- test block

Điều này giữ đúng tinh thần từ các tài liệu architecture hiện có:

- AST-first parsing
- symbol-based chunking
- evidence-first answering
- graph-backed retrieval

### 1.2 File-level indexing, symbol-level semantics

Đơn vị scheduling và invalidation cơ bản là **file**.  
Đơn vị meaning và query là **symbol / edge / chunk**.

Lý do:

- tree-sitter parse hiệu quả theo file
- SQLite write và invalidation đơn giản hơn khi atomic per-file
- graph/query vẫn cần semantic granularity bên trong file

### 1.3 Incremental by default

Cold index chỉ là bootstrap. Mọi pass sau phải là incremental pass.

### 1.4 Best-effort extraction on broken code

Parser phải hoạt động được ngay cả khi file đang dở dang hoặc syntax lỗi:

- giữ import extraction nếu có thể
- giữ top-level symbol extraction nếu node recoverable
- record parse diagnostics
- không fail toàn bộ run vì một file lỗi

### 1.5 Stable normalized contracts

Graph Engine và Query Engine không nên nhìn thấy raw tree-sitter nodes.  
Chúng chỉ nên thấy **normalized structs** và **stable read APIs**.

---

## 2. High-level architecture

```text
Workspace Roots
  -> Scanner
  -> Inventory Builder
  -> Change Detector
  -> Invalidation Planner
  -> Parse Workers
  -> Adapter Extractors
  -> Chunk Builder
  -> Staging Writer
  -> SQLite Commit
  -> Embedding Queue
  -> Index State Update
```

### 2.1 Module boundaries

```text
crates/dh_indexer/
  scanner/
  workspace/
  hashing/
  invalidation/
  pipeline/
  progress/
  state/

crates/dh_parser/
  registry/
  tree_sitter/
  adapters/
    typescript/
    python/
    go/
    rust/
  normalize/
  chunking/
  diagnostics/

crates/dh_index_store/
  schema/
  sqlite/
  repository/

crates/dh_types/
  ids.rs
  span.rs
  symbols.rs
  chunks.rs
  index_state.rs
```

### 2.2 Runtime ownership

| Concern | Owner |
|---|---|
| Workspace discovery | Indexer |
| Ignore rules | Indexer |
| Language detection | Indexer + Parser registry |
| AST parse | Parser |
| Symbol/import/call/reference extraction | Parser adapters |
| Semantic chunking | Parser |
| Incremental invalidation | Indexer |
| Persistent storage | Index store |
| Embedding enqueue | Indexer |
| Graph query consumption | Graph Engine / Query Engine |

---

## 3. Indexer architecture

## 3.1 File scanner

### Goal

Biến workspace path thành **file inventory** chuẩn hóa, có đủ metadata cho:

- filtering
- change detection
- language routing
- workspace boundary mapping

### Input

- one or more root paths
- optional explicit include/exclude globs
- workspace config overrides
- last known inventory snapshot

### Output

`Vec<FileCandidate>` với các field tối thiểu:

- absolute path
- relative path (within root)
- root id / workspace id
- detected language
- size bytes
- mtime
- executable bit
- optional shebang
- inventory hash seed

### Scanner responsibilities

#### 3.1.1 Project detection

Scanner detect workspace shape trước khi walk sâu.

**Markers ưu tiên:**

| Marker | Meaning |
|---|---|
| `.git/` | repository root |
| `pnpm-workspace.yaml` | JS/TS monorepo root |
| `package.json` with `workspaces` | JS/TS workspace root |
| `turbo.json`, `nx.json` | monorepo orchestration root |
| `Cargo.toml` with `[workspace]` | Rust workspace root |
| `go.work` | Go multi-module root |
| `go.mod` | Go module root |
| `pyproject.toml`, `requirements.txt` | Python project root |
| `.gitignore` | ignore boundary candidate |

**Rule:**

1. Nếu user truyền explicit roots -> giữ nguyên.
2. Nếu không, detect nearest repository root.
3. Nếu root chứa workspace markers -> tạo `RootDescriptor` cho root chính và `PackageDescriptor` cho subpackages.
4. Nếu monorepo multi-language -> vẫn index chung trong một `WorkspaceId`, nhưng gắn `root_id` / `package_id` để graph/query biết boundary.

#### 3.1.2 `.gitignore` handling

Use `ignore` crate semantics, không shell out ra `git`.

Nguồn ignore rules:

1. root `.gitignore`
2. nested `.gitignore`
3. `.ignore`
4. `.git/info/exclude` nếu có repo git
5. tool-specific defaults của DH

**DH default excludes** nên bao gồm:

```text
.git/
node_modules/
dist/
build/
target/
.next/
.turbo/
.cache/
coverage/
venv/
.venv/
__pycache__/
vendor/
*.min.js
*.map
*.lock
*.svg
*.png
*.jpg
*.jpeg
*.gif
*.pdf
```

**Important:** default excludes là để tránh noise; nhưng phải có config cho phép override để index generated code khi user thật sự muốn.

#### 3.1.3 Language detection

Language detection không chỉ dựa extension.

Detection order:

1. exact filename map (`Cargo.toml`, `Dockerfile`, `Makefile`, etc.)
2. extension map (`.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.go`, `.rs`)
3. shebang (`#!/usr/bin/env python`, `node`, `bash`)
4. parent package hints (ví dụ package TS root)
5. fallback -> `Unknown` / skip

**Priority P1** languages:

- TypeScript
- TSX
- JavaScript
- JSX
- Python
- Go
- Rust

### File inventory schema

```rust
#[derive(Debug, Clone)]
pub struct FileCandidate {
    pub abs_path: std::path::PathBuf,
    pub rel_path: String,
    pub workspace_id: i64,
    pub root_id: i64,
    pub package_id: Option<i64>,
    pub language: LanguageId,
    pub size_bytes: u64,
    pub mtime_unix_ms: i64,
    pub executable: bool,
    pub shebang: Option<String>,
}
```

---

## 3.2 Incremental indexing

### Design goal

Không reparse toàn repo nếu chỉ đổi vài file, nhưng cũng không để graph stale khi thay đổi API public lan sang dependents.

### 3.2.1 Change detection model

Không hash toàn bộ mọi file ở mọi run nếu không cần.  
Use **two-step detection**:

#### Step A — fast prefilter

Compare:

- file size
- mtime
- existence

Nếu giống snapshot cũ -> likely unchanged.

#### Step B — confirm with content hash

Chỉ hash các file bị nghi ngờ changed ở Step A.

Recommended hash: **BLAKE3**

Lý do:

- nhanh hơn SHA-256 cho local indexing
- deterministic
- support incremental hashing well

### 3.2.2 Stored hashes

Mỗi file nên giữ ít nhất 3 fingerprint:

1. `content_hash` — toàn bộ file
2. `structure_hash` — hash của normalized symbol/import/export shape
3. `public_api_hash` — hash của exported / public-facing declarations

Ý nghĩa:

- `content_hash` đổi -> file phải reparse
- `structure_hash` đổi -> file-level graph edges có thể phải rewrite
- `public_api_hash` đổi -> dependents có thể cần invalidation để resolve lại imports/references/calls

### 3.2.3 Dependency-aware invalidation

Invalidation không dừng ở changed file.

#### Cases

| Change | Re-index file itself | Invalidate dependents |
|---|---|---|
| comment / whitespace only | yes, but may reuse prior structure if structure hash same | no |
| local implementation body changed | yes | no, unless call/reference extraction requires updated intra-file edges |
| import list changed | yes | maybe importers/dependents if resolution targets changed |
| exported symbol added/removed/renamed | yes | yes |
| class/interface public signature changed | yes | yes |
| file deleted | tombstone file + delete facts | yes |
| workspace config changed (`tsconfig`, `Cargo.toml`, `go.mod`) | yes | broad package/root invalidation |

#### Invalidation strategy

Use 3 dirty levels:

```text
DirtyLevel::ContentOnly   -> reparse file, rewrite file-owned facts
DirtyLevel::Structural    -> reparse + rewrite edges + revisit related files
DirtyLevel::Dependent     -> re-resolve imports/references/calls for dependents
```

#### Rule of thumb

- changed file always gets full file reparse
- dependents usually get **re-resolution**, not necessarily full semantic re-chunk if content unchanged
- to keep implementation simpler in V1, dependent invalidation may still be file-level re-extraction; optimize later only when profiling proves needed

### 3.2.4 Partial re-index

Support 3 scopes:

1. `WorkspaceFull`
2. `PathsOnly(Vec<PathBuf>)`
3. `PackageOnly(package_id)`

Internally all scopes become a **dirty set** plus an **expanded invalidation set**.

### 3.2.5 Watch-mode compatibility

Future file watchers should emit the same invalidation events:

```rust
pub enum FileChangeEvent {
    Created { path: PathBuf },
    Modified { path: PathBuf },
    Deleted { path: PathBuf },
    Renamed { from: PathBuf, to: PathBuf },
}
```

Indexer pipeline phải reuse được cho:

- one-shot CLI index
- watch mode
- on-demand path reindex

---

## 3.3 Semantic chunking

### Non-goal

Không chunk theo fixed token window / line count kiểu RAG cơ bản.

### Goal

Chunk phải map về **semantic boundary** và dùng được trực tiếp cho retrieval/evidence.

### 3.3.1 Chunk types

```text
file_header_chunk
module_chunk
symbol_chunk
method_chunk
class_summary_chunk
test_block_chunk
doc_chunk
```

### 3.3.2 Chunk boundary rules

#### File header chunk

Chứa:

- module/package docs
- imports summary
- exports summary
- top-level config or route registration when small

#### Symbol chunk

Chứa:

- doc comment leading the symbol
- signature/header
- full symbol body if size under threshold
- nếu body quá lớn: split theo semantic child block, không split giữa statements ngẫu nhiên

#### Class chunk strategy

For class-like structures:

- 1 `class_summary_chunk` cho class signature + properties + inheritance/implements
- 1 `method_chunk` per method
- optional `constructor_chunk`

#### Test block chunk

For test frameworks:

- `describe` / `it` / `test` in JS/TS
- `def test_*` in Python
- Go/Rust test functions

### 3.3.3 Overlap strategy

Không dùng text overlap 20%-30% kiểu generic RAG.  
Use **structural overlap**:

1. chunk có `parent_symbol_id`
2. chunk có `prev_chunk_id` / `next_chunk_id`
3. method chunk inherit minimal class context through metadata, không duplicate nguyên class
4. nested function chunk inherit outer symbol id

**Metadata thay cho duplication.**

Ví dụ:

```text
Class: AuthService
  - class_summary_chunk      (name, fields, base types, exported status)
  - method_chunk: login
  - method_chunk: refreshToken
  - method_chunk: validateToken
```

Khi retrieval cần thêm context, Query Engine có thể expand sang `class_summary_chunk` thay vì embedding overlap text dư thừa.

### 3.3.4 Chunk metadata

Mỗi chunk phải giữ:

- file path
- language
- chunk type
- line/byte span
- symbol id nullable
- parent symbol id nullable
- export visibility
- import context summary
- surrounding package/root id
- content hash
- embedding status

### 3.3.5 Suggested thresholds

```text
target chunk size: 80-300 lines semantic equivalent
hard max body span before split: ~400 lines
header context duplication: <= 12 lines equivalent
```

Không phải constraint compile-time, nhưng useful guardrails cho retrieval quality.

---

## 3.4 Workspace management

### 3.4.1 Monorepo support

DH phải coi monorepo là first-class.

**Model:**

```text
Workspace
  -> Roots
  -> Packages
  -> Files
```

Ví dụ JS monorepo:

```text
repo/
  package.json
  pnpm-workspace.yaml
  apps/web/
  apps/api/
  packages/shared/
```

Store should know:

- workspace root = `repo/`
- package roots = `apps/web`, `apps/api`, `packages/shared`
- file ownership by package

### 3.4.2 Multi-root support

Một DH session có thể attach nhiều roots:

```text
workspace roots:
- /repo/service-a
- /repo/service-b
- /shared/lib
```

Trong trường hợp này, `WorkspaceId` đại diện logical indexing session, còn `root_id` đại diện root vật lý.

### 3.4.3 Workspace markers

Indexer nên persist marker facts để Query Engine hiểu architectural boundaries:

- package manifest path
- language ecosystem
- root type (`git_root`, `js_workspace`, `cargo_workspace`, `go_module`, `python_project`)
- config files affecting resolution (`tsconfig.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`)

### 3.4.4 Resolution context per package

Import resolution không thể chỉ dựa global root.  
It must use **package-local resolution context**.

Ví dụ TS:

- nearest `tsconfig.json`
- path aliases
- baseUrl
- package name
- `exports` / `types` hints from `package.json`

---

## 3.5 Concurrency model

### Design goal

Parallelize CPU-heavy work, serialize fragile write path.

### 3.5.1 Pipeline stages

```text
[Scanner] -> [Hasher pool] -> [Parser pool] -> [Normalizer] -> [DB writer] -> [Embedding queue]
```

### 3.5.2 Recommended execution model

- scanner: single-thread producer
- hashers: rayon or tokio blocking pool
- parse/extract workers: fixed worker pool sized to CPU count
- DB writer: single dedicated writer task + batched transactions
- progress aggregator: single consumer of events

### 3.5.3 Why single DB writer?

SQLite supports many readers but one writer path is simplest and most predictable.  
Avoid lock thrashing.

### 3.5.4 Parser worker model

Each worker owns:

- parser registry handle
- thread-local tree-sitter parsers per language
- adapter scratch buffers

Do **not** share mutable parser instances across threads.

### 3.5.5 Index lock strategy

Need 2 layers:

#### Process lock

Lock file at:

```text
<workspace_cache_dir>/index.lock
```

Contains:

- pid
- hostname
- started_at
- workspace id
- run id

#### Database run lock

`index_runs` table stores active run and heartbeat.

Benefits:

- recover stale process locks
- survive unclean shutdown
- inspect running state from status API

### 3.5.6 Progress reporting

Emit stage-aware progress events:

```rust
pub enum IndexProgressEvent {
    ScanStarted { roots: usize },
    ScanCompleted { files_seen: u64, files_selected: u64 },
    HashingProgress { done: u64, total: u64 },
    ParsingProgress { done: u64, total: u64 },
    WritingProgress { done: u64, total: u64 },
    EmbeddingQueued { chunks: u64 },
    Completed { changed_files: u64, duration_ms: u128 },
    Failed { stage: String, message: String },
}
```

TS orchestration layer có thể map events này sang JSON-RPC notifications.

---

## 4. Parser architecture

## 4.1 tree-sitter integration

### 4.1.1 Why tree-sitter

Phù hợp với DH vì:

- multi-language
- fast incremental parsing
- error recovery tốt
- stable node spans
- ecosystem grammar rộng

### 4.1.2 Integration model

Mỗi worker giữ parser cache per language:

```rust
use tree_sitter::{Language, Parser, Tree};

pub struct ParserPool {
    parsers: std::collections::HashMap<LanguageId, Parser>,
}

impl ParserPool {
    pub fn parser_for(&mut self, language: LanguageId) -> anyhow::Result<&mut Parser> {
        if !self.parsers.contains_key(&language) {
            let mut parser = Parser::new();
            parser.set_language(language.ts_language()?)?;
            self.parsers.insert(language, parser);
        }
        Ok(self.parsers.get_mut(&language).unwrap())
    }
}
```

### 4.1.3 Grammar loading

Recommended approach for P1:

- compile priority grammars into binary / linked crates
- register them in `LanguageRegistry`
- avoid runtime WASM loading for core engine path

```rust
pub struct LanguageRegistry {
    adapters: std::collections::HashMap<LanguageId, std::sync::Arc<dyn LanguageAdapter>>,
}
```

Reason:

- deterministic packaging
- lower runtime complexity
- no grammar download problem
- best fit for local CLI binary

### 4.1.4 Error recovery

tree-sitter parse vẫn trả `Tree` ngay cả khi syntax invalid.  
Adapter phải inspect:

- `node.is_error()`
- `node.has_error()`
- changed ranges if incremental parse

**Policy:**

- parse success + recoverable errors -> index partial facts, save diagnostics
- parser crash / grammar mismatch -> mark file parse failed, do not write stale facts

### 4.1.5 Incremental parse support

Nếu watch mode có old tree và edit span, parser có thể:

1. apply edit to old tree
2. reparse with old tree hint
3. inspect changed ranges

Tuy nhiên, **storage update unit vẫn là file** ở V1.  
Changed ranges primarily dùng cho future optimization và diagnostics, không cần symbol-level DB diff ngay ở first release.

---

## 4.2 `LanguageAdapter` trait

Trait này là hợp đồng quan trọng nhất của parser layer.

### Full interface sketch

```rust
use std::path::Path;
use tree_sitter::{Node, Tree};

pub trait LanguageAdapter: Send + Sync {
    fn language_id(&self) -> LanguageId;
    fn display_name(&self) -> &'static str;
    fn file_extensions(&self) -> &'static [&'static str];
    fn grammar(&self) -> tree_sitter::Language;

    // Detection / routing
    fn matches_path(&self, path: &Path) -> bool;
    fn detect_from_shebang(&self, shebang: &str) -> bool;

    // Parsing / diagnostics
    fn parse(&self, parser: &mut tree_sitter::Parser, source: &str, old_tree: Option<&Tree>)
        -> Result<ParseOutput, ParseError>;
    fn collect_diagnostics(&self, source: &str, tree: &Tree) -> Vec<ParseDiagnostic>;

    // Extraction
    fn extract_symbols(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Symbol>;
    fn extract_imports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<Import>;
    fn extract_exports(&self, ctx: &ExtractionContext<'_>, tree: &Tree) -> Vec<ExportFact>;
    fn extract_call_edges(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<CallEdge>;
    fn extract_references(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<Reference>;
    fn extract_inheritance(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<TypeRelation>;

    // Chunking
    fn extract_chunks(&self, ctx: &ExtractionContext<'_>, tree: &Tree, symbols: &[Symbol]) -> Vec<Chunk>;

    // Resolution helpers
    fn resolve_imports(
        &self,
        ctx: &ExtractionContext<'_>,
        imports: &mut [Import],
        symbols: &[Symbol],
    ) -> Vec<UnresolvedImport>;
    fn bind_references(
        &self,
        ctx: &ExtractionContext<'_>,
        references: &mut [Reference],
        symbols: &[Symbol],
        import_map: &[Import],
    );
    fn bind_call_edges(
        &self,
        ctx: &ExtractionContext<'_>,
        calls: &mut [CallEdge],
        symbols: &[Symbol],
        import_map: &[Import],
    );

    // Fingerprints
    fn structure_fingerprint(&self, symbols: &[Symbol], imports: &[Import], exports: &[ExportFact]) -> String;
    fn public_api_fingerprint(&self, symbols: &[Symbol], exports: &[ExportFact]) -> String;
}
```

### Supporting context types

```rust
pub struct ExtractionContext<'a> {
    pub workspace_id: i64,
    pub root_id: i64,
    pub package_id: Option<i64>,
    pub file_id: i64,
    pub rel_path: &'a str,
    pub source: &'a str,
    pub line_index: &'a LineIndex,
    pub resolution: &'a ResolutionContext,
}

pub struct ParseOutput {
    pub tree: Tree,
    pub has_errors: bool,
    pub language: LanguageId,
}
```

### Key design decision

`LanguageAdapter` phải trả về **normalized domain objects**, không trả raw AST fragments ra ngoài parser crate.

---

## 4.3 Symbol extraction schema

## 4.3.1 Extraction goals

Parser phải trích ít nhất các loại symbol sau:

- functions
- classes
- methods
- variables / constants
- types / type aliases
- interfaces / protocols / traits
- enums
- fields / properties when structurally important
- modules / namespaces where language supports them

## 4.3.2 Symbol identity

Mỗi symbol cần cả:

- stable DB id (surrogate)
- deterministic logical key để compare across re-index

Recommended logical key material:

```text
workspace_id + file_rel_path + symbol_kind + qualified_name + start_byte
```

### 4.3.3 `qualified_name` rules

Examples:

```text
AuthService
AuthService.login
auth::validate_token
pkg.module.Class.method
```

### 4.3.4 Symbol extraction detail

| Kind | Required fields |
|---|---|
| function | name, params, return type, async flag, exported flag |
| class | name, base types, implemented interfaces, exported flag |
| method | name, owner class/impl, params, return type, visibility |
| variable/const | name, type annotation if available, exported flag |
| interface/trait | name, members, exported flag |
| type alias | name, underlying type text |
| enum | name, members |
| import/export | normalized as separate facts, not SymbolKind |

### 4.3.5 Signature capture

Store both:

- normalized signature (`(name: string) -> Promise<User>`)
- raw header text snippet for evidence display

---

## 4.4 Relationship extraction

## 4.4.1 Import resolution

Need 3 outputs:

1. raw import fact
2. resolved target file/package if known
3. unresolved reason if not known

Resolution levels:

```text
relative file -> workspace package alias -> external dependency -> unresolved
```

## 4.4.2 Call detection

Call detection should capture:

- caller symbol
- callee textual name
- callee resolved symbol id if possible
- call kind (direct, method, constructor, macro-like, dynamic)
- source span

### Important

Call graph V1 is **best-effort**, not compiler-perfect.  
But every unresolved call still carries useful provenance.

## 4.4.3 Reference tracking

References classify at least:

- read
- write
- call
- type
- import
- export
- inherit/implement

For each reference:

- source symbol/file
- target symbol if resolved
- name text
- span
- resolution confidence

## 4.4.4 Inheritance / implementation

Need explicit edges for:

- class extends base class
- class implements interface
- Rust impl of trait
- Go struct implements interface (initially inferred conservatively or deferred)

---

## 4.5 Language-specific adapters

## 4.5.1 TypeScript / JavaScript adapter — Priority 1

Đây là adapter quan trọng nhất vì DH hiện tại có TS-heavy workflow/application layer.

### Syntax forms to support in P1

#### Symbols

- `function foo() {}`
- `export function foo() {}`
- `const foo = () => {}`
- `export const foo = async () => {}`
- `class AuthService { ... }`
- `export class AuthService { ... }`
- `interface User { ... }`
- `type UserId = string`
- `enum Role { ... }`
- `const obj = { method() {} }` (optional P1.5 for object-method extraction)

#### Imports / exports

- `import x from 'a'`
- `import { x, y as z } from 'a'`
- `import type { Foo } from './types'`
- `import * as ns from 'a'`
- `export { x }`
- `export { x as y } from 'a'`
- `export * from 'a'`
- `export * as ns from 'a'`
- `module.exports = ...`
- `exports.foo = ...`
- `require('x')`

#### Calls

- `foo()`
- `obj.method()`
- `new Service()`
- `await import('./dynamic')`
- `factory()?.run()`

### TS/JS adapter node mapping

| AST node | Output |
|---|---|
| `function_declaration` | function symbol |
| `lexical_declaration` / `variable_declaration` with function initializer | function symbol or variable symbol |
| `class_declaration` | class symbol |
| `method_definition` | method symbol |
| `public_field_definition` / class field | property symbol |
| `interface_declaration` | interface symbol |
| `type_alias_declaration` | type alias symbol |
| `enum_declaration` | enum symbol |
| `import_statement` | import facts |
| `export_statement` | export facts |
| `call_expression` | call edge |
| `new_expression` | constructor-style call edge |

### TS import resolution detail

Resolution order:

1. relative path (`./`, `../`)
2. `tsconfig` `paths`
3. `baseUrl`
4. package-local workspace package name
5. external dependency placeholder

### TS edge cases

#### Dynamic imports

```ts
const mod = await import('./auth')
```

Store as:

- `ImportKind::Dynamic`
- resolved file if string literal
- unresolved if expression not literal

#### Re-exports

```ts
export { AuthService } from './auth/service'
export * from './auth'
```

Need separate `ExportFact` and often an `Import` with `is_reexport = true`.

#### Barrel files

If file mostly contains re-exports and little/no implementation:

- mark `File.is_barrel = true`
- create file header chunk only
- avoid generating misleading implementation chunks

#### Type-only imports

```ts
import type { User } from './types'
```

Must not create runtime call/dependency semantics identical to value import.  
Store `is_type_only = true` and separate reference kind `Type`.

#### Conditional requires

```ts
const impl = process.env.X ? require('./a') : require('./b')
```

Store both as `ImportKind::ConditionalRequire`, unresolved to exact control path unless condition is constant-foldable.

### P1 limitation accepted

Do not attempt full TS type-checker-level resolution in parser adapter.  
This adapter is syntax-first + heuristic semantic binding.  
Future integration with a TS semantic service can refine unresolved edges later.

## 4.5.2 Python adapter notes

Support first:

- `def`, `async def`
- `class`
- assignments at module scope
- imports: `import x`, `from x import y`
- base classes
- call expressions
- references via identifiers and attributes

Known limitations:

- monkey patching
- runtime metaprogramming
- dynamic imports via `__import__`
- full name resolution across star imports

## 4.5.3 Go adapter notes

Support first:

- package declaration
- functions
- methods with receivers
- structs
- interfaces
- imports
- selector calls
- test functions

Special rule:

Go symbol resolution should be package-aware across files in same package, not file-isolated.

## 4.5.4 Rust adapter notes

Support first:

- `fn`
- `struct`, `enum`, `trait`, `type`
- `impl` blocks
- `use`
- module declarations
- macro invocations as unresolved call-like edges

Special rule:

Need distinguish:

- inherent impl methods
- trait impl methods
- `pub` visibility chain

---

## 4.6 Edge cases policy

### Dynamic imports

- literal target -> resolve if possible
- expression target -> store unresolved dynamic import fact

### Re-exports

- create export fact
- if source literal exists, keep source import linkage

### Barrel files

- detect by ratio of export statements to implementation statements
- mark file metadata for ranking/query heuristics

### Type-only imports

- store separately from runtime imports
- contribute to type/reference graph, not runtime call graph

### Conditional requires

- preserve raw expression text
- mark low-confidence resolved target if static branch impossible to know

### Syntax-broken files

- persist diagnostics
- salvage import/header/top-level symbols where adapter can do so safely

---

## 5. Data model

Below là normalized Rust data model mà Graph Engine và Query Engine nên dựa vào.

```rust
use serde::{Deserialize, Serialize};

pub type WorkspaceId = i64;
pub type RootId = i64;
pub type PackageId = i64;
pub type FileId = i64;
pub type SymbolId = i64;
pub type ChunkId = i64;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum LanguageId {
    TypeScript,
    Tsx,
    JavaScript,
    Jsx,
    Python,
    Go,
    Rust,
    Unknown,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ParseStatus {
    Pending,
    Parsed,
    ParsedWithErrors,
    Failed,
    Skipped,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Span {
    pub start_byte: u32,
    pub end_byte: u32,
    pub start_line: u32,
    pub start_column: u32,
    pub end_line: u32,
    pub end_column: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct File {
    pub id: FileId,
    pub workspace_id: WorkspaceId,
    pub root_id: RootId,
    pub package_id: Option<PackageId>,
    pub rel_path: String,
    pub language: LanguageId,
    pub size_bytes: u64,
    pub mtime_unix_ms: i64,
    pub content_hash: String,
    pub structure_hash: Option<String>,
    pub public_api_hash: Option<String>,
    pub parse_status: ParseStatus,
    pub parse_error: Option<String>,
    pub symbol_count: u32,
    pub chunk_count: u32,
    pub is_barrel: bool,
    pub last_indexed_at_unix_ms: Option<i64>,
    pub deleted_at_unix_ms: Option<i64>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum SymbolKind {
    Module,
    Namespace,
    Function,
    Method,
    Class,
    Struct,
    Interface,
    Trait,
    TypeAlias,
    Enum,
    EnumMember,
    Variable,
    Constant,
    Field,
    Property,
    Parameter,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum Visibility {
    Public,
    Protected,
    Private,
    Internal,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Symbol {
    pub id: SymbolId,
    pub workspace_id: WorkspaceId,
    pub file_id: FileId,
    pub parent_symbol_id: Option<SymbolId>,
    pub kind: SymbolKind,
    pub name: String,
    pub qualified_name: String,
    pub signature: Option<String>,
    pub detail: Option<String>,
    pub visibility: Visibility,
    pub exported: bool,
    pub async_flag: bool,
    pub static_flag: bool,
    pub span: Span,
    pub symbol_hash: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ImportKind {
    EsmDefault,
    EsmNamed,
    EsmNamespace,
    EsmSideEffect,
    CommonJsRequire,
    Dynamic,
    ConditionalRequire,
    ReExport,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Import {
    pub id: i64,
    pub workspace_id: WorkspaceId,
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub raw_specifier: String,
    pub imported_name: Option<String>,
    pub local_name: Option<String>,
    pub alias: Option<String>,
    pub kind: ImportKind,
    pub is_type_only: bool,
    pub is_reexport: bool,
    pub resolved_file_id: Option<FileId>,
    pub resolved_symbol_id: Option<SymbolId>,
    pub span: Span,
    pub resolution_error: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum CallKind {
    Direct,
    Method,
    Constructor,
    MacroLike,
    Dynamic,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CallEdge {
    pub id: i64,
    pub workspace_id: WorkspaceId,
    pub source_file_id: FileId,
    pub caller_symbol_id: Option<SymbolId>,
    pub callee_symbol_id: Option<SymbolId>,
    pub callee_qualified_name: Option<String>,
    pub callee_display_name: String,
    pub kind: CallKind,
    pub resolved: bool,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ReferenceKind {
    Read,
    Write,
    Call,
    Type,
    Import,
    Export,
    Inherit,
    Implement,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Reference {
    pub id: i64,
    pub workspace_id: WorkspaceId,
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub target_symbol_id: Option<SymbolId>,
    pub target_name: String,
    pub kind: ReferenceKind,
    pub resolved: bool,
    pub resolution_confidence: f32,
    pub span: Span,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum ChunkKind {
    FileHeader,
    Module,
    Symbol,
    Method,
    ClassSummary,
    TestBlock,
    Doc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum EmbeddingStatus {
    NotQueued,
    Queued,
    Indexed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Chunk {
    pub id: ChunkId,
    pub workspace_id: WorkspaceId,
    pub file_id: FileId,
    pub symbol_id: Option<SymbolId>,
    pub parent_symbol_id: Option<SymbolId>,
    pub kind: ChunkKind,
    pub language: LanguageId,
    pub title: String,
    pub content: String,
    pub content_hash: String,
    pub token_estimate: u32,
    pub span: Span,
    pub prev_chunk_id: Option<ChunkId>,
    pub next_chunk_id: Option<ChunkId>,
    pub embedding_status: EmbeddingStatus,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub enum IndexRunStatus {
    Idle,
    Scanning,
    Hashing,
    Parsing,
    Writing,
    Completed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IndexState {
    pub workspace_id: WorkspaceId,
    pub schema_version: u32,
    pub index_version: u64,
    pub status: IndexRunStatus,
    pub active_run_id: Option<String>,
    pub total_files: u64,
    pub indexed_files: u64,
    pub dirty_files: u64,
    pub deleted_files: u64,
    pub last_scan_started_at_unix_ms: Option<i64>,
    pub last_scan_finished_at_unix_ms: Option<i64>,
    pub last_successful_index_at_unix_ms: Option<i64>,
    pub queued_embeddings: u64,
    pub last_error: Option<String>,
}
```

---

## 5.1 SQLite schema

### Storage settings

Recommended defaults:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA temp_store = MEMORY;
PRAGMA mmap_size = 268435456; -- 256MB if supported
PRAGMA busy_timeout = 5000;
```

### Core tables

```sql
CREATE TABLE workspaces (
  id INTEGER PRIMARY KEY,
  root_path TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE roots (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  abs_path TEXT NOT NULL,
  root_kind TEXT NOT NULL,
  marker_path TEXT,
  UNIQUE(workspace_id, abs_path)
);

CREATE TABLE packages (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  rel_path TEXT NOT NULL,
  package_name TEXT,
  ecosystem TEXT,
  resolution_context_json TEXT,
  UNIQUE(workspace_id, root_id, rel_path)
);

CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  root_id INTEGER NOT NULL REFERENCES roots(id) ON DELETE CASCADE,
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  rel_path TEXT NOT NULL,
  language TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mtime_unix_ms INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  structure_hash TEXT,
  public_api_hash TEXT,
  parse_status TEXT NOT NULL,
  parse_error TEXT,
  symbol_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  is_barrel INTEGER NOT NULL DEFAULT 0,
  last_indexed_at_unix_ms INTEGER,
  deleted_at_unix_ms INTEGER,
  UNIQUE(workspace_id, rel_path)
);

CREATE TABLE symbols (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  parent_symbol_id INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  qualified_name TEXT NOT NULL,
  signature TEXT,
  detail TEXT,
  visibility TEXT NOT NULL,
  exported INTEGER NOT NULL DEFAULT 0,
  async_flag INTEGER NOT NULL DEFAULT 0,
  static_flag INTEGER NOT NULL DEFAULT 0,
  start_byte INTEGER NOT NULL,
  end_byte INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  symbol_hash TEXT NOT NULL
);

CREATE TABLE imports (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  source_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  raw_specifier TEXT NOT NULL,
  imported_name TEXT,
  local_name TEXT,
  alias TEXT,
  kind TEXT NOT NULL,
  is_type_only INTEGER NOT NULL DEFAULT 0,
  is_reexport INTEGER NOT NULL DEFAULT 0,
  resolved_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  resolved_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  resolution_error TEXT
);

CREATE TABLE call_edges (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  caller_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  callee_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  callee_qualified_name TEXT,
  callee_display_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL
);

CREATE TABLE references (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  source_file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  source_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  target_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  target_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0,
  resolution_confidence REAL NOT NULL DEFAULT 0.0,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL
);

CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  parent_symbol_id INTEGER REFERENCES symbols(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  language TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  token_estimate INTEGER NOT NULL,
  start_line INTEGER NOT NULL,
  start_column INTEGER NOT NULL,
  end_line INTEGER NOT NULL,
  end_column INTEGER NOT NULL,
  prev_chunk_id INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
  next_chunk_id INTEGER REFERENCES chunks(id) ON DELETE SET NULL,
  embedding_status TEXT NOT NULL DEFAULT 'NotQueued'
);

CREATE TABLE embeddings (
  chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  vector BLOB NOT NULL,
  created_at_unix_ms INTEGER NOT NULL
);

CREATE TABLE embedding_jobs (
  id INTEGER PRIMARY KEY,
  chunk_id INTEGER NOT NULL REFERENCES chunks(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at_unix_ms INTEGER NOT NULL,
  updated_at_unix_ms INTEGER NOT NULL,
  UNIQUE(chunk_id, model, content_hash)
);

CREATE TABLE index_state (
  workspace_id INTEGER PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL,
  index_version INTEGER NOT NULL,
  status TEXT NOT NULL,
  active_run_id TEXT,
  total_files INTEGER NOT NULL DEFAULT 0,
  indexed_files INTEGER NOT NULL DEFAULT 0,
  dirty_files INTEGER NOT NULL DEFAULT 0,
  deleted_files INTEGER NOT NULL DEFAULT 0,
  last_scan_started_at_unix_ms INTEGER,
  last_scan_finished_at_unix_ms INTEGER,
  last_successful_index_at_unix_ms INTEGER,
  queued_embeddings INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

CREATE TABLE index_runs (
  run_id TEXT PRIMARY KEY,
  workspace_id INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  started_at_unix_ms INTEGER NOT NULL,
  heartbeat_at_unix_ms INTEGER NOT NULL,
  finished_at_unix_ms INTEGER,
  message TEXT
);
```

### Performance indexes

```sql
CREATE INDEX idx_files_workspace_language ON files(workspace_id, language);
CREATE INDEX idx_files_workspace_parse_status ON files(workspace_id, parse_status);
CREATE INDEX idx_files_workspace_public_api_hash ON files(workspace_id, public_api_hash);

CREATE INDEX idx_symbols_file ON symbols(file_id);
CREATE INDEX idx_symbols_workspace_name ON symbols(workspace_id, name);
CREATE INDEX idx_symbols_workspace_qname ON symbols(workspace_id, qualified_name);
CREATE INDEX idx_symbols_parent ON symbols(parent_symbol_id);
CREATE INDEX idx_symbols_exported ON symbols(workspace_id, exported, kind);

CREATE INDEX idx_imports_source_file ON imports(source_file_id);
CREATE INDEX idx_imports_resolved_file ON imports(resolved_file_id);
CREATE INDEX idx_imports_specifier ON imports(workspace_id, raw_specifier);

CREATE INDEX idx_calls_caller ON call_edges(caller_symbol_id);
CREATE INDEX idx_calls_callee ON call_edges(callee_symbol_id);
CREATE INDEX idx_calls_source_file ON call_edges(source_file_id);

CREATE INDEX idx_refs_target ON references(target_symbol_id);
CREATE INDEX idx_refs_source_symbol ON references(source_symbol_id);
CREATE INDEX idx_refs_target_name ON references(workspace_id, target_name);

CREATE INDEX idx_chunks_file ON chunks(file_id);
CREATE INDEX idx_chunks_symbol ON chunks(symbol_id);
CREATE INDEX idx_chunks_content_hash ON chunks(content_hash);
CREATE INDEX idx_chunks_workspace_kind ON chunks(workspace_id, kind);

CREATE INDEX idx_embedding_jobs_status ON embedding_jobs(status, updated_at_unix_ms);
CREATE INDEX idx_index_runs_workspace_status ON index_runs(workspace_id, status);
```

### FTS for keyword search

```sql
CREATE VIRTUAL TABLE chunk_fts USING fts5(
  title,
  content,
  rel_path UNINDEXED,
  language UNINDEXED,
  content=''
);
```

Implementation choice:

- FTS row maintenance can be done from Rust writer transaction
- no trigger dependency required in V1

---

## 5.2 Embedding integration points

Embedding không thuộc parser core, nhưng indexer phải chuẩn bị integration points rõ ràng.

### Trigger points

Queue embedding when:

1. new chunk inserted
2. chunk content hash changed
3. embedding model changed

Do not queue when:

- file reindexed but chunk content hash unchanged
- only metadata changed unrelated to retrieval content

### Contract

```rust
pub struct EmbeddingWorkItem {
    pub chunk_id: ChunkId,
    pub content_hash: String,
    pub model: String,
    pub content: String,
}
```

### Important boundary

Indexer **queues** embeddings; it should not block core structural indexing on embedding provider latency.

---

## 6. Indexing pipeline

## 6.1 Step-by-step flow

```text
1. Resolve workspace roots
2. Build ignore matcher + package markers
3. Scan files and build inventory snapshot
4. Compare against prior snapshot
5. Hash suspected changes
6. Build dirty set
7. Expand dependency-aware invalidation
8. Dispatch parse/extract workers
9. Build normalized facts per file
10. Stage DB rewrite for each dirty file
11. Commit transaction batches
12. Queue embedding jobs for changed chunks
13. Update index_state and run heartbeat/final status
14. Publish progress + final report
```

## 6.2 Per-file processing contract

For each dirty file:

```text
read source
-> choose adapter
-> parse tree
-> diagnostics
-> symbols
-> imports/exports
-> calls
-> references
-> inheritance/type relations
-> chunks
-> compute hashes
-> emit FileFacts
```

Suggested normalized staging object:

```rust
pub struct FileFacts {
    pub file: File,
    pub symbols: Vec<Symbol>,
    pub imports: Vec<Import>,
    pub call_edges: Vec<CallEdge>,
    pub references: Vec<Reference>,
    pub chunks: Vec<Chunk>,
    pub diagnostics: Vec<ParseDiagnostic>,
}
```

## 6.3 DB write strategy

For each dirty file, writer executes atomic rewrite:

```text
BEGIN
  upsert files row
  delete old symbols/imports/calls/references/chunks for file
  insert new rows
  upsert FTS rows
  enqueue embedding jobs for changed chunks
COMMIT
```

### Why delete-and-rewrite per file?

Because:

- simpler correctness
- easy to reason about stale edges
- stable enough until profiling demands symbol-level diff

This is the right V1 choice.

---

## 6.4 Error handling by stage

### Stage 1 — workspace resolution errors

Examples:

- root path missing
- permission denied
- malformed config file

Policy:

- fail fast if no valid roots remain
- degrade per-root if some roots invalid but at least one valid root exists

### Stage 2 — scanning errors

Examples:

- unreadable directory
- symlink loop

Policy:

- skip problematic subtree
- record warning in run report

### Stage 3 — hashing errors

Examples:

- file deleted mid-run
- permission changed

Policy:

- mark file missing
- enqueue delete/tombstone if previously indexed

### Stage 4 — parse errors

Examples:

- broken syntax
- language grammar mismatch

Policy:

- broken syntax -> partial extraction if recoverable
- grammar mismatch / adapter panic -> mark parse failed and retain previous facts only if current file rewrite cannot safely replace them

Recommended default:

- for hard parse failure, remove stale facts and mark file failed, because stale facts are often more harmful than missing facts

### Stage 5 — extraction errors

Examples:

- unexpected node shape
- adapter assumption violated

Policy:

- catch at file boundary
- record adapter error
- continue run

### Stage 6 — DB write errors

Examples:

- SQLite busy timeout
- schema mismatch
- disk full

Policy:

- retry busy errors with bounded backoff
- fail run on schema mismatch / disk full
- transaction rollback preserves consistency

### Stage 7 — embedding queue errors

Policy:

- never fail structural indexing because embedding enqueue failed
- mark chunk embedding status accordingly

---

## 6.5 Performance targets and constraints

These are **engineering targets**, not guaranteed SLAs.

### P1 targets

#### Inventory / no-change pass

- workspace with 50k source candidates on SSD:
  - scan + prefilter target: **< 3s warm**
  - suspected-change hashing target when < 100 files dirty: **< 1s**

#### Single file incremental reindex

- TS/JS file <= 1k LOC:
  - parse + extract p50: **< 80ms**
  - parse + extract + DB commit p50: **< 150ms**

#### Medium repo cold index

- 10k mixed source files, embeddings disabled:
  - full structural index target: **< 90s** on 8-core laptop SSD

#### Write path

- batch transaction size: 50-200 files depending on memory
- writer should keep DB busy time negligible compared to parse stage

### Constraints

- SQLite single writer means parse parallelism is useful only if writer batching is efficient
- tree-sitter is fast, but import/call/reference normalization often dominates for TS/JS
- full cross-file semantic resolution should remain bounded; do not accidentally build a compiler in V1

---

## 7. Public Rust API surface

The goal là expose stable domain APIs cho Graph Engine và Query Engine, while keeping parser internals hidden.

## 7.1 What to expose

### Indexer service API

```rust
pub struct IndexWorkspaceRequest {
    pub roots: Vec<std::path::PathBuf>,
    pub force_full: bool,
    pub max_files: Option<usize>,
    pub include_embeddings: bool,
}

pub struct IndexPathsRequest {
    pub workspace_id: WorkspaceId,
    pub paths: Vec<std::path::PathBuf>,
    pub expand_dependents: bool,
}

pub struct IndexReport {
    pub workspace_id: WorkspaceId,
    pub run_id: String,
    pub scanned_files: u64,
    pub changed_files: u64,
    pub reindexed_files: u64,
    pub deleted_files: u64,
    pub queued_embeddings: u64,
    pub warnings: Vec<String>,
    pub duration_ms: u128,
}

pub trait IndexerApi {
    fn index_workspace(&self, req: IndexWorkspaceRequest) -> anyhow::Result<IndexReport>;
    fn index_paths(&self, req: IndexPathsRequest) -> anyhow::Result<IndexReport>;
    fn invalidate_paths(&self, workspace_id: WorkspaceId, paths: Vec<std::path::PathBuf>) -> anyhow::Result<()>;
    fn status(&self, workspace_id: WorkspaceId) -> anyhow::Result<IndexState>;
}
```

### Read repository API for Graph Engine / Query Engine

```rust
pub trait IndexReadRepository {
    fn get_file(&self, file_id: FileId) -> anyhow::Result<Option<File>>;
    fn get_file_by_path(&self, workspace_id: WorkspaceId, rel_path: &str) -> anyhow::Result<Option<File>>;
    fn list_symbols_by_file(&self, file_id: FileId) -> anyhow::Result<Vec<Symbol>>;
    fn find_symbols_by_name(&self, workspace_id: WorkspaceId, name: &str) -> anyhow::Result<Vec<Symbol>>;
    fn get_imports_for_file(&self, file_id: FileId) -> anyhow::Result<Vec<Import>>;
    fn get_callers(&self, symbol_id: SymbolId) -> anyhow::Result<Vec<CallEdge>>;
    fn get_callees(&self, symbol_id: SymbolId) -> anyhow::Result<Vec<CallEdge>>;
    fn get_references(&self, symbol_id: SymbolId) -> anyhow::Result<Vec<Reference>>;
    fn get_chunks_for_file(&self, file_id: FileId) -> anyhow::Result<Vec<Chunk>>;
    fn get_chunks_for_symbol(&self, symbol_id: SymbolId) -> anyhow::Result<Vec<Chunk>>;
}
```

### Progress subscription

```rust
pub trait IndexProgressApi {
    type Receiver;
    fn subscribe(&self, workspace_id: WorkspaceId) -> Self::Receiver;
}
```

## 7.2 What to encapsulate

These should remain internal to indexer/parser crates:

- raw tree-sitter `Node`, `TreeCursor`, query patterns
- ignore matcher internals
- hash prefilter heuristics
- parser pool lifecycle
- DB transaction batching details
- adapter-specific fallback logic
- salvage heuristics for broken code

### Why encapsulate?

Để Graph Engine và Query Engine không bị buộc vào tree-sitter specifics.  
Nếu sau này thêm language server / compiler-assisted refinement, public API không cần vỡ.

---

## 8. Reference data flow diagrams

## 8.1 Cold index flow

```text
CLI/TS layer
  -> Rust IndexerApi.index_workspace()
    -> resolve roots/packages
    -> scan inventory
    -> compare snapshot
    -> parse/extract all dirty files
    -> write SQLite facts
    -> queue embeddings
    -> return IndexReport
```

## 8.2 Incremental edit flow

```text
file changed
  -> FileChangeEvent::Modified
    -> hash compare
    -> dirty file
    -> if public_api_hash changed: expand dependents
    -> reparse changed + dependent files
    -> rewrite facts for those files only
    -> keep rest of index intact
```

## 8.3 Evidence path dependency

```text
source file
  -> parser tree
  -> symbols/imports/calls/references/chunks
  -> SQLite normalized facts
  -> Graph Engine traversals
  -> Query Engine result set
  -> Evidence Builder packet
  -> LLM answer context
```

---

## 9. Recommended implementation order

### Phase 1 — minimal viable structural engine

1. workspace scanner + ignore handling
2. TS/JS adapter
3. file/symbol/import/chunk schema
4. full workspace indexing
5. basic incremental by content hash

### Phase 2 — graph-grade extraction

6. calls + references
7. public_api_hash + dependent invalidation
8. barrel/re-export/type-only import support

### Phase 3 — language expansion

9. Python adapter
10. Go adapter
11. Rust adapter

### Phase 4 — performance + retrieval optimization

12. changed-range-aware optimizations
13. better name binding
14. embedding queue integration
15. watch mode

---

## 10. Key design decisions summary

1. **Atomic unit of indexing = file; atomic unit of meaning = symbol/chunk/edge.**  
   Đây là balance đúng giữa correctness, simplicity, và future performance.

2. **Chunk overlap là structural metadata, không phải duplicated text windows.**  
   Điều này giữ retrieval sạch hơn và giảm embedding waste.

3. **Public API expose normalized facts, not tree-sitter internals.**  
   Đây là điều kiện để Graph Engine / Query Engine ổn định lâu dài.

4. **Dependency-aware invalidation dựa trên `public_api_hash`, không chỉ `content_hash`.**  
   Nếu không có lớp này, graph sẽ stale khi exported contracts đổi.

5. **TS/JS adapter là priority 1 và phải support modern edge cases ngay từ đầu** như dynamic imports, re-exports, barrel files, type-only imports, conditional requires.

---

## 11. Final recommendation

Nếu DH muốn “deep codebase understanding” là lợi thế cạnh tranh thật, thì Indexer + Parser phải được xây như một **structural intelligence subsystem**, không phải utility đọc file.

The implementation should therefore optimize for:

- deterministic normalized facts
- incremental correctness
- workspace realism (monorepo, multi-root, polyglot)
- parser recovery on broken code
- graph-ready and evidence-ready outputs

Đó là nền tảng bắt buộc trước khi tối ưu các lớp cao hơn như retrieval ranking, evidence packaging, hay agent reasoning.
