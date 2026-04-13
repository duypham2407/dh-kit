# System Architecture Analysis: AI CLI trên nền OpenCode — Rust + TypeScript

**Date:** 2026-04-13
**Author:** System Architect
**Status:** Reference architecture for discussion and planning
**Context:** DH app — AI CLI phát triển sâu về đọc hiểu codebase + multi-agent workflow, trên nền OpenCode.ai

---

## PHẦN I — BÀI TOÁN THẬT SỰ LÀ GÌ

### App này không phải chatbot đọc file

Nhiều AI CLI hiện tại chỉ là:

```
đọc file → nhét vào prompt → gọi LLM → trả lời
```

Cách đó không scale vì:

- repo lớn → context window không đủ
- không hiểu cấu trúc → trả lời mơ hồ
- không hiểu flow → trace sai
- không có evidence → hallucinate

### App này phải là: AI hiểu code như developer hiểu code

Một developer giỏi khi đọc codebase mới sẽ:

1. **Scan structure** — nhìn folder, file, entry points
2. **Build mental model** — module nào làm gì, phụ thuộc gì
3. **Trace flows** — từ user input → qua những layer nào → đến output
4. **Identify patterns** — architecture pattern, naming convention, error handling style
5. **Reason about impact** — nếu sửa chỗ này thì ảnh hưởng chỗ nào

App cần làm được tất cả 5 bước này, không chỉ bước 1.

### 2 bài toán lõi

#### Bài toán 1: Code Understanding Engine

> Làm sao để máy "hiểu" codebase ở mức structural + semantic, không chỉ text search?

#### Bài toán 2: Multi-Agent Workflow Engine

> Làm sao để nhiều agent phối hợp như team dev thật, với quy trình rõ, handoff rõ, quality gate rõ?

**Bài toán 1 là nền tảng. Bài toán 2 xây trên bài toán 1.**

Nếu code understanding yếu → agent sẽ làm việc trên thông tin sai → workflow đẹp mấy cũng vô nghĩa.

---

## PHẦN II — KIẾN TRÚC TỔNG THỂ

### Nguyên tắc nền

#### 1. Tách rõ 4 lớp

```
┌─────────────────────────────────────┐
│  Layer 4: Interface (CLI)           │  ← mỏng nhất
├─────────────────────────────────────┤
│  Layer 3: Brain (Agents + Workflow) │  ← TS
├─────────────────────────────────────┤
│  Layer 2: Intelligence (Understanding) │  ← Rust
├─────────────────────────────────────┤
│  Layer 1: Foundation (Runtime + Storage) │  ← Rust
└─────────────────────────────────────┘
```

#### 2. Mỗi lớp có 1 nhiệm vụ duy nhất

| Lớp | Nhiệm vụ | Ngôn ngữ |
|---|---|---|
| Interface | Nhận input, stream output | Rust (CLI) + TS (format) |
| Brain | Suy nghĩ, lập kế hoạch, phối hợp agent | TS |
| Intelligence | Hiểu code: parse, index, graph, search, evidence | Rust |
| Foundation | Runtime, storage, process, transport | Rust |

#### 3. Dữ liệu chảy theo 1 hướng chính

```
User query
  → Brain phân tích intent
    → Brain gọi Intelligence lấy evidence
      → Intelligence query từ Foundation/Storage
    → Brain build context + gọi LLM
  → Brain trả kết quả
→ Interface stream về user
```

### Sơ đồ kiến trúc chi tiết

