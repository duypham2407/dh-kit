# Deep Dive 03 — Graph Engine Design (DH)

**Date:** 2026-04-13  
**Author:** System Architect  
**Status:** Implementation guide / design deep dive  
**Related context:** `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`

---

## 0. Purpose / Mục tiêu tài liệu

Tài liệu này đi từ mức **architecture** xuống mức **implementation contract** cho Graph Engine của DH.

Graph Engine là layer biến parser output thành một **queryable code knowledge substrate** để TS workflow layer, Evidence Builder, và cuối cùng LLM có thể reason trên codebase giống developer thật.

Core principle:

> DH không nên chỉ “search text”. DH phải traverse được structural relationships: symbol ownership, imports, calls, references, type usage, and impact surface.

---

## 1. Graph Architecture Overview

### 1.1 Role of Graph Engine in the whole pipeline

```text
Workspace files
  -> Scanner / Incremental Indexer
    -> Parser (tree-sitter + language adapters)
      -> Extraction IR
        -> Resolver phase
          -> Graph Builder
            -> Graph Store (SQLite + caches)
              -> Query Engine
                -> Evidence Builder
                  -> TS Workflow / Agent layer
```

### 1.2 Parser output -> Graph input contract

Parser không ghi graph trực tiếp. Parser xuất ra một **Language-Agnostic Extraction IR**.

```rust
pub struct ParsedFileIr {
    pub file: FileFacts,
    pub imports: Vec<ImportFact>,
    pub exports: Vec<ExportFact>,
    pub symbols: Vec<SymbolFact>,
    pub inheritance: Vec<InheritanceFact>,
    pub implementations: Vec<ImplementationFact>,
    pub call_sites: Vec<CallSiteFact>,
    pub references: Vec<ReferenceFact>,
    pub chunks: Vec<ChunkFact>,
    pub diagnostics: Vec<ParseDiagnostic>,
}
```

Trong design này, Graph Engine consume `ParsedFileIr`, chạy thêm **resolution passes** rồi materialize thành graph.

### 1.3 Recommendation: unified graph model vs 4 separate graphs

#### Option A — 4 separate physical graphs

Pros:
- mỗi graph tuned riêng
- implementation đơn giản lúc đầu

Cons:
- duplicate nodes rất nhiều
- multi-hop query khó (`impactAnalysis`, `traceFlow` phải cross-join graph manually)
- invalidation phức tạp vì mỗi graph recompute khác nhau
- consistency risk cao

#### Option B — 1 fully unified generic graph only

Pros:
- single source of truth
- multi-graph traversal tự nhiên

Cons:
- generic quá thì query chậm
- type safety giảm
- debugging khó nếu mọi thứ nhét vào 1 table + JSON

#### Recommended architecture — **Unified canonical graph store + 4 logical graph projections**

Đây là lựa chọn khuyến nghị.

```text
Canonical storage:
  - graph_nodes
  - graph_edges
  - files
  - symbols
  - chunks

Logical projections:
  - Symbol Graph
  - Import/Dependency Graph
  - Call Graph
  - Reference Graph

Acceleration layers:
  - adjacency indexes
  - materialized lookup tables
  - in-memory caches
```

**Why this is enough / tại sao đủ tốt:**

1. **One identity model** cho File / Symbol / Chunk.
2. **One revision model** cho incremental updates.
3. **One traversal substrate** cho impact analysis và evidence extraction.
4. Vẫn giữ được **specialized APIs** và **specialized indexes** cho từng graph type.

### 1.4 Canonical node model

DH chỉ cần 3 top-level node families trong graph core: **File**, **Symbol**, **Chunk**.

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum NodeKind {
    File,
    Symbol,
    Chunk,
}
```

#### File node subtypes

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum FileKind {
    Source,
    Declaration,
    Test,
    Config,
    Generated,
    Barrel,
    ExternalModuleStub,
    Virtual,
}
```

#### Symbol node subtypes (full enum)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SymbolKind {
    Module,
    Namespace,
    Class,
    Interface,
    Struct,
    Trait,
    Enum,
    EnumMember,
    TypeAlias,
    Function,
    Method,
    Constructor,
    Field,
    Property,
    Variable,
    Constant,
    Parameter,
    GenericParameter,
    Macro,
    ImplBlock,
    Unknown,
}
```

#### Chunk node subtypes (full enum)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ChunkKind {
    FileHeader,
    ImportBlock,
    ExportBlock,
    NamespaceBlock,
    TypeBlock,
    ClassBlock,
    MethodBody,
    FunctionBody,
    VariableInit,
    TestBlock,
    DocBlock,
    StatementRegion,
    Unknown,
}
```

### 1.5 Canonical edge model

Graph Engine dùng **edge family + edge detail**. Family giữ model stable; detail encode nuance cho query ranking.

#### Edge family enum

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EdgeKind {
    Imports,
    Calls,
    References,
    Contains,
    Extends,
    Implements,
    ReExports,
    TypeReferences,
    Exports,
    DefinesChunk,
}
```

#### Edge detail enum (full operational enum)

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum EdgeDetail {
    None,

    // Imports
    ImportStaticNamed,
    ImportStaticDefault,
    ImportStaticNamespace,
    ImportTypeOnly,
    ImportDynamic,
    ImportRequire,

    // Calls
    CallDirect,
    CallMethod,
    CallConstructor,
    CallCallback,
    CallHigherOrder,
    CallEventEmit,
    CallUnknownDynamic,

    // References
    RefRead,
    RefWrite,
    RefReadWrite,
    RefTypeOnly,
    RefArgument,
    RefReExport,
    RefDecorator,

    // Contains / exports
    ContainLexical,
    ContainOwnership,
    ExportNamed,
    ExportDefault,
    ExportStar,

    // Inheritance
    ExtendClass,
    ExtendInterface,
    ImplementInterface,
    ImplementTrait,

    // Type references
    TypeRefAnnotation,
    TypeRefConstraint,
    TypeRefReturn,
    TypeRefHeritage,
}
```

### 1.6 Graph identity model

Every node cần stable identity across re-index passes.

```rust
pub type FileId = i64;
pub type SymbolId = i64;
pub type ChunkId = i64;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum NodeId {
    File(FileId),
    Symbol(SymbolId),
    Chunk(ChunkId),
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct StableSymbolKey {
    pub file_path: String,
    pub namespace_path: Vec<String>,
    pub local_name: String,
    pub kind: SymbolKind,
    pub signature_hash: String,
}
```

