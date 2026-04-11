# Kế hoạch tích hợp năng lực code-understanding từ open-kit vào DH core runtime

Ngày tạo: 2026-04-11
Trạng thái: Draft — chờ review và phê duyệt

---

## Mục tiêu

Tích hợp các thành phần phân tích code và enforcement mạnh nhất từ open-kit vào DH core runtime, để:

1. AI trong DH ưu tiên dùng structural/semantic/graph tools thay vì lệnh OS mặc định (`grep`, `find`, `cat`, `head`, `tail`, `sed`, `awk`).
2. DH có graph DB backbone đủ mạnh để trả lời "ai gọi hàm này", "file này phụ thuộc gì", "symbol này được dùng ở đâu" — bằng dữ liệu thật từ AST, không phải regex hay suy đoán.
3. Enforcement xảy ra ở runtime level qua hook model của DH (`pre_tool_exec`, `pre_answer`), không chỉ qua prompt.
4. DH không trở thành wrapper của open-kit — chỉ port logic cần thiết, viết lại bằng TypeScript, tích hợp vào package structure hiện có của DH.

---

## Nguyên tắc kiến trúc

### DH không phải wrapper

- DH sở hữu toàn bộ runtime qua fork OpenCode (Go core + TS SDK).
- Không import trực tiếp module từ open-kit. Không depend vào open-kit package.
- Port = đọc hiểu logic open-kit, viết lại bằng TypeScript, đặt đúng chỗ trong DH package structure.

### Port cái gì, không port cái gì

- Port: thuật toán, schema, pattern matching logic, AST walk strategy.
- Không port: runtime wiring của open-kit (workflow kernel, hook composition, tool registry riêng của open-kit).
- Không port: cấu trúc JavaScript module loose-typed. Viết lại hết bằng TypeScript strict.

### Tích hợp native

- Code mới nằm trong `packages/intelligence/`, `packages/storage/`, `packages/runtime/`.
- Dùng `node:sqlite` (DatabaseSync) — engine mà DH đã chọn. Không dùng `better-sqlite3`.
- Dùng `web-tree-sitter` + `tree-sitter-wasms` — engine mà DH đã chọn. Không thêm native tree-sitter binding.
- Tuân theo shared types đã có trong `packages/shared/src/types/`.

### Enforcement là runtime contract

- Hook model của DH (6 hook points trong Go core) là nơi enforcement xảy ra.
- TypeScript enforcement logic chạy qua bridge SDK, được gọi bởi Go hooks.
- Không chỉ nhắc trong prompt — block thật ở `pre_tool_exec`, gate thật ở `pre_answer`.

---

## Những gì tái sử dụng từ open-kit

### 1. AST import graph extraction

**Nguồn:** `open-kit/src/runtime/analysis/import-graph-builder.js` (655 dòng)

**Lý do port:** DH hiện tại (`packages/intelligence/src/graph/extract-import-edges.ts`) dùng regex đơn (`/^\s*import\s+.*?from\s+["'](.+?)["'];?/gm`). Cách này bỏ sót:
- `require()` calls
- Dynamic `import()`
- Re-exports (`export { x } from '...'`)
- Type-only imports (`import type { ... }`)
- Side-effect imports (`import '...'`)

Logic open-kit walk tree-sitter CST, bắt đầy đủ các trường hợp trên, resolve specifier thành absolute path, xử lý index file fallback.

**Cách port:** Viết lại `extract-import-edges.ts` để dùng tree-sitter AST walk thay vì regex. Giữ interface `IndexedEdge[]` hiện tại. Thêm module resolution logic (resolve relative path, thử extension, thử index file).

### 2. AST call graph extraction

**Nguồn:** `open-kit/src/runtime/analysis/call-graph-builder.js` (256 dòng)

**Lý do port:** DH hiện tại (`extract-call-edges.ts`) dùng regex pattern (`/\bname\s*\(/g`) trên text window. Cách này:
- Không phân biệt call expression thật với comment, string literal, hay property access
- Không track caller-callee ở cấp symbol (chỉ ở cấp file)
- Không resolve callee sang file/symbol cụ thể qua import map

Logic open-kit:
- Walk AST để tìm callable symbols (function, method, arrow function, class constructor)
- Trong body của mỗi callable, extract call expressions
- Resolve callee name thành node_id/symbol_id qua import map và DB lookup
- Hỗ trợ member expression calls (`foo.bar()`)