```
┌─────────────────────────────────────────────────────┐
│                    DH Binary (Rust)                  │
│                                                     │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ CLI     │  │ Process  │  │ JSON-RPC Server    │ │
│  │ Parser  │  │ Manager  │  │ (for TS layer)     │ │
│  └────┬────┘  └────┬─────┘  └─────────┬──────────┘ │
│       │            │                   │            │
│  ┌────┴────────────┴───────────────────┴──────────┐ │
│  │           Rust Core Engine                     │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Indexer  │ │ Parser   │ │ Graph Engine   │ │ │
│  │  │          │ │ (tree-   │ │                │ │ │
│  │  │ -scan    │ │  sitter) │ │ -symbol graph  │ │ │
│  │  │ -watch   │ │          │ │ -import graph  │ │ │
│  │  │ -increm. │ │ -multi   │ │ -call graph    │ │ │
│  │  │ -chunk   │ │  lang    │ │ -ref tracking  │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Query    │ │ Evidence │ │ Search         │ │ │
│  │  │ Engine   │ │ Builder  │ │                │ │ │
│  │  │          │ │          │ │ -keyword       │ │ │
│  │  │ -find*   │ │ -collect │ │ -structural    │ │ │
│  │  │ -goto*   │ │ -rank    │ │ -semantic      │ │ │
│  │  │ -trace   │ │ -package │ │ -hybrid        │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │                                                │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │ Storage Layer                            │  │ │
│  │  │ -SQLite (symbols, edges, chunks, meta)   │  │ │
│  │  │ -Embedding store                         │  │ │
│  │  │ -File cache                              │  │ │
│  │  │ -Runtime state                           │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
│                        ▲                            │
│                        │ JSON-RPC                   │
│                        ▼                            │
│  ┌────────────────────────────────────────────────┐ │
│  │          TS Workflow Layer (worker)            │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Agent    │ │ Workflow │ │ LLM            │ │ │
│  │  │ System   │ │ Engine   │ │ Interface      │ │ │
│  │  │          │ │          │ │                │ │ │
│  │  │ -master  │ │ -quick   │ │ -provider mgr  │ │ │
│  │  │ -product │ │ -migrate │ │ -prompt build  │ │ │
│  │  │ -arch    │ │ -deliver │ │ -context assem │ │ │
│  │  │ -dev     │ │ -gates   │ │ -stream handle │ │ │
│  │  │ -review  │ │ -state   │ │ -cost tracking │ │ │
│  │  │ -qa      │ │          │ │                │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Policy   │ │ Skill    │ │ Session        │ │ │
│  │  │ Engine   │ │ System   │ │ Manager        │ │ │
│  │  │          │ │          │ │                │ │ │
│  │  │ -tool    │ │ -TDD     │ │ -conversation  │ │ │
│  │  │ -answer  │ │ -debug   │ │ -memory        │ │ │
│  │  │ -safety  │ │ -review  │ │ -resume        │ │ │
│  │  │ -budget  │ │ -plan    │ │ -audit         │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## PHẦN III — RUST CORE ENGINE (Layer 1 + 2)

Đây là trái tim. Nếu phần này yếu, app sẽ không khác gì wrapper gọi API.

### Module 1: Indexer

#### Nhiệm vụ

Biến codebase từ "đống file" thành "dữ liệu có cấu trúc".

#### Chi tiết

```
Workspace path
  → File scanner
    → Detect project type (monorepo, single, polyglot)
    → Respect .gitignore, custom ignores
    → File inventory (path, size, language, last modified)
  → Incremental tracker
    → Hash-based change detection
    → Only re-index changed files
    → Dependency-aware invalidation
  → Chunker
    → Không chunk theo line count
    → Chunk theo semantic unit:
      - function/method
      - class/struct/interface
      - module/file header
      - test block
    → Mỗi chunk giữ metadata:
      - file path
      - line range
      - parent symbol
      - language
      - import context
```

#### Vì sao quan trọng

Nếu indexer yếu:

- search trả về noise
- graph thiếu node
- evidence packet không chính xác
- LLM nhận context sai → answer sai

### Module 2: Parser

#### Nhiệm vụ

Biến source code thành AST, từ AST trích xuất thông tin có cấu trúc.

#### Chi tiết

```
File content
  → tree-sitter parse (multi-language)
    → AST
      → Symbol extraction:
        - functions (name, params, return type, visibility)
        - classes (name, methods, properties, inheritance)
        - interfaces/types
        - variables/constants (exported)
        - imports/exports
      → Relationship extraction:
        - file A imports file B
        - function A calls function B
        - class A extends class B
        - function A references variable X