`StableSymbolKey` phải survive formatting change, line movement, và minor unrelated edits.

### 1.7 Canonical graph data flow

```text
ParsedFileIr
  -> symbol creation
  -> import resolution
  -> export resolution
  -> call target resolution
  -> reference target resolution
  -> chunk linking
  -> edge confidence scoring
  -> atomic graph revision commit
```

---

## 2. Symbol Graph — Detailed Design

### 2.1 Purpose

Symbol Graph answer các câu hỏi kiểu:

- symbol này defined ở đâu?
- symbol này thuộc class/file nào?
- exported hay private?
- method này override/implement cái gì?
- symbol tree của file/module là gì?

### 2.2 Symbol node schema

```rust
#[derive(Debug, Clone)]
pub struct SymbolNode {
    pub id: SymbolId,
    pub stable_key: StableSymbolKey,
    pub file_id: FileId,
    pub parent_symbol_id: Option<SymbolId>,
    pub kind: SymbolKind,
    pub local_name: String,
    pub qualified_name: String,
    pub display_name: String,
    pub language: String,
    pub visibility: Visibility,
    pub export_style: ExportStyle,
    pub namespace_path: Vec<String>,
    pub signature_text: Option<String>,
    pub signature_hash: String,
    pub type_params: Vec<TypeParam>,
    pub start_byte: u32,
    pub end_byte: u32,
    pub start_line: u32,
    pub end_line: u32,
    pub doc_summary: Option<String>,
    pub is_ambient: bool,
    pub is_generated: bool,
    pub overload_index: Option<u16>,
    pub overload_group: Option<String>,
    pub metadata: SymbolMetadata,
}
```