**Cách port:** Viết `extract-call-graph.ts` mới trong `packages/intelligence/src/graph/`. Input = parsed tree + symbol list + import list + DB. Output = `CallEdge[]` với caller_symbol_id, callee_name, callee_node_id, callee_symbol_id.

### 3. Graph DB backbone (schema + operations)

**Nguồn:** `open-kit/src/runtime/analysis/project-graph-db.js` (728 dòng)

**Lý do port:** DH hiện tại có SQLite schema cho workflow state, audit, chunks, embeddings — nhưng **không có** graph schema. Thiếu hoàn toàn:
- `nodes` table (file registry với path, kind, mtime, parse status)
- `edges` table (import/export edges giữa files)
- `symbols` table (symbol declarations với kind, export status, signature, line range)
- `symbol_references` table (identifier usages cross-file)
- `call_graph` table (caller→callee relationships)
- Session touches

Không có graph schema = không thể trả lời "ai gọi hàm X", "file này depend gì", "symbol này được reference ở đâu" bằng dữ liệu structured.

**Cách port:**
- Thêm graph tables vào `packages/storage/src/sqlite/db.ts` (trong `bootstrapDhDatabase()`).
- Tạo `graph-repo.ts` mới trong `packages/storage/src/sqlite/repositories/` để wrap prepared statements.
- Dùng `node:sqlite` DatabaseSync, không dùng `better-sqlite3`.
- Schema tương đương open-kit nhưng adapt cho DH conventions (TEXT id thay vì INTEGER autoincrement, align naming với shared types).

### 4. Bash/tool guard policy

**Nguồn:** `open-kit/src/runtime/hooks/tool-guards/bash-guard-hook.js` (113 dòng)

**Lý do port:** DH hiện tại không có runtime enforcement chặn lệnh OS. AI vẫn thoải mái gọi `grep`, `cat`, `find` trên source files qua bash tool mà không bị block.

Logic open-kit:
- Danh sách SUBSTITUTION_RULES: pattern regex → category → suggestion (dùng tool nào thay thế)
- Danh sách ALLOWED_PREFIXES: lệnh không bị chặn (git, npm, docker, make, cargo, ...)
- Hook trả về `{ allowed: false, blocked: true, reason: "..." }` khi phát hiện lệnh bị cấm
- Enforcement level configurable (strict / advisory)

**Cách port:** Tạo `bash-guard.ts` trong `packages/runtime/src/hooks/` hoặc `packages/opencode-app/src/policies/`. Wire vào `pre_tool_exec` hook qua Go bridge. DH sẽ dùng danh sách rules tương tự nhưng suggestion text trỏ sang DH tool IDs.

### 5. Reference tracking

**Nguồn:** `open-kit/src/runtime/analysis/reference-tracker.js` (257 dòng)

**Lý do port:** DH hiện tại không có reference tracking. Không thể trả lời "symbol X được dùng ở đâu" — chỉ biết "symbol X được khai báo ở đâu".

Logic open-kit:
- Walk toàn bộ AST, collect identifier nodes
- So khớp mỗi identifier với imported name map (built từ import declarations)
- Lexical scope tracking để tránh false positive khi local variable shadow imported name
- Phân biệt declaration site vs usage site
- Phân biệt type-reference vs value-reference
- Cross-file fallback: nếu identifier khớp duy nhất một exported symbol trong DB

**Cách port:** Tạo `reference-tracker.ts` trong `packages/intelligence/src/graph/`. Input = parsed tree + import list + symbol list + DB. Output = `SymbolReference[]` (symbolId, line, col, kind).

### Những gì KHÔNG port

| Thành phần open-kit | Lý do không port |
|---|---|
| `workflow-kernel.js` | DH có Go core workflow riêng, không cần JS workflow kernel |
| `tool-registry.js`, `create-tools.js` | DH tool registration đi qua Go runtime, không qua JS registry |
| `create-hooks.js`, `create-managers.js` | DH hook composition đi qua Go core hooks, không qua JS hook factory |
| `opencode-layering.js` | DH fork toàn bộ OpenCode, không cần layering adapter |
| `skill-hooks.js`, `session-hooks.js` | DH có hook model riêng cho skill/session, khác architecture |
| `embedding-indexer.js`, `embedding-provider.js` | DH đã có `packages/retrieval/` và embedding pipeline riêng |
| `capability-registry.js` | DH capability model khác, không cần port |
| Toàn bộ `src/runtime/tools/` tool implementations | DH sẽ tự build tools trên graph DB mới, không copy tool code |