```

#### Multi-language support

Thứ tự ưu tiên:

1. **TypeScript/JavaScript** (ưu tiên cao nhất)
2. **Python**
3. **Go**
4. **Rust**
5. Mở rộng sau: Java, C#, Ruby, PHP...

#### Thiết kế parser adapter

```rust
trait LanguageAdapter {
    fn parse(&self, content: &str) -> AST;
    fn extract_symbols(&self, ast: &AST) -> Vec<Symbol>;
    fn extract_imports(&self, ast: &AST) -> Vec<Import>;
    fn extract_calls(&self, ast: &AST) -> Vec<CallEdge>;
    fn extract_references(&self, ast: &AST) -> Vec<Reference>;
    fn chunk_by_symbol(&self, content: &str, ast: &AST) -> Vec<Chunk>;
}
```

Mỗi ngôn ngữ implement adapter riêng.

### Module 3: Graph Engine

#### Nhiệm vụ

Xây dựng và duy trì knowledge graph từ dữ liệu parser.

#### 4 loại graph

##### 3.1 Symbol Graph

```
Nodes: mọi symbol (function, class, variable, type)
Edges: contains, declares, exports

Ví dụ:
  File "auth.ts"
    ├── contains → class AuthService
    │   ├── contains → method login()
    │   ├── contains → method validateToken()
    │   └── contains → property tokenStore
    └── exports → AuthService
```

##### 3.2 Import/Dependency Graph

```
Nodes: files/modules
Edges: imports, re-exports

Ví dụ:
  auth.ts → imports → database.ts
  auth.ts → imports → crypto.ts
  routes/login.ts → imports → auth.ts
```

##### 3.3 Call Graph

```
Nodes: functions/methods
Edges: calls

Ví dụ:
  handleLogin() → calls → AuthService.login()
  AuthService.login() → calls → Database.findUser()
  AuthService.login() → calls → Crypto.hashPassword()
```

##### 3.4 Reference Graph

```
Nodes: symbols
Edges: references (read/write/type)

Ví dụ:
  variable `config` → referenced by:
    - server.ts:15 (read)
    - init.ts:8 (write)
    - types.ts:3 (type reference)
```

#### Tại sao cần cả 4?

| Câu hỏi user đặt ra | Graph cần dùng |
|---|---|
| "function này ở đâu?" | Symbol |
| "file này phụ thuộc gì?" | Import |
| "function này gọi gì?" | Call |
| "ai dùng biến này?" | Reference |
| "nếu sửa class này thì ảnh hưởng gì?" | Import + Call + Reference |
| "trace flow từ API đến DB" | Call + Import |

Một AI CLI mà thiếu graph → chỉ search text → không thể trace flow → không khác gì grep nâng cao.

### Module 4: Query Engine

#### Nhiệm vụ

Nhận câu hỏi từ TS layer, truy vấn graph + index, trả về kết quả có cấu trúc.

#### Core queries

```rust
// Tìm symbol
fn find_symbol(name: &str) -> Vec<SymbolResult>;

// Goto definition
fn goto_definition(file: &str, line: u32, col: u32) -> Option<Location>;

// Find references
fn find_references(symbol: &SymbolId) -> Vec<ReferenceResult>;

// Find dependents (ai phụ thuộc vào file/symbol này)
fn find_dependents(target: &str) -> Vec<DependentResult>;

// Find dependencies (file/symbol này phụ thuộc gì)
fn find_dependencies(target: &str) -> Vec<DependencyResult>;

// Call hierarchy (incoming + outgoing)
fn call_hierarchy(symbol: &SymbolId, direction: Direction) -> CallTree;

// Trace flow (từ A đến B qua những bước nào)
fn trace_flow(from: &SymbolId, to: &SymbolId) -> Vec<FlowPath>;