Supporting enums:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Visibility {
    Public,
    Protected,
    Private,
    Internal,
    Package,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportStyle {
    None,
    Named,
    Default,
    Star,
    ReExported,
}
```

### 2.3 Symbol edge schema

Relevant edges trong Symbol Graph:

- `File -> Symbol : Contains`
- `Symbol -> Symbol : Contains`
- `File/Symbol -> Symbol : Exports`
- `Symbol -> Symbol : Extends`
- `Symbol -> Symbol : Implements`
- `Symbol -> Symbol : TypeReferences`

```rust
#[derive(Debug, Clone)]
pub struct GraphEdge {
    pub id: i64,
    pub src: NodeId,
    pub dst: NodeId,
    pub kind: EdgeKind,
    pub detail: EdgeDetail,
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub span: Option<TextSpan>,
    pub confidence: f32,
    pub revision: i64,
    pub metadata: EdgeMetadata,
}
```

### 2.4 Containment hierarchy

Canonical hierarchy:

```text
File
  -> Namespace / Module (optional)
    -> Class / Interface / TypeAlias / Function / Variable
      -> Constructor / Method / Property / Field / Parameter / GenericParameter
```

Ví dụ:

```text
src/auth/service.ts
  contains class AuthService
    contains constructor()
    contains method login(user, password)
      contains parameter user
      contains parameter password
    contains property tokenStore
  exports AuthService
```

Containment rules:

1. `File -> top-level symbols` luôn explicit.
2. `Class -> method/field/property/constructor` explicit.
3. `Function -> parameter/generic parameter` explicit nếu cần navigation.
4. Local variable **không mặc định** được promote thành Symbol node toàn repo, trừ khi:
   - exported indirectly,
   - captured by closure and queried often,
   - needed for fine-grained reference graph mode.

**Recommendation:** Phase 1/2 chỉ index locals cho named function-scope bindings có analytic value; tránh explode node count.

### 2.5 Export / visibility modeling

Export và visibility là 2 khái niệm khác nhau.

- `visibility`: ngữ nghĩa lexical / language access control
- `export_style`: ngữ nghĩa module boundary

Examples:

- `private method loginInternal()` => `Visibility::Private`, `ExportStyle::None`
- `export class AuthService` => `Visibility::Public`, `ExportStyle::Named`
- `export default function` => `ExportStyle::Default`
- `export * from './types'` => `ReExports` edge, không tạo duplicate symbol mới trừ khi resolve alias map

### 2.6 Handling overloads

TypeScript/Rust style overloads phải group theo `overload_group`.

Model:

- mỗi overload signature = một `SymbolNode` riêng nếu parser trích được distinct declarations
- implementation body = symbol node riêng hoặc primary node flagged `is_implementation = true`
- shared `overload_group = stable hash(file + lexical owner + name)`

```text
function foo(x: string): A;
function foo(x: number): B;
function foo(x: string | number) { ... }
```

Stored as:

- `foo#overload:0`
- `foo#overload:1`
- `foo#impl`

Query behavior:

- `findSymbol(foo)` returns grouped result
- `gotoDefinition(callsite)` returns best overload + implementation body if ambiguity remains

### 2.7 Handling generics

Generic parameters should not be flattened into plain text only.

```rust
#[derive(Debug, Clone)]
pub struct TypeParam {
    pub name: String,
    pub constraint: Option<String>,
    pub default_type: Option<String>,
}
```

Type parameter usage also emits `TypeReferences` edges when possible.

Examples:

- `class Repo<T extends Entity>`
  - symbol `Repo`
  - child symbol `T` with kind `GenericParameter`
  - `TypeReferences(TypeRefConstraint)` from `T` to `Entity`

### 2.8 Handling type aliases

Type aliases phải tồn tại như first-class symbol vì impact của alias change rất lớn.

```text
type UserId = string
```

Model:
- SymbolKind::TypeAlias
- outgoing `TypeReferences` edge to any referenced type symbols
- references to alias tracked independently from references to underlying primitive

### 2.9 Handling namespaces / modules

TS namespace, Rust module, Python module đều map về symbol-ish containers.

Rules:

- file itself là `FileNode`
- explicit namespace/module declaration inside file => `SymbolKind::Namespace` or `Module`
- `qualified_name` built as `file/module/class/member`

This keeps `gotoDefinition("Foo.Bar.baz")` deterministic hơn.

### 2.10 Rust struct sketch — Symbol graph builder

```rust
pub struct SymbolGraphBuilder<'a> {
    interner: &'a mut StringInterner,
}

impl<'a> SymbolGraphBuilder<'a> {
    pub fn build(
        &mut self,
        ir: &ParsedFileIr,
        resolver: &ResolutionContext,
    ) -> SymbolGraphDelta {
        // create / update symbols
        // create containment edges
        // create export edges
        // create extends/implements/type refs
        // return delta for transactional commit
        unimplemented!()
    }
}
```

---

## 3. Import / Dependency Graph — Detailed Design

### 3.1 Purpose

Import Graph answer:

- file này phụ thuộc file nào?
- ai phụ thuộc vào file này?
- circular dependency ở đâu?
- module boundary leak ở đâu?
- cross-package import có bypass public API không?

### 3.2 Graph scope

Primary nodes: `File`

Optional synthetic file nodes:
- package root entry file (`pkg:core@index.ts`)
- external module stub (`npm:react/index.d.ts`)

### 3.3 Import edge model

```rust
#[derive(Debug, Clone)]
pub struct ImportEdgeMeta {
    pub raw_specifier: String,
    pub resolved_path: Option<String>,
    pub import_names: Vec<String>,
    pub is_type_only: bool,
    pub is_re_export: bool,
    pub resolution_kind: ImportResolutionKind,
    pub package_name: Option<String>,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ImportResolutionKind {
    Relative,
    AbsoluteProject,
    AliasPath,
    Barrel,
    PackageEntry,
    PackageSubpath,
    External,
    DynamicLiteral,
    DynamicExpression,
    Unresolved,
}
```

### 3.4 Module resolution strategies

#### Relative imports

Examples: `./foo`, `../bar/baz`

Strategy:
1. resolve against importing file directory
2. try extension variants (`.ts`, `.tsx`, `.js`, `.jsx`, `.rs`, etc.)
3. try directory index (`index.ts`, `mod.rs`, etc.)

#### Absolute project imports

Examples: `src/utils/auth`

Strategy:
- resolve against project root markers and language config
- maintain per-workspace path roots

#### Alias imports

Examples: `@/core/db`, `~shared/types`

Strategy:
- parse `tsconfig.paths`, bundler config, workspace config
- normalize alias prefix -> filesystem prefix
- cache in `module_resolution_cache`

#### Barrel imports

Examples: `import { A } from '@/core'` where `core/index.ts` re-exports from many files

Strategy:
- create `Imports` edge from importer -> barrel file
- create `ReExports` chain from barrel -> leaf file / symbol
- query layer may optionally “flatten” dependents to leaf module for impact analysis

#### Monorepo cross-package imports

Examples: `@acme/shared/auth` from `apps/web`

Strategy:
1. build workspace package table from root manifests
2. map package name -> package root
3. resolve export map / entrypoint
4. mark `package_name`, `package_boundary_crossed = true`

### 3.5 Circular dependency detection

Dependency cycle detection chạy trên file-level import graph.

Algorithm recommendation:
- run **Tarjan SCC** after batch update
- any SCC size > 1 => cycle
- self-loop dynamic import can also be flagged if same file imports itself indirectly

```text
A -> B -> C -> A
```

Store cycle summary table:

```rust
pub struct DependencyCycle {
    pub cycle_id: i64,
    pub files: Vec<FileId>,
    pub edge_count: usize,
    pub severity: CycleSeverity,
}
```

Severity heuristic:

- Low: type-only cycle only
- Medium: runtime static import cycle
- High: runtime cycle crosses package boundary or entrypoint

### 3.6 Dynamic import handling

Cases:

1. `import('./foo')` => resolvable literal
2. `import(modulePath)` => partially resolvable or unresolved
3. `require('./foo')` => CommonJS style

Rules:

- string literal dynamic import => create `Imports` edge with `EdgeDetail::ImportDynamic`
- expression dynamic import => create unresolved import record with candidate set if inferable
- unresolved dynamic import should still store raw expression text for evidence layer

### 3.7 Example import graph resolution flow

```text
ImportFact(raw='@/core')
  -> alias resolver => src/core/index.ts
  -> file kind = Barrel
  -> re-export scan => src/core/auth.ts, src/core/db.ts
  -> importer -> barrel edge
  -> barrel -> leaf re-export edges
```

### 3.8 Query semantics for dependents/dependencies

Need 2 modes:

1. **Declared dependency mode**: direct file import edges only
2. **Effective dependency mode**: flattened through barrels + re-exports + type-only filtering

This distinction matters a lot for accurate impact reports.

---

## 4. Call Graph — Detailed Design

### 4.1 Purpose

Call Graph is the main substrate for:

- “function này gọi gì?”
- “ai gọi function này?”
- “trace flow từ route -> service -> repo”
- “nếu đổi function này, behavioral blast radius là gì?”

### 4.2 Call graph nodes

Primary nodes:
- callable `Symbol` nodes: Function, Method, Constructor, Macro, possibly ImplBlock methods

Secondary records:
- `CallSiteFact` as occurrence data attached to edge metadata

```rust
#[derive(Debug, Clone)]
pub struct CallEdgeMeta {
    pub callsite_file_id: FileId,
    pub enclosing_symbol_id: SymbolId,
    pub line: u32,
    pub column: u32,
    pub text: String,
    pub receiver_type: Option<String>,
    pub arg_count: u16,
    pub dispatch: DispatchKind,
    pub confidence: f32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DispatchKind {
    Direct,
    Method,
    Constructor,
    Callback,
    HigherOrder,
    EventEmit,
    Dynamic,
}
```

### 4.3 Static call detection

#### Direct call

```ts
login(user)
```

Detectable when:
- identifier resolves to function symbol in lexical scope/import graph

#### Method call

```ts
authService.login(user)
```

Detectable when:
- receiver type inferred from declaration, constructor assignment, imported class, or field type
- method name matched on resolved type or trait/interface implementation set

#### Constructor call

```ts
new AuthService(repo)
```

Detectable when:
- callee identifier resolves to class/constructor symbol

### 4.4 Indirect / dynamic call detection — what DH can and cannot detect

#### DH can detect with reasonable confidence

1. **Callback passed directly to known higher-order function**

```ts
arr.map(transformUser)
```

If `map` semantic known and callback is symbol-resolved, create:
- caller -> callback edge with `CallHigherOrder`

2. **Inline callback invocation by local function**

```ts
function run(cb) { cb(); }
run(onDone)
```

If body of `run` is available and parameter `cb` invoked, then propagate edge:
- callsite owner -> `onDone` with lower confidence

3. **Basic event emitter pattern in same scope**

```ts
emitter.on('saved', handleSaved)
emitter.emit('saved')
```

If same emitter symbol and same literal event key are resolvable, create inferred event edge.

#### DH should mark as partial / cannot prove fully

1. dynamic property dispatch

```ts
obj[methodName]()
```

2. reflection / DI container runtime resolution
3. string-built event names
4. monkey patching / prototype mutation across files
5. JS metaprogramming via `Proxy`

For these, create unresolved callsite records, not fake precise edges.

### 4.5 Confidence scoring for call edges

Recommended confidence ladder:

| Situation | Score |
|---|---:|
| exact local function resolution | 1.00 |
| imported named function exact match | 0.98 |
| constructor exact class match | 0.97 |
| method with receiver type resolved exactly | 0.92 |
| interface/trait dispatch to single impl candidate | 0.85 |
| callback propagation through known local higher-order function | 0.72 |
| event emit/on literal matched same emitter symbol | 0.60 |
| dynamic import + callable export guess | 0.45 |
| unresolved dynamic dispatch candidate set | 0.20 |

Formula suggestion:

```text
confidence =
    base_resolution_score
  * receiver_type_score
  * symbol_uniqueness_score
  * cross_file_penalty
  * dynamic_penalty
```

### 4.6 Call depth and recursion handling

`callHierarchy` và `traceFlow` phải support bounded depth.

Rules:

- default depth: 3
- soft max: 6 for interactive CLI
- hard max: 12 for offline analysis / evidence builder
- recursion detected by visited `(symbol_id, path_hash)` set
- recursive edge is included once with `is_recursive = true`

### 4.7 Entry point detection

Entry point detection rất quan trọng cho “how does X work?”

Entry point classes:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntryPointKind {
    MainBinary,
    PublicExport,
    RouteHandler,
    TestCase,
    WorkerHandler,
    CliCommand,
    FrameworkHook,
}
```

Detection heuristics:

- `main.rs`, `main.ts`, `bin/*` => `MainBinary`
- exported top-level functions from public barrels => `PublicExport`
- route file naming / framework adapters => `RouteHandler`
- `describe/it/test` or `#[test]` => `TestCase`
- command registry patterns => `CliCommand`

### 4.8 Call graph construction phases

```text
Phase 1: collect callsites per file
Phase 2: lexical resolution inside same file/scope
Phase 3: imported symbol resolution
Phase 4: receiver type refinement
Phase 5: callback/event inference
Phase 6: unresolved candidate recording
```

### 4.9 Rust sketch — Call resolver

```rust
pub trait CallResolver {
    fn resolve_callsite(
        &self,
        callsite: &CallSiteFact,
        file_ctx: &FileResolutionContext,
        graph: &GraphSnapshot,
    ) -> Vec<ResolvedCallTarget>;
}

pub struct ResolvedCallTarget {
    pub target_symbol_id: Option<SymbolId>,
    pub candidate_symbol_ids: Vec<SymbolId>,
    pub dispatch: DispatchKind,
    pub confidence: f32,
    pub reason: String,
}
```

---

## 5. Reference Graph — Detailed Design

### 5.1 Purpose

Reference Graph answer:

- ai đang dùng symbol này?
- usage là read hay write?
- type-only hay runtime?
- symbol nào unused?
- đổi type alias này ảnh hưởng declaration nào?

### 5.2 Reference types

Canonical reference kinds:

```rust
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ReferenceKind {
    Read,
    Write,
    ReadWrite,
    TypeOnly,
    ReExport,
    Argument,
    Decorator,
}
```

### 5.3 Reference schema

Reference Graph khác Call Graph ở chỗ edge represent **usage occurrence**, không chỉ relation summary.

```rust
#[derive(Debug, Clone)]
pub struct ReferenceEdgeMeta {
    pub reference_kind: ReferenceKind,
    pub source_file_id: FileId,
    pub source_symbol_id: Option<SymbolId>,
    pub line: u32,
    pub column: u32,
    pub lexical_scope_symbol_id: Option<SymbolId>,
    pub is_cross_file: bool,
    pub confidence: f32,
}
```

Edge direction recommendation:

- `referencer_symbol -> referenced_symbol` for traversal convenience
- metadata carries concrete location

For file-level usages without enclosing symbol, `source_symbol_id = None` and `src = File(file_id)`.

### 5.4 Scope-aware reference resolution

Resolution order:

1. local lexical bindings
2. function parameters / generics
3. class members / `self` / `this`
4. namespace/module bindings
5. imported symbols
6. global builtins / external stubs

Must support shadowing:

```ts
const config = globalConfig;
function run(config: LocalConfig) {
  return config.port;
}
```

Inside `run`, `config.port` must point to parameter symbol, not outer variable.

### 5.5 Cross-file reference tracking

Flow:

```text
identifier use
  -> local scope miss
  -> import binding hit
  -> imported file symbol resolution
  -> create reference edge with is_cross_file = true
```

Type-only imports still create references, but `reference_kind = TypeOnly` and should be filterable from runtime impact queries.

### 5.6 Unused symbol detection

Unused detection should be graph-derived, not regex-derived.

Base rule:

```text
unused(symbol) if
  inbound_reference_count(runtime + type, excluding declaration/contains/self) == 0
  AND not exported public API
  AND not framework entrypoint
  AND not interface-required implementation
```

Need categories:

- `unused_private`
- `unused_exported_internal_only`
- `used_in_tests_only`
- `type_only_used`

### 5.7 Reference graph caveats

Need honesty:

- unresolved member expressions should not be silently attached to wrong symbol
- wildcard re-export may cause ambiguous reference fan-out
- generated code stubs may inflate “used” counts unless flagged `is_generated`

---

## 6. Query Engine — Detailed Design

### 6.1 Philosophy

Query Engine không expose raw SQL. Nó expose **intent-shaped operations** that map to developer mental models.

### 6.2 Core Rust interfaces

```rust
pub trait GraphStore {
    fn snapshot(&self) -> anyhow::Result<GraphSnapshot>;
    fn current_revision(&self) -> anyhow::Result<i64>;
}

pub trait QueryEngine {
    fn find_symbol(&self, query: FindSymbolQuery) -> anyhow::Result<Vec<SymbolMatch>>;
    fn goto_definition(&self, query: GotoDefinitionQuery) -> anyhow::Result<Option<DefinitionResult>>;
    fn find_references(&self, query: FindReferencesQuery) -> anyhow::Result<Vec<ReferenceResult>>;
    fn find_dependents(&self, query: FindDependentsQuery) -> anyhow::Result<DependencyTraversalResult>;
    fn find_dependencies(&self, query: FindDependenciesQuery) -> anyhow::Result<DependencyTraversalResult>;
    fn call_hierarchy(&self, query: CallHierarchyQuery) -> anyhow::Result<CallHierarchyResult>;
    fn trace_flow(&self, query: TraceFlowQuery) -> anyhow::Result<TraceFlowResult>;
    fn impact_analysis(&self, query: ImpactAnalysisQuery) -> anyhow::Result<ImpactAnalysisResult>;
}
```

### 6.3 Full query signatures

```rust
pub struct FindSymbolQuery {
    pub name: String,
    pub kinds: Option<Vec<SymbolKind>>,
    pub file_hint: Option<String>,
    pub namespace_hint: Option<String>,
    pub include_external: bool,
    pub limit: usize,
}

pub struct GotoDefinitionQuery {
    pub file_path: String,
    pub line: u32,
    pub column: u32,
    pub prefer_runtime_symbol: bool,
}

pub struct FindReferencesQuery {
    pub symbol_id: SymbolId,
    pub include_type_only: bool,
    pub include_tests: bool,
    pub limit: usize,
}

pub struct FindDependentsQuery {
    pub target: DependencyTarget,
    pub depth: usize,
    pub include_type_only: bool,
    pub flatten_re_exports: bool,
}

pub struct FindDependenciesQuery {
    pub target: DependencyTarget,
    pub depth: usize,
    pub include_type_only: bool,
    pub flatten_re_exports: bool,
}

pub struct CallHierarchyQuery {
    pub symbol_id: SymbolId,
    pub direction: CallDirection,
    pub depth: usize,
    pub min_confidence: f32,
    pub include_recursive: bool,
}

pub struct TraceFlowQuery {
    pub from: TraceAnchor,
    pub to: TraceAnchor,
    pub max_depth: usize,
    pub min_confidence: f32,
    pub allow_mixed_graph_hops: bool,
}

pub struct ImpactAnalysisQuery {
    pub target: ImpactTarget,
    pub max_depth: usize,
    pub include_importers: bool,
    pub include_callers: bool,
    pub include_references: bool,
    pub include_type_impact: bool,
}
```

Supporting types:

```rust
pub enum DependencyTarget {
    File(FileId),
    Symbol(SymbolId),
}

pub enum TraceAnchor {
    File(FileId),
    Symbol(SymbolId),
    EntryPoint(EntryPointKind),
}

pub enum ImpactTarget {
    File(FileId),
    Symbol(SymbolId),
}

pub enum CallDirection {
    Incoming,
    Outgoing,
    Both,
}
```

### 6.4 Query semantics

#### `findSymbol`

Use case: symbol lookup, fuzzy navigation, evidence seeding.

Ranking dimensions:
- exact name match > prefix > substring
- file hint boost
- export/public boost
- symbol kind match boost
- recently touched files boost (optional in session mode)

#### `gotoDefinition`

Resolution path:
1. locate token / AST node at cursor
2. resolve local binding or imported binding
3. if multiple candidates, rank by lexical scope + import alias + type context
4. return best definition + alternates

#### `findReferences`

Need stable ordering:
- same file first if near definition
- runtime refs before type-only refs unless caller requests otherwise
- exact lexical refs before inferred refs

#### `findDependents` / `findDependencies`

Operate primarily on import graph, but if target is symbol then map symbol -> declaring/exporting file plus re-export chain.

#### `callHierarchy`

Returns tree-ish graph, not strict tree if cycles exist.

#### `traceFlow`

Important: this is **path search**, not neighborhood search.

Default graph precedence:

1. call edges
2. import edges (bridge through module boundary)
3. reference edges (fallback for data flow hints)
4. type references (optional, lower weight)

#### `impactAnalysis`

This is weighted multi-graph expansion.

Output should separate:
- direct impact
- transitive runtime impact
- transitive type impact
- file/package blast radius summary

### 6.5 Query execution strategy: BFS vs DFS

Recommendation:

- `findDependencies`, `findDependents`, `callHierarchy(incoming/outgoing)` => **BFS**
- `traceFlow` => **bidirectional BFS**, fallback to bounded DFS for top-K path extraction
- `impactAnalysis` => **layered BFS with weighted frontier**

Reasoning:

- BFS gives shortest hop paths and predictable UX.
- DFS useful only for enumerating deeper alternative paths after shortest path found.

### 6.6 Cycle detection

Always maintain visited set:

```rust
type VisitedKey = (NodeId, EdgeKind);
```

For path queries, visited should be path-sensitive when needed:

```rust
type PathVisitedKey = (NodeId, u64 /* path fingerprint */);
```

Rule:
- neighborhood queries use node-level visited
- path queries use path-sensitive visited to avoid discarding valid alternative routes too early

### 6.7 Pseudocode — `findDependencies`

```text
function findDependencies(target, depth, includeTypeOnly):
  queue = [(target, 0)]
  visited = set(target)
  result = []

  while queue not empty:
    node, level = queue.pop_front()
    if level == depth:
      continue

    for edge in outgoing_import_edges(node):
      if !includeTypeOnly and edge.is_type_only:
        continue

      next = edge.target
      result.add(edge)

      if next not in visited:
        visited.add(next)
        queue.push_back((next, level + 1))

  return layered_result(result)