---

## Target tool families / tool IDs đề xuất cho DH

Sau khi graph DB và extractors có mặt, DH cần expose các tools cho AI. Đây là danh sách tool families và IDs đề xuất:

### Graph query tools

| Tool ID | Chức năng | Requires |
|---|---|---|
| `dh.find-dependencies` | Trả về danh sách files mà file X import | Graph DB (edges table) |
| `dh.find-dependents` | Trả về danh sách files import file X | Graph DB (edges table) |
| `dh.find-symbol` | Tìm symbol theo tên, trả về file + line + kind | Graph DB (symbols table) |
| `dh.find-references` | Tìm tất cả usages của symbol X cross-file | Graph DB (symbol_references table) |
| `dh.goto-definition` | Nhảy tới definition của symbol X | Graph DB (symbols table + edges) |
| `dh.call-hierarchy` | Trả về callers/callees của function X | Graph DB (call_graph table) |
| `dh.import-graph` | Trả về toàn bộ hoặc subgraph import relationships | Graph DB (edges table) |

### Structural analysis tools

| Tool ID | Chức năng | Requires |
|---|---|---|
| `dh.syntax-outline` | Trả về outline symbols của file (không cần đọc full file) | tree-sitter parser |
| `dh.syntax-context` | Trả về AST context xung quanh position (line, col) | tree-sitter parser |
| `dh.ast-search` | Search code bằng AST pattern (structural grep) | tree-sitter parser |

### Enforcement-aware tools

| Tool ID | Chức năng | Requires |
|---|---|---|
| `dh.semantic-search` | Search code theo meaning (embedding-based) | Embedding index |
| `dh.rename-preview` | Preview multi-file rename impact | Graph DB (references + symbols) |

### Priority cho tool registration

- **P0:** `dh.find-dependencies`, `dh.find-dependents`, `dh.find-symbol`, `dh.find-references`
- **P1:** `dh.call-hierarchy`, `dh.goto-definition`, `dh.syntax-outline`
- **P2:** `dh.ast-search`, `dh.rename-preview`, `dh.import-graph`

---

## Hook enforcement rules trong DH core runtime

### pre_tool_exec hook — bash guard

Khi AI gọi bash/shell tool, `pre_tool_exec` hook phải chạy bash guard logic:

```
Input: { toolId: "bash", args: { command: "grep -r 'auth' src/" } }

1. Kiểm tra command có trong ALLOWED_PREFIXES không
   → git, npm, docker, make, cargo, etc. → cho qua
2. Kiểm tra command match SUBSTITUTION_RULES không
   → grep → block, suggest: "Dùng dh.find-references hoặc Grep tool"
   → cat *.ts → block, suggest: "Dùng Read tool hoặc dh.syntax-outline"
   → find -name → block, suggest: "Dùng Glob tool hoặc dh.find-symbol"
   → sed → block, suggest: "Dùng Edit tool hoặc codemod"
3. Trả về { allowed: false, reason: "...", suggestion: "..." }
   hoặc { allowed: true }

Enforcement levels:
  - strict: block + return error message (mặc định)
  - advisory: cho qua nhưng log warning + inject suggestion vào context
```

### pre_tool_exec hook — tool preference enforcement

Ngoài bash guard, `pre_tool_exec` cũng nên suggest graph tools khi AI dùng generic tools cho tasks mà graph tools làm tốt hơn:

```
Ví dụ:
- AI gọi Grep tool với pattern "function login" → suggest "dh.find-symbol login"
- AI gọi Read tool trên file lớn → suggest "dh.syntax-outline trước"
- AI gọi Grep tool tìm "import.*from.*auth" → suggest "dh.find-dependents auth-service.ts"

Level: advisory (không block, chỉ inject suggestion)
```

### pre_answer hook — evidence gating

Trước khi AI trả lời, `pre_answer` hook kiểm tra:

```
1. Intent của query có yêu cầu structural evidence không?
   → "ai gọi hàm X" → cần call_hierarchy evidence
   → "file này depend gì" → cần dependency evidence
   → "refactor Y ảnh hưởng gì" → cần reference + dependent evidence

2. Đã có evidence từ graph tools chưa?
   → Nếu chưa → inject warning: "Câu trả lời này thiếu structural evidence"
   → Nếu có → cho qua

3. Evidence score đạt ngưỡng chưa?
   → Dưới ngưỡng → suggest retry với plan mạnh hơn
```