// Impact analysis (sửa chỗ này ảnh hưởng gì)
fn impact_analysis(target: &SymbolId) -> ImpactReport;
```

#### Đây là điểm khác biệt cực lớn

Hầu hết AI CLI hiện tại chỉ có `search_text` (grep) và `read_file`.

App này phải có query engine thật với khả năng traverse graph. Đây là thứ biến nó từ "AI chat trong terminal" thành "AI hiểu code".

### Module 5: Evidence Builder

#### Nhiệm vụ

Tập hợp kết quả từ query engine thành "evidence packets" — gói chứng cứ mà LLM dùng để trả lời.

#### Tại sao cần module riêng?

Vì LLM không cần raw data. LLM cần:

- **đúng files** (không phải tất cả files)
- **đúng symbols** (không phải tất cả symbols)
- **đúng relationships** (không phải toàn bộ graph)
- **đúng context** (vừa đủ, không quá nhiều)

#### Evidence packet structure

```rust
struct EvidencePacket {
    // Câu hỏi gốc
    query: String,

    // Files liên quan (đã rank)
    relevant_files: Vec<FileEvidence>,

    // Symbols liên quan
    relevant_symbols: Vec<SymbolEvidence>,

    // Relationships đã trace
    traced_relationships: Vec<RelationshipEvidence>,

    // Graph context (subgraph nhỏ xung quanh câu hỏi)
    graph_context: SubGraph,

    // Confidence signals
    confidence: ConfidenceReport,
}

struct FileEvidence {
    path: String,
    relevance_score: f32,
    reason: String,           // "imports target symbol"
    highlighted_lines: Vec<LineRange>,
    chunks: Vec<Chunk>,       // semantic chunks liên quan
}

struct ConfidenceReport {
    evidence_count: u32,
    graph_depth_reached: u32,
    ambiguous_symbols: Vec<String>,  // symbols trùng tên
    missing_data: Vec<String>,       // files chưa index
}
```

#### Flow

```
User: "how does authentication work?"

1. Query engine: find symbols matching "auth", "login", "token"
2. Query engine: trace call graph from entry points
3. Query engine: find dependencies of auth modules
4. Evidence builder: rank by relevance
5. Evidence builder: select top N files + symbols
6. Evidence builder: build graph context
7. Evidence builder: assess confidence
8. → Package thành EvidencePacket
9. → Gửi cho TS layer để build prompt
```

### Module 6: Search Engine

#### 3 loại search chạy song song

```
User query
  ├── Keyword search (ripgrep-based)
  │   → fast, exact matches
  │
  ├── Structural search (graph + symbol based)
  │   → find by symbol name, type, relationship
  │
  └── Semantic search (embedding based)
      → find by meaning, not exact text
```

#### Hybrid ranking

```
final_score =
    keyword_score * weight_keyword
  + structural_score * weight_structural
  + semantic_score * weight_semantic
```

Weights nên tunable và khác nhau theo intent:

- "where is function X defined?" → structural weight cao
- "how does auth work?" → semantic weight cao
- "find all TODO comments" → keyword weight cao

### Storage Layer

#### SQLite tables (core)

```sql
-- Files
CREATE TABLE files (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE,
  language TEXT,
  hash TEXT,          -- for incremental indexing
  last_indexed_at INTEGER
);

-- Symbols
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY,
  file_id INTEGER REFERENCES files(id),
  name TEXT,
  kind TEXT,          -- function, class, method, variable, type
  start_line INTEGER,
  end_line INTEGER,
  visibility TEXT,    -- public, private, internal
  parent_id INTEGER REFERENCES symbols(id)
);

-- Edges (all graph relationships)
CREATE TABLE edges (
  id INTEGER PRIMARY KEY,
  source_id INTEGER,
  target_id INTEGER,
  kind TEXT,          -- imports, calls, references, extends, contains
  source_type TEXT,   -- file, symbol
  target_type TEXT,
  metadata TEXT       -- JSON for extra info
);

-- Chunks (for retrieval)
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  file_id INTEGER REFERENCES files(id),
  symbol_id INTEGER REFERENCES symbols(id),
  content TEXT,
  start_line INTEGER,
  end_line INTEGER,
  embedding BLOB      -- vector embedding
);
```

#### Tại sao SQLite chứ không phải graph DB chuyên dụng?

- Local-first → SQLite phù hợp nhất
- Đủ nhanh cho codebase vài trăm nghìn file
- Không cần server
- Portable
- Dễ backup/reset

---

## PHẦN IV — TS WORKFLOW LAYER (Layer 3)

### Agent System

#### Mô hình agent

```typescript
interface Agent {
  id: string;
  role: AgentRole;
  capabilities: string[];