```

### 6.8 Pseudocode — `traceFlow`

```text
function traceFlow(from, to, maxDepth, minConfidence):
  leftFrontier = BFS frontier from source
  rightFrontier = BFS frontier from target (reverse traversable edges)
  leftVisited = {}
  rightVisited = {}

  for depth in 0..maxDepth:
    expand smaller frontier first
    skip edges with confidence < minConfidence
    if any node intersects between leftVisited and rightVisited:
      reconstruct path(s)
      rank paths
      return top_k_paths

  return no_path_with_nearest_frontier_summary
```

### 6.9 Pseudocode — `impactAnalysis`

```text
function impactAnalysis(target):
  seeds = normalize_target(target)
  frontier = priority queue seeded with (node, score=1.0, distance=0)
  visitedBestScore = {}

  while frontier not empty:
    item = pop_max_score(frontier)
    if item.distance > maxDepth:
      continue

    for edge in relevant_edges(item.node):
      propagated = item.score * edge_weight(edge.kind) * edge.confidence
      if propagated < threshold:
        continue

      if propagated > visitedBestScore[edge.target]:
        visitedBestScore[edge.target] = propagated
        frontier.push(edge.target, propagated, item.distance + 1)

  classify results into direct / transitive / type-only / package summaries
```

### 6.10 Result ranking and relevance scoring

General scoring model:

```text
result_score =
    graph_distance_weight
  * edge_confidence_product
  * symbol_specificity_boost
  * runtime_relevance_boost
  * session_context_boost
  - ambiguity_penalty
  - generated_code_penalty