### session_state hook — tool usage audit

Mỗi tool call được log vào `tool_usage_audit` table (đã có trong DH schema):

```
{
  tool_name: "dh.find-references",
  intent: "trace_flow",
  status: "success" | "failed" | "blocked",
  timestamp: "..."
}
```

Data này dùng để:
- Debug khi AI trả lời sai (xem nó có dùng đúng tools không)
- Tune enforcement rules
- Track adoption rate của graph tools vs OS commands

---

## Storage/schema cần thêm hoặc nâng cấp

### Tables mới cần thêm vào `bootstrapDhDatabase()`

```sql
-- File registry cho graph
CREATE TABLE IF NOT EXISTS graph_nodes (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'module',
  language TEXT,
  content_hash TEXT,
  mtime REAL NOT NULL DEFAULT 0,
  parse_status TEXT NOT NULL DEFAULT 'pending',
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_graph_nodes_path ON graph_nodes (path);

-- Import/export edges giữa files
CREATE TABLE IF NOT EXISTS graph_edges (
  id TEXT PRIMARY KEY,
  from_node_id TEXT NOT NULL,
  to_node_id TEXT NOT NULL,
  edge_type TEXT NOT NULL DEFAULT 'import',
  line INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (from_node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE,
  FOREIGN KEY (to_node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graph_edges_from ON graph_edges (from_node_id);
CREATE INDEX IF NOT EXISTS idx_graph_edges_to ON graph_edges (to_node_id);

-- Symbol declarations
CREATE TABLE IF NOT EXISTS graph_symbols (
  id TEXT PRIMARY KEY,
  node_id TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'unknown',
  is_export INTEGER NOT NULL DEFAULT 0,
  line INTEGER NOT NULL DEFAULT 0,
  start_line INTEGER,
  end_line INTEGER,
  signature TEXT,
  doc_comment TEXT,
  scope TEXT,
  FOREIGN KEY (node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graph_symbols_node ON graph_symbols (node_id);
CREATE INDEX IF NOT EXISTS idx_graph_symbols_name ON graph_symbols (name);

-- Cross-file symbol references
CREATE TABLE IF NOT EXISTS graph_symbol_references (
  id TEXT PRIMARY KEY,
  symbol_id TEXT NOT NULL,
  node_id TEXT NOT NULL,
  line INTEGER NOT NULL,
  col INTEGER NOT NULL DEFAULT 0,
  kind TEXT NOT NULL DEFAULT 'usage',
  FOREIGN KEY (symbol_id) REFERENCES graph_symbols (id) ON DELETE CASCADE,
  FOREIGN KEY (node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graph_refs_symbol ON graph_symbol_references (symbol_id);
CREATE INDEX IF NOT EXISTS idx_graph_refs_node ON graph_symbol_references (node_id);

-- Call graph
CREATE TABLE IF NOT EXISTS graph_calls (
  id TEXT PRIMARY KEY,
  caller_symbol_id TEXT NOT NULL,
  callee_name TEXT NOT NULL,
  callee_node_id TEXT,
  callee_symbol_id TEXT,
  line INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (caller_symbol_id) REFERENCES graph_symbols (id) ON DELETE CASCADE,
  FOREIGN KEY (callee_node_id) REFERENCES graph_nodes (id) ON DELETE CASCADE,
  FOREIGN KEY (callee_symbol_id) REFERENCES graph_symbols (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_graph_calls_caller ON graph_calls (caller_symbol_id);
CREATE INDEX IF NOT EXISTS idx_graph_calls_callee ON graph_calls (callee_name);
```

### Naming convention

- Prefix `graph_` cho tất cả graph tables để tránh xung đột với tables hiện có.
- Dùng TEXT id (DH convention, dùng `createId()` từ `packages/shared/src/utils/ids.ts`) thay vì INTEGER autoincrement (open-kit convention).
- Thêm `ON DELETE CASCADE` cho foreign keys.

### Repository layer

Tạo `graph-repo.ts` trong `packages/storage/src/sqlite/repositories/`:
- `GraphNodeRepo` — CRUD cho graph_nodes
- `GraphEdgeRepo` — replace edges from node, query dependencies/dependents
- `GraphSymbolRepo` — replace symbols for node, find by name
- `GraphReferenceRepo` — replace refs for node, find by symbol
- `GraphCallRepo` — replace calls for node, find callers/callees