  // Core loop
  think(context: AgentContext): Promise<Thought>;
  plan(thought: Thought): Promise<Plan>;
  execute(plan: Plan): Promise<Result>;
  observe(result: Result): Promise<Observation>;
}
```

#### Agent roster — team dev thật

```
┌─────────────────────────────────────────┐
│           Master Orchestrator           │
│  - route tasks to agents                │
│  - manage workflow state                │
│  - gate transitions                     │
│  - escalation decisions                 │
└──────────────────┬──────────────────────┘
                   │
    ┌──────────────┼──────────────────┐
    ▼              ▼                  ▼
┌────────┐  ┌───────────┐  ┌──────────────┐
│Product │  │ Solution  │  │ Quick Agent  │
│Lead    │  │ Lead      │  │              │
│        │  │           │  │ (single-owner│
│-scope  │  │-technical │  │  fast lane)  │
│-accept │  │ approach  │  │              │
│-rules  │  │-slices    │  └──────────────┘
└───┬────┘  └─────┬─────┘
    │             │
    ▼             ▼
┌──────────────────────────┐
│    Fullstack Developer   │
│    (implementation)      │
└────────────┬─────────────┘
             │
    ┌────────┴────────┐
    ▼                 ▼
┌────────┐     ┌──────────┐
│Code    │     │ QA Agent │
│Reviewer│     │          │
│        │     │-verify   │
│-scope  │     │-regress  │
│-quality│     │-evidence │
└────────┘     └──────────┘
```

#### Tại sao mỗi agent cần role riêng?

Vì cùng 1 LLM nhưng khác prompt + context + constraints → hành vi khác:

- **Product Lead** nhìn từ góc "user cần gì?"
- **Solution Lead** nhìn từ góc "build thế nào an toàn?"
- **Code Reviewer** nhìn từ góc "code này có đúng scope không?"
- **QA** nhìn từ góc "chạy thật có đúng không?"

Nếu 1 agent làm tất cả → bias, thiếu check, bỏ sót.

### Workflow Engine

#### 3 modes

##### Quick Task

```
User request
  → Quick Agent nhận
    → Brainstorm (đọc code, đề xuất 3 hướng)
    → User chọn hướng
    → Plan (file nào sửa, test gì)
    → Implement
    → Test + verify
  → Done
```

Đặc điểm:

- 1 agent duy nhất
- không handoff
- nhanh, ít ceremony
- dùng cho bug fix nhỏ, refactor đơn giản, thêm feature hẹp

##### Migration

```
User request
  → Solution Lead: baseline capture
    → "hiện tại dùng gì, version nào, behavior nào phải giữ"
  → Solution Lead: strategy
    → "upgrade thế nào, thứ tự slice nào, rollback notes"
  → Fullstack: execute từng slice
  → Code Reviewer: review parity
    → "behavior có đổi không, có drift không"
  → QA: verify
    → "chạy thật có giống không, regression không"
  → Done
```

Đặc điểm:

- behavior-preserving
- slice-based (không big-bang)
- cần baseline evidence trước khi sửa
- dùng cho upgrade framework, dependency, runtime

##### Full Delivery

```
User request
  → Product Lead: scope
    → "vấn đề gì, acceptance criteria gì, edge cases gì"
  → Solution Lead: solution design
    → "approach nào, slice nào, test strategy gì"
  → Fullstack: implement
  → Code Reviewer: review
    → "đúng scope không, code quality thế nào"
  → QA: verify
    → "chạy đúng acceptance criteria không"
  → Done