```

Practical boosts:

- direct definition hit: +0.40
- same package: +0.10
- same file: +0.15 for references, -0.05 for impact breadth views
- test-only: -0.20 unless query intent is test-focused
- public exported API when asking architecture question: +0.20

### 6.11 Query caching strategy

Need 3 layers:

#### L1 — in-memory hot caches

- symbol name -> ids
- file path -> file id
- adjacency lists by `(node_id, edge_kind)`
- module resolution cache

#### L2 — prepared statement cache

- SQLite prepared queries reused across requests

#### L3 — result cache

Cache key:

```text
(query_type, normalized_params, graph_revision, session_profile)
```

Policy:
- TTL short for interactive path queries (5–30s)
- invalidated immediately on revision bump for affected file scopes
- can reuse across sessions only if same repo root + same graph revision

---

## 7. Evidence Builder Integration

### 7.1 Why Graph Engine must feed Evidence Builder directly

Evidence Builder needs more than “matching files”. Nó cần **causal neighborhood**.

Ví dụ query:

> “How does authentication work?”

Keyword search alone trả về `auth.ts`, `token.ts`, `login.ts`.  
Graph-aware evidence phải trả được:

- route entrypoint
- service core symbol
- repo/db dependency
- token helper
- critical call chain

### 7.2 Evidence builder inputs

```rust
pub struct EvidenceBuildInput {
    pub user_query: String,
    pub seed_symbols: Vec<SymbolId>,
    pub seed_files: Vec<FileId>,
    pub traversal_budget: TraversalBudget,
    pub token_budget: usize,
}
```

### 7.3 Subgraph extraction strategy

Recommended 4-step pipeline:

1. **Seed selection**
   - from `findSymbol`, semantic search, recent context
2. **Neighborhood expansion**
   - calls outward from entrypoints
   - imports outward for module structure
   - references inward for impact or ownership
3. **Compression / pruning**
   - keep top scoring nodes/edges only
   - collapse repetitive utility chains
4. **Chunk materialization**
   - map selected symbols -> chunks -> source excerpts

### 7.4 Subgraph extraction heuristics

Keep:
- nodes on shortest path between seed and high-value entrypoints
- exported/service/repo/controller style symbols
- high-confidence call edges
- edges that cross architectural boundaries

Drop or collapse:
- trivial getters/setters
- generic utility fanout with weak relevance
- generated files unless explicitly central

### 7.5 Graph-to-text serialization for LLM consumption

LLM không cần raw adjacency dump. Need structured narrative format.

Recommended serializer output:

```text
Graph Summary:
- Entry point: src/routes/login.ts::handleLogin
- Calls: handleLogin -> AuthService.login -> UserRepo.findByEmail -> PasswordHasher.verify
- Dependencies: AuthService imports UserRepo, TokenService
- Key references: AuthConfig read in AuthService constructor and token verification path