Hoặc gộp thành 1 class `GraphRepo` nếu muốn đơn giản hơn.

---

## Migration phases

### P0 — Graph DB backbone + AST import extraction (ưu tiên cao nhất)

**Scope:**
1. Thêm graph tables vào `bootstrapDhDatabase()`.
2. Tạo `graph-repo.ts` với prepared statements cho CRUD operations.
3. Viết lại `extract-import-edges.ts` dùng tree-sitter AST walk (port logic từ open-kit `import-graph-builder.js`).
4. Thêm module resolution logic (resolve relative path → absolute path, thử extensions, thử index files).
5. Tạo `graph-indexer.ts` trong `packages/intelligence/` — orchestrate: parse file → extract symbols → extract imports → write to graph DB.
6. Unit tests cho graph-repo, import extraction, module resolution.

**Validation:**
- `vitest run` — graph-repo tests pass
- Index 1 project nhỏ, verify edges trong DB đúng với imports thực tế
- So sánh output cũ (regex) vs mới (AST) trên cùng codebase, đếm true/false positives

**Output:**
- DH có thể trả lời `dh.find-dependencies` và `dh.find-dependents` bằng dữ liệu thật

### P1 — Call graph + reference tracking + bash guard

**Scope:**
1. Port call graph extraction từ open-kit `call-graph-builder.js` → `extract-call-graph.ts` mới.
2. Port reference tracking từ open-kit `reference-tracker.js` → `reference-tracker.ts` mới.
3. Wire call graph + references vào `graph-indexer.ts` (chạy sau import extraction).
4. Port bash guard logic từ open-kit `bash-guard-hook.js` → `bash-guard.ts` trong DH.
5. Wire bash guard vào `pre_tool_exec` hook qua Go bridge.
6. Register graph query tools: `dh.find-symbol`, `dh.find-references`, `dh.call-hierarchy`.

**Validation:**
- `vitest run` — call graph + reference tests pass
- Bash guard blocks `grep src/ -r` nhưng cho qua `git status`
- `dh.find-references functionX` trả về đúng usage sites
- `dh.call-hierarchy functionX` trả về đúng callers/callees

**Output:**
- DH có thể trả lời "ai gọi hàm X" và "symbol Y được dùng ở đâu" bằng graph data
- AI bị block khi cố dùng OS commands trên source files

### P2 — Tool preference enforcement + evidence gating + incremental indexing

**Scope:**
1. Tool preference advisory hooks: suggest graph tools khi AI dùng generic tools cho tasks có graph tool tốt hơn.
2. Evidence gating trong `pre_answer` hook: kiểm tra structural evidence trước khi cho trả lời cho câu hỏi structural.
3. Incremental indexing: chỉ re-index files thay đổi (dùng mtime/content_hash so sánh).
4. Register tools còn lại: `dh.goto-definition`, `dh.syntax-outline`, `dh.import-graph`.
5. Tool audit dashboard: aggregate data từ `tool_usage_audit` để track adoption.

**Validation:**
- AI nhận suggestion khi dùng Grep tool cho task mà `dh.find-references` làm tốt hơn
- Câu trả lời cho "refactor X ảnh hưởng gì" có evidence từ graph tools
- Re-index sau khi sửa 1 file chỉ mất < 1 giây (không full re-index)
- Tool audit log có data cho mỗi tool call

**Output:**
- Enforcement loop hoàn chỉnh: block → suggest → verify evidence → gate answer
- Incremental indexing sẵn sàng cho daily use

---

## Definition of done

### P0 done khi:

- [ ] Graph tables tồn tại trong DH SQLite schema
- [ ] `graph-repo.ts` có prepared statements cho node, edge, symbol CRUD
- [ ] `extract-import-edges.ts` dùng tree-sitter AST walk thay vì regex
- [ ] Module resolution hoạt động (relative path → absolute, extension fallback, index file fallback)
- [ ] `graph-indexer.ts` có thể index 1 project và populate graph DB
- [ ] Unit tests pass (`vitest run`)
- [ ] `dh.find-dependencies` và `dh.find-dependents` trả về kết quả đúng khi test thủ công

### P1 done khi:

- [ ] Call graph extraction dùng AST walk, kết quả lưu trong `graph_calls` table
- [ ] Reference tracking hoạt động, kết quả lưu trong `graph_symbol_references` table
- [ ] Bash guard chặn OS commands ở `pre_tool_exec` hook
- [ ] `dh.find-symbol`, `dh.find-references`, `dh.call-hierarchy` hoạt động end-to-end
- [ ] Unit tests + integration tests pass

### P2 done khi:

- [ ] Tool preference advisory hoạt động
- [ ] Evidence gating kiểm tra structural evidence ở `pre_answer`
- [ ] Incremental indexing hoạt động (chỉ re-index files thay đổi)
- [ ] Tool audit có data hữu ích cho tuning

---

## Risks / watchouts

### 1. `node:sqlite` vs `better-sqlite3` performance gap

open-kit dùng `better-sqlite3` — thư viện native, mature, có synchronous API mạnh và prepared statements nhanh. DH dùng `node:sqlite` (DatabaseSync) — API mới hơn, ít battle-tested hơn.

**Mitigation:** Benchmark P0 với project 1000+ files. Nếu `node:sqlite` quá chậm cho graph queries, cân nhắc lại. Hiện tại giữ `node:sqlite` vì DH đã commit vào nó và nó không cần native addon.

### 2. Tree-sitter WASM vs native performance

DH dùng `web-tree-sitter` (WASM) — chậm hơn native tree-sitter binding 3-5x. open-kit cũng dùng tree-sitter qua kit runtime (WASM-based).

**Mitigation:** Chấp nhận hiện tại. Nếu indexing quá chậm cho project lớn, batch parsing và dùng incremental indexing (P2) để giảm impact.

### 3. Module resolution accuracy

Import graph quality phụ thuộc vào module resolution. Các trường hợp khó:
- TypeScript path aliases (`@/...`, `~/...`)
- `tsconfig.json` paths mapping
- Monorepo package references
- Node.js subpath exports

**Mitigation:** P0 chỉ cần resolve relative paths đúng. Thêm tsconfig paths resolution ở P1 nếu cần. Bare specifier (npm packages) trả về null — chấp nhận.

### 4. Go bridge latency cho enforcement hooks

Mỗi tool call đi qua Go core → TypeScript bridge → enforcement logic → trả về Go core. Nếu round-trip chậm, mỗi tool call bị thêm latency.

**Mitigation:** Bash guard logic rất nhẹ (regex match). Nên < 1ms. Measure trong P1 khi wire thật. Nếu bridge overhead quá cao, cân nhắc implement bash guard bằng Go trực tiếp.

### 5. False positive trong reference tracking

Lexical scope tracking không hoàn hảo — tree-sitter CST không phải type-checker. Có thể có false positives khi:
- Cùng tên biến ở scope khác nhau
- Dynamic property access
- Computed property names

**Mitigation:** Chấp nhận imperfect accuracy. Port lexical scope tracking từ open-kit (đã có phase 2 improvements). Prefer precision over recall — chỉ link khi match duy nhất hoặc rõ ràng.

### 6. Schema migration cho DB đã tồn tại

DH đã có SQLite DB running với workflow/audit tables. Thêm graph tables cần migration an toàn.

**Mitigation:** Graph tables là additive (CREATE IF NOT EXISTS). Không sửa tables hiện có. Không có breaking change. Chạy migration trong `bootstrapDhDatabase()` — đã có pattern này.

### 7. Adoption friction

AI có thể vẫn prefer OS commands nếu graph tools chậm hơn hoặc output khó parse hơn.

**Mitigation:** Đây chính là lý do cần enforcement ở runtime level. Bash guard block → AI bắt buộc dùng alternatives. Tool output format phải clear và consistent.

---

## Tham chiếu nguồn

| File open-kit | Mục đích | Target DH location |
|---|---|---|
| `src/runtime/analysis/project-graph-db.js` | Schema + DB operations | `packages/storage/src/sqlite/repositories/graph-repo.ts` |
| `src/runtime/analysis/import-graph-builder.js` | AST import extraction | `packages/intelligence/src/graph/extract-import-edges.ts` (rewrite) |
| `src/runtime/analysis/call-graph-builder.js` | AST call graph | `packages/intelligence/src/graph/extract-call-graph.ts` (new) |
| `src/runtime/analysis/reference-tracker.js` | Reference tracking | `packages/intelligence/src/graph/reference-tracker.ts` (new) |
| `src/runtime/hooks/tool-guards/bash-guard-hook.js` | OS command blocking | `packages/runtime/src/hooks/bash-guard.ts` (new) |