```

Đặc điểm:

- full team workflow
- handoff rõ giữa các role
- approval gates giữa mỗi phase
- dùng cho feature mới, thay đổi lớn, cross-boundary work

#### Workflow state machine

```typescript
interface WorkflowState {
  mode: 'quick' | 'migration' | 'delivery';
  current_stage: string;
  current_owner: AgentRole;
  status: 'in_progress' | 'blocked' | 'done';
  approvals: Record<string, ApprovalGate>;
  artifacts: Record<string, string>;
  issues: Issue[];
  evidence: VerificationEvidence[];
}
```

---

## PHẦN V — BRIDGE DESIGN (Rust ↔ TS)

### Protocol: JSON-RPC over stdio

#### Tại sao stdio?

- Rust binary là host, spawn TS worker
- Không cần network stack
- Đơn giản, nhanh, debug dễ
- Phù hợp local-first

#### Request flow

```json
// TS → Rust (query code):
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "query.findSymbol",
  "params": { "name": "AuthService", "kind": "class" }
}

// Rust → TS (response):
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "symbols": [
      {
        "name": "AuthService",
        "file": "src/auth/service.ts",
        "line": 15,
        "kind": "class",
        "methods": ["login", "validateToken", "refresh"]
      }
    ]
  }
}
```

#### Event/notification flow (Rust → TS, no response needed)

```json
// Rust → TS:
{
  "jsonrpc": "2.0",
  "method": "event.indexingProgress",
  "params": { "files_done": 150, "files_total": 500 }
}

{
  "jsonrpc": "2.0",
  "method": "event.fileChanged",
  "params": { "path": "src/app.ts", "change": "modified" }
}
```

#### Method catalog

```
// Code understanding queries
query.findSymbol
query.gotoDefinition
query.findReferences
query.findDependents
query.findDependencies
query.callHierarchy
query.traceFlow
query.impactAnalysis
query.buildEvidence

// Indexing
index.workspace
index.file
index.status
index.invalidate

// Search
search.keyword
search.structural
search.semantic
search.hybrid

// File operations
file.read
file.readRange
file.list
file.diff

// Tool execution
tool.execute
tool.status

// Runtime
runtime.health
runtime.diagnostics
```

#### Design principles cho bridge

**1. Coarse-grained, không chatty**

```
// Sai: gọi nhiều lần nhỏ
findSymbol("auth")  → 50ms
getFile("auth.ts")  → 50ms
getImports("auth.ts") → 50ms
getCallers("login") → 50ms
// Total: 200ms, 4 round trips

// Đúng: gọi 1 lần meaningful
buildEvidence({ query: "how auth works" })  → 100ms
// Rust tự orchestrate internally, trả về 1 packet
```

**2. Typed contracts, versioned**

```typescript
interface QueryRequest {
  method: string;
  params: Record<string, unknown>;
  version: string;
}

interface QueryResult<T> {
  data: T;
  confidence: number;
  timing_ms: number;
  warnings: string[];
}
```

**3. Degraded mode support**

```json
{
  "result": null,
  "error": {
    "code": "INDEX_NOT_READY",
    "message": "Workspace not indexed yet",
    "suggestion": "Run index.workspace first"
  }
}
```

---

## PHẦN VI — PROCESS MODEL

### Ai start trước? Ai quản lý ai?

```
User chạy: dh ask "how does auth work?"
  │
  ▼
Rust binary starts (main process)
  │
  ├── Parse CLI args
  ├── Check runtime health
  ├── Load/verify index
  │
  ├── Spawn TS worker (Node.js subprocess)
  │   └── TS loads agent system, workflow engine
  │
  ├── JSON-RPC channel established (stdio)
  │
  ├── TS receives task
  │   ├── Agent classifies intent
  │   ├── Agent calls Rust for evidence
  │   ├── Agent builds prompt
  │   ├── Agent calls LLM
  │   ├── Agent formats answer
  │   └── Agent returns result to Rust
  │
  ├── Rust streams result to CLI
  │
  └── Cleanup (TS worker exits or stays for next command)
```

#### Lifecycle management

```
Rust responsibilities:
  - start/stop TS worker
  - health check TS worker
  - restart if TS crashes
  - timeout enforcement
  - resource limits

TS responsibilities:
  - agent loop
  - LLM calls
  - workflow state
  - session memory
  - report back to Rust