Relevant Symbols:
1. AuthService (class) [src/auth/service.ts:12]
   - exported named symbol
   - methods: login, validateToken, refresh
2. handleLogin (function) [src/routes/login.ts:8]
   - route handler, calls AuthService.login

Key Edges:
- handleLogin --calls(0.98)--> AuthService.login
- AuthService.login --calls(0.96)--> UserRepo.findByEmail
- AuthService.login --references(read)--> AuthConfig
```

Also support compact JSON form for TS prompt builder.

### 7.6 Chunk selection strategy

Chunk nodes bridge graph and retrieval.

Rules:

- if symbol selected, include owning body chunk
- if edge selected, include callsite/reference line window chunk
- if file selected only, include file header/import block + top ranked symbols

---

## 8. Incremental Graph Updates

### 8.1 Trigger model

When a file changes, not all graphs need full rebuild. But all **outgoing facts from that file** must be recomputed.

### 8.2 What must be recomputed when one file changes

For changed file `F`:

#### Always recompute

- file metadata/hash
- symbols declared in `F`
- chunks in `F`
- `Contains` edges from `F`
- `Exports` edges from `F`
- `Imports` / `ReExports` edges from `F`
- `Calls` edges whose callsites are inside `F`
- `References` edges whose usage sites are inside `F`
- `Extends` / `Implements` / `TypeReferences` from symbols in `F`

#### Potentially invalidate dependent files

- files importing exports from `F`
- files calling symbols whose signatures moved/renamed in `F`
- files referencing symbols removed from `F`
- barrels re-exporting `F`

### 8.3 Invalidation cascade strategy

Use 3-level cascade:

#### Level 0 — local replacement

Delete and rebuild all graph facts owned by file `F`.

#### Level 1 — first-order dependents mark-dirty

Mark these as needing selective re-resolution:
- direct importers of `F`
- direct re-exporters of `F`
- direct callers/referencers if target symbol stable keys disappeared

#### Level 2 — async transitive reconciliation

Background pass for:
- call inference candidates
- unused symbol counts
- SCC recalculation for dependency cycles
- cached impact summaries

### 8.4 Consistency guarantees

Recommended guarantee model:

1. **Atomic local consistency**
   - queries see either old or new state of `F`, never half-written state
2. **Strong first-order consistency**
   - direct import/export relationships recomputed synchronously before commit finishes
3. **Eventual transitive consistency**
   - deep inferred edges and secondary summaries may lag by one background cycle

Queries should expose warnings if stale areas exist:

```rust
pub struct QueryWarnings {
    pub graph_revision: i64,
    pub stale_files: Vec<FileId>,
    pub has_pending_reconciliation: bool,
}
```

### 8.5 Update transaction pattern

```text
begin transaction
  insert new revision row
  stage new file facts in temp tables
  delete prior owned rows for file F
  insert new rows
  mark dependents dirty
