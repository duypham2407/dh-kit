# DH Structure

Last reviewed against code: 2026-04-05

Để build app kiểu Cursor hoặc Antigravity, bạn cần hiểu nó không phải 1 app đơn giản, mà là nhiều lớp hệ thống chồng lên nhau.

Current implementation note:

- File này là mental model rút gọn, không phải inventory chính xác của mọi implementation hiện tại.
- Current codebase đã có retrieval, semantic indexing, workflow orchestration, config/doctor flows, Go hook enforcement end-to-end và binary distribution path chạy được.
- Các phần trong file này nên được đọc như mental model ổn định của hệ thống hiện tại, với dư địa mở rộng thêm chiều sâu thay vì các gap nền tảng chưa hoàn tất.

Tổng thể kiến trúc (mental model)

```text
CLI Interface
-> dh Application Layer + Forked OpenCode Runtime (Go core + TS SDK, 6 hooks)
-> Code Intelligence Engine
-> Index + Storage Layer
```

## 1. LAYER 1 — Interface (CLI)

Nhiệm vụ:
- nhận input (query)
- hiển thị output (stream)

Ví dụ:
```
dh ask "how auth works"
```

Layer này cực mỏng.

## 2. LAYER 2 — dh Application Layer + Forked OpenCode Runtime (trái tim hệ thống)

`dh` có kiến trúc mục tiêu sở hữu toàn bộ runtime qua fork OpenCode (Go core + TypeScript SDK).

6 hook points kiểm soát mọi quyết định:
1. Model selection override — chọn model per agent
2. Pre-tool-exec — enforce required tools, block unauthorized
3. Pre-answer — validate evidence, gate confidence
4. Skill activation — inject skills theo lane/role/intent
5. MCP routing — control MCP priority per task type
6. Session state injection — inject lane, stage, envelope

Bên trong gồm:

### 2.1 Planner
```
query → classify intent → plan:
- semantic search
- ast query
- expand graph
- choose tools
- choose skills/MCPs
```

### 2.2 Tool Executor (gated by pre-tool-exec hook)
```
await Promise.all([
  semanticSearch(),
  keywordSearch(),
  astQuery()
])
```

### 2.3 Context Builder
```
merge → rank → trim → build evidence packets → send to LLM
```

### 2.4 LLM (via forked Go core, gated by pre-answer hook)
```
prompt → streaming → evidence validation → final answer
```

## 3. LAYER 3 — Code Intelligence Engine (QUAN TRỌNG NHẤT)

Đây là thứ làm Cursor mạnh hơn 90% tool ngoài kia

Gồm 4 module chính:

### 3.1 Parser
tree-sitter: code → AST

### 3.2 Symbol Index
AST → symbols: function, class, method, import/export

### 3.3 Code Graph
```
function A → calls → function B
file A → imports → file B
```
Đây là thứ giúp AI "hiểu luồng"

### 3.4 Query Engine
```
findSymbol("auth")
findCallers("login")
findDependencies("userService")
```

## 4. LAYER 4 — Index & Storage

### 4.1 Semantic Store (embedding)
- embedding search with text-embedding-3-small
- default always-on

### 4.2 Symbol DB (AST)
- SQLite

### 4.3 Cache
- embedding, search result, file content

## Data flow thực tế

```text
User Query
-> Classify Intent
-> Skill Activation Hook -> inject skills
-> MCP Routing Hook -> set MCP priority
-> Model Override Hook -> select model for agent
-> Parallel Retrieval:
   ├── Semantic Search
   ├── Keyword Search (ripgrep)
   ├── AST Query
   (Pre-tool-exec hook gates each tool call)
-> Merge Results
-> Graph Expansion
-> Build Context (evidence packets)
-> LLM (via forked Go core)
   (Pre-answer hook validates evidence before finalizing)
-> Final Answer
```

## Điểm khác biệt giữa dh và tool thường

| Tool thường | dh |
|---|---|
| search text | search + AST + graph + semantic |
| chunk random | chunk theo function/symbol |
| không graph | dependency graph + call graph |
| LLM đoán | LLM có evidence packets thật |
| prompt-based enforcement | code-level enforcement via 6 Go hooks |
| external OpenCode | owned forked runtime |
| npm install required | target là single binary distribution |

## Kết luận

App kiểu Cursor =
- AI Orchestrator + Forked Runtime (6 hooks)
- AST Engine
- Vector Search
- Graph Engine
- Strict Tool System (target là enforce ở Go core, hiện tại đã có policy TS-side + bridge POC)