```

---

## PHẦN VII — CÁI GÌ LÀM TRƯỚC, CÁI GÌ LÀM SAU

### Phase 1 — Prove the engine (4-6 tuần)

**Mục tiêu:** Rust core engine parse và index được codebase thật, query trả kết quả đúng.

Làm:

- File scanner + incremental indexer
- tree-sitter parser (TS/JS trước)
- Symbol extraction
- Import graph
- findSymbol, gotoDefinition, findReferences
- SQLite storage
- CLI wrapper đơn giản để test

Chưa làm:

- Agent system
- Workflow engine
- LLM integration
- Full bridge

**Validation:**

- Index 1 repo thật (vài nghìn file)
- Query trả đúng symbol, đúng file, đúng line
- Benchmark latency

### Phase 2 — Bridge + basic agent (3-4 tuần)

**Mục tiêu:** TS layer gọi được Rust, 1 agent đơn giản hoạt động end-to-end.

Làm:

- JSON-RPC server trong Rust
- JSON-RPC client trong TS
- Process management (Rust spawn TS)
- 1 Quick Agent cơ bản
- Evidence packet builder
- LLM integration qua TS
- `dh ask "..."` chạy end-to-end

Chưa làm:

- Multi-agent
- Full workflow modes
- Advanced search

### Phase 3 — Code understanding depth (4-6 tuần)

**Mục tiêu:** Engine hiểu code sâu hơn, không chỉ symbol lookup.

Làm:

- Call graph
- Reference tracking
- Trace flow
- Impact analysis
- Semantic search (embedding)
- Hybrid ranking
- Evidence quality improvement

### Phase 4 — Workflow + multi-agent (4-6 tuần)

**Mục tiêu:** 3 workflow modes hoạt động với đúng agent topology.

Làm:

- Workflow state machine
- Agent roster đầy đủ
- Quick Task mode
- Migration mode
- Full Delivery mode
- Approval gates
- Handoff protocols

### Phase 5 — Production hardening (ongoing)

- Diagnostics / doctor
- Error handling / degraded modes
- Performance optimization
- Multi-language parser support
- Binary packaging
- Distribution

---

## PHẦN VIII — RUST TECH STACK ĐỀ XUẤT

```toml
[dependencies]
# Async runtime
tokio = { version = "1", features = ["full"] }

# Parsing
tree-sitter = "0.22"
tree-sitter-typescript = "0.21"
tree-sitter-javascript = "0.21"
tree-sitter-python = "0.21"

# Search
grep-regex = "0.1"     # ripgrep core
ignore = "0.4"          # .gitignore handling

# Storage
rusqlite = { version = "0.31", features = ["bundled"] }

# Serialization
serde = { version = "1", features = ["derive"] }
serde_json = "1"

# JSON-RPC
jsonrpc-core = "18"

# File watching
notify = "6"

# CLI
clap = { version = "4", features = ["derive"] }

# Concurrent data structures
dashmap = "5"

# Path handling
walkdir = "2"
```

## PHẦN IX — TS TECH STACK ĐỀ XUẤT

```json
{
  "dependencies": {
    "zod": "^3.22",
    "typescript": "^5.4",
    "valibot": "^0.30"
  }
}
```

Giữ TS side rất gọn:

- TS layer là workflow/agent logic
- Không cần web server
- Không cần ORM
- Dependency ít → bundle nhỏ → embed dễ

---

## PHẦN X — KẾT LUẬN

### Tóm tắt 1 câu

> **Rust sở hữu "AI hiểu code thế nào". TS sở hữu "AI làm gì với sự hiểu biết đó".**

### 5 nguyên tắc xuyên suốt

1. **Code understanding là nền tảng** — nếu engine yếu, workflow đẹp mấy cũng vô nghĩa
2. **Tách rõ ai biết gì, ai nghĩ gì, ai làm gì** — không trộn
3. **Rust là host và engine** — TS là brain worker
4. **Bridge phải coarse-grained** — ít call, mỗi call meaningful
5. **Prove engine trước, build workflow sau** — đúng thứ tự ưu tiên

---

## Relationship to other migration docs

- `docs/migration/2026-04-13-rust-ts-migration-plan-dh.md` — migration strategy and phased coexistence plan
- `docs/migration/architech.md` — initial brainstorm sketch (superseded by this document for architecture reference)