commit
run async reconciliation
```

This keeps read path simple under SQLite WAL.

---

## 9. Storage Model

### 9.1 Storage design principles

- local-first
- no external graph database required
- optimized for traversal + lookup, not arbitrary analytics only
- compact enough for laptop memory budgets
- supports revisioned incremental updates

### 9.2 SQLite schema

```sql
CREATE TABLE files (
  id                INTEGER PRIMARY KEY,
  path              TEXT NOT NULL UNIQUE,
  file_kind         TEXT NOT NULL,
  language          TEXT NOT NULL,
  package_name      TEXT,
  package_root      TEXT,
  hash              TEXT NOT NULL,
  size_bytes        INTEGER NOT NULL,
  last_modified_ms  INTEGER NOT NULL,
  last_indexed_rev  INTEGER NOT NULL,
  is_entrypoint     INTEGER NOT NULL DEFAULT 0,
  entrypoint_kind   TEXT,
  is_generated      INTEGER NOT NULL DEFAULT 0,
  is_barrel         INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE symbols (
  id                INTEGER PRIMARY KEY,
  stable_key        TEXT NOT NULL UNIQUE,
  file_id           INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  parent_symbol_id  INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  local_name        TEXT NOT NULL,
  qualified_name    TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  visibility        TEXT NOT NULL,
  export_style      TEXT NOT NULL,
  namespace_path    TEXT,
  signature_text    TEXT,
  signature_hash    TEXT NOT NULL,
  type_params_json  TEXT,
  overload_group    TEXT,
  overload_index    INTEGER,
  start_line        INTEGER NOT NULL,
  start_col         INTEGER NOT NULL,
  end_line          INTEGER NOT NULL,
  end_col           INTEGER NOT NULL,
  start_byte        INTEGER NOT NULL,
  end_byte          INTEGER NOT NULL,
  is_ambient        INTEGER NOT NULL DEFAULT 0,
  is_generated      INTEGER NOT NULL DEFAULT 0,
  doc_summary       TEXT,
  last_indexed_rev  INTEGER NOT NULL
);

CREATE TABLE chunks (
  id                INTEGER PRIMARY KEY,
  file_id           INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  symbol_id         INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  kind              TEXT NOT NULL,
  content_hash      TEXT NOT NULL,
  start_line        INTEGER NOT NULL,
  start_col         INTEGER NOT NULL,
  end_line          INTEGER NOT NULL,
  end_col           INTEGER NOT NULL,
  token_count_est   INTEGER,
  summary           TEXT,
  last_indexed_rev  INTEGER NOT NULL
);

CREATE TABLE graph_edges (
  id                INTEGER PRIMARY KEY,
  src_kind          TEXT NOT NULL,
  src_id            INTEGER NOT NULL,
  dst_kind          TEXT NOT NULL,
  dst_id            INTEGER NOT NULL,
  edge_kind         TEXT NOT NULL,
  edge_detail       TEXT NOT NULL,
  source_file_id    INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  source_symbol_id  INTEGER REFERENCES symbols(id) ON DELETE CASCADE,
  line              INTEGER,
  col               INTEGER,
  confidence        REAL NOT NULL DEFAULT 1.0,
  is_type_only      INTEGER NOT NULL DEFAULT 0,
  is_inferred       INTEGER NOT NULL DEFAULT 0,
  metadata_json     TEXT,
  last_indexed_rev  INTEGER NOT NULL
);

CREATE TABLE graph_revisions (
  revision_id       INTEGER PRIMARY KEY,
  created_at_ms     INTEGER NOT NULL,
  reason            TEXT NOT NULL,
  changed_files     TEXT NOT NULL
);

CREATE TABLE dirty_files (
  file_id           INTEGER PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
  reason            TEXT NOT NULL,
  marked_at_ms      INTEGER NOT NULL
);

CREATE TABLE module_resolution_cache (
  importer_file_id  INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  raw_specifier     TEXT NOT NULL,
  resolved_file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,
  resolution_kind   TEXT NOT NULL,
  confidence        REAL NOT NULL,
  last_indexed_rev  INTEGER NOT NULL,
  PRIMARY KEY (importer_file_id, raw_specifier)
);
```

### 9.3 Index strategy for common query patterns

```sql
CREATE INDEX idx_symbols_name_kind ON symbols(local_name, kind);
CREATE INDEX idx_symbols_qualified_name ON symbols(qualified_name);
CREATE INDEX idx_symbols_file_parent ON symbols(file_id, parent_symbol_id);
CREATE INDEX idx_symbols_overload_group ON symbols(overload_group);

CREATE INDEX idx_edges_src ON graph_edges(src_kind, src_id, edge_kind);
CREATE INDEX idx_edges_dst ON graph_edges(dst_kind, dst_id, edge_kind);
CREATE INDEX idx_edges_file_kind ON graph_edges(source_file_id, edge_kind);
CREATE INDEX idx_edges_symbol_kind ON graph_edges(source_symbol_id, edge_kind);
CREATE INDEX idx_edges_detail_conf ON graph_edges(edge_kind, edge_detail, confidence);

CREATE INDEX idx_files_path ON files(path);
CREATE INDEX idx_files_package ON files(package_name, path);
CREATE INDEX idx_files_entrypoint ON files(is_entrypoint, entrypoint_kind);

CREATE INDEX idx_chunks_symbol ON chunks(symbol_id);
CREATE INDEX idx_chunks_file_lines ON chunks(file_id, start_line, end_line);

CREATE INDEX idx_module_resolve_specifier ON module_resolution_cache(raw_specifier, resolution_kind);
```

### 9.4 Query patterns and SQL examples

#### Direct outgoing edges

```sql
SELECT dst_kind, dst_id, edge_kind, edge_detail, confidence, metadata_json
FROM graph_edges
WHERE src_kind = ? AND src_id = ? AND edge_kind = ?
ORDER BY confidence DESC;
```

#### Incoming references

```sql
SELECT src_kind, src_id, line, col, confidence, metadata_json
FROM graph_edges
WHERE dst_kind = 'Symbol' AND dst_id = ? AND edge_kind = 'References'
ORDER BY is_type_only ASC, confidence DESC, source_file_id ASC, line ASC;
```

#### Recursive dependents via CTE

```sql
WITH RECURSIVE dep_tree(src_id, dst_id, depth) AS (
  SELECT src_id, dst_id, 1
  FROM graph_edges
  WHERE edge_kind = 'Imports' AND dst_kind = 'File' AND dst_id = :target

  UNION ALL

  SELECT e.src_id, e.dst_id, dep_tree.depth + 1
  FROM graph_edges e
  JOIN dep_tree ON e.dst_id = dep_tree.src_id
  WHERE e.edge_kind = 'Imports' AND dep_tree.depth < :max_depth
)
SELECT * FROM dep_tree;
```

### 9.5 In-memory cache layer design

Need memory tier above SQLite.

```rust
pub struct GraphCaches {
    pub file_path_to_id: moka::sync::Cache<String, FileId>,
    pub symbol_name_to_ids: moka::sync::Cache<String, Arc<Vec<SymbolId>>>,
    pub adjacency_out: moka::sync::Cache<(NodeId, EdgeKind), Arc<Vec<GraphEdge>>>,
    pub adjacency_in: moka::sync::Cache<(NodeId, EdgeKind), Arc<Vec<GraphEdge>>>,
    pub module_resolution: moka::sync::Cache<(FileId, String), Arc<ResolvedImport>>,
    pub query_results: moka::sync::Cache<QueryCacheKey, Arc<QueryCacheValue>>,
}
```

Cache invalidation by revision:

- file-local caches evicted on changed file
- symbol name cache evicted when symbol set in file changes
- query results evicted if touches dirty files or revision mismatch

---

## 10. Performance Targets

### 10.1 Latency targets by operation type

Interactive CLI target = p50 fast, p95 still usable.

| Operation | p50 target | p95 target | Notes |
|---|---:|---:|---|
| `findSymbol` exact | < 10 ms | < 30 ms | hot cache path |
| `gotoDefinition` local/imported | < 15 ms | < 50 ms | includes token resolution |
| `findReferences` symbol | < 25 ms | < 120 ms | large fanout may paginate |
| `findDependencies` depth 2 | < 20 ms | < 80 ms | BFS on file graph |
| `findDependents` depth 2 | < 25 ms | < 90 ms | reverse index critical |
| `callHierarchy` depth 3 | < 40 ms | < 150 ms | confidence-filtered traversal |
| `traceFlow` top-3 paths | < 60 ms | < 250 ms | bidirectional BFS |
| `impactAnalysis` depth 4 | < 80 ms | < 400 ms | weighted multi-graph traversal |
| evidence subgraph extraction | < 120 ms | < 500 ms | before chunk loading |

### 10.2 Memory budget targets

Approximate budgets for graph resident working set on laptop-class machine.

| Repo size | Files | Estimated symbols | Estimated edges | Hot memory target |
|---|---:|---:|---:|---:|
| Small | 1K | 25K–60K | 120K–350K | 80–150 MB |
| Medium | 10K | 250K–700K | 1.5M–4M | 400–900 MB |
| Large | 100K | 2.5M–7M | 15M–40M | 2–6 GB |

Design implication:

- full graph does **not** need to be fully memory resident
- SQLite is source of truth
- caches keep hot adjacency and symbol lookup only

### 10.3 Indexing throughput targets

Targets assume TS/JS first, moderate laptop CPU.

| Task | Target |
|---|---:|
| cold index parse+extract | 300–800 files/sec |
| cold graph materialization | 200–500 files/sec |
| hot incremental single-file update | 10–50 ms/file typical |
| first-order dependent reconciliation | < 250 ms for common cases |
| SCC cycle recompute after small change | < 500 ms for 10K-file repo |

### 10.4 Performance guardrails

Need explicit safeguards:

- cap top-K path results in trace queries
- paginate reference fanout > 5K
- skip low-confidence dynamic edges by default
- collapse utility hubs during impact analysis
- maintain per-query node expansion budget

---

## 11. Recommended Internal Module Layout (Rust)

```text
src/graph/
  mod.rs
  ids.rs
  model.rs              # nodes, edges, enums
  ir.rs                 # ParsedFileIr bridge contracts
  builders/
    symbol.rs
    imports.rs
    calls.rs
    references.rs
  resolve/
    scope.rs
    modules.rs
    calls.rs
    references.rs
  store/
    sqlite.rs
    cache.rs
    revision.rs
  query/
    engine.rs
    ranking.rs
    traversal.rs
    impact.rs
  evidence/
    subgraph.rs
    serialize.rs
  incremental/
    updater.rs
    invalidation.rs
    reconcile.rs
```

---

## 12. End-to-End Example Flow

User asks:

> “trace auth flow from CLI command to token generation”

Execution:

```text
1. TS layer sends query.traceFlow
2. Query engine resolves anchors:
   - source => CliCommand entrypoint symbol
   - target => TokenService.generate or token helper cluster
3. Bidirectional BFS on call graph
4. Import graph used to bridge unresolved exported wrappers
5. Reference graph used to enrich config/data usage
6. Top 3 paths ranked by confidence and architectural relevance
7. Evidence builder extracts subgraph + chunks
8. Serializer emits concise graph-to-text narrative for LLM
```

Expected output shape:

```text
Path 1 (confidence 0.91):
cli/auth.ts::runLogin
  -> auth/controller.ts::handleLogin
  -> auth/service.ts::AuthService.login
  -> auth/token.ts::TokenService.generate

Supporting dependencies:
- AuthService imports UserRepo and TokenService
- AuthConfig referenced in login and generate paths
```

---

## 13. Key Decisions / Final Recommendation

### Decision 1

Use **one canonical graph store** with **four logical graph projections**, not four isolated stores.

### Decision 2

Keep **File / Symbol / Chunk** as the only top-level node families. Encode nuance through typed metadata and edge detail enums, not through uncontrolled node explosion.

### Decision 3

Treat **confidence** and **staleness** as first-class data. DH phải honest about what it can prove statically and what is inferred.

### Decision 4

Optimize the engine for **interactive traversal queries** first: symbol lookup, references, dependencies, call hierarchy, trace flow, impact analysis.

### Decision 5

Graph Engine is not only for navigation. Nó là substrate để build **evidence packets** for LLM, nên subgraph extraction và graph-to-text serialization là part of the design, không phải addon.

---

## 14. Implementation Priorities

### Phase A — Minimum viable graph core

- files / symbols / graph_edges tables
- Symbol Graph
- Import Graph
- `findSymbol`, `gotoDefinition`, `findReferences`, `findDependencies`, `findDependents`

### Phase B — Runtime understanding depth

- Call Graph static resolution
- entrypoint detection
- confidence scoring
- `callHierarchy`, basic `traceFlow`

### Phase C — Evidence-grade intelligence

- Reference Graph full fidelity
- impact analysis
- evidence subgraph extraction
- graph-to-text serializer

### Phase D — Scale and correctness hardening

- incremental invalidation cascade
- SCC cycle detection
- background reconciliation
- cache tuning + benchmark harness

---

## 15. Closing note

Nếu làm đúng, Graph Engine sẽ là phần tạo ra moat thật cho DH.

Search tốt giúp “find code”.  
Graph tốt giúp “understand code”.  
Evidence-grade graph + query engine mới giúp “reason about codebase like a real engineer”.
