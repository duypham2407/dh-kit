# Migration Plan: DH toward Rust + TypeScript

**Date:** 2026-04-13  
**Updated:** 2026-04-13 (revised after deep-dive analysis)  
**Lane:** `migration`  
**Status:** Approved direction — Rust + TS is the target architecture

---

## Executive Summary

DH sẽ chuyển từ Go + TypeScript sang **Rust + TypeScript**.

- **Rust** là core runtime, host process, code-intelligence engine — trái tim của app
- **TypeScript** là workflow layer, agent system, orchestration — bộ não của app
- **Go sẽ bị thay thế hoàn toàn** — không giữ lại dưới bất kỳ hình thức nào trong end-state
- **Bridge:** JSON-RPC 2.0 over stdio với Content-Length framing
- **Distribution:** side-by-side (Rust binary + bundled Node + TS worker) trước, single-binary optimization sau

Đây không còn là "proposed direction". Đây là **quyết định kiến trúc đã chốt**.

---

## Tại sao chuyển

### Product priority đã rõ

> Đọc hiểu codebase nhanh, sâu, chắc là trái tim của app.  
> Workflow/orchestration là lớp phát triển sau.

### Rust fit hơn Go cho bài toán này vì:

1. **Code-intelligence hot paths** (parse, index, graph, query) là CPU/data-structure heavy → Rust tối ưu hơn Go ở memory control, allocation, ownership
2. **Correctness** trong symbol/reference/call-graph work → Rust type system mạnh hơn Go
3. **Native tooling ecosystem** đang nghiêng về Rust cho developer tools
4. **Go không còn đóng vai trò chiến lược** khi workflow orchestration ở TS layer

### TypeScript vẫn giữ vì:

- Workflow/lane logic thay đổi nhanh
- Agent orchestration cần iterate nhanh
- LLM/provider/MCP ecosystem mạnh ở TS
- Policy/prompt/context shaping dễ experiment hơn

---

## Target Architecture (đã chốt)

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
│  │  │ -scan    │ │ (tree-   │ │ -symbol graph  │ │ │
│  │  │ -watch   │ │  sitter) │ │ -import graph  │ │ │
│  │  │ -increm. │ │ -multi   │ │ -call graph    │ │ │
│  │  │ -chunk   │ │  lang    │ │ -ref tracking  │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Query    │ │ Evidence │ │ Search         │ │ │
│  │  │ Engine   │ │ Builder  │ │ -keyword       │ │ │
│  │  │ -find*   │ │ -collect │ │ -structural    │ │ │
│  │  │ -goto*   │ │ -rank    │ │ -semantic      │ │ │
│  │  │ -trace   │ │ -package │ │ -hybrid        │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │                                                │ │
│  │  ┌──────────────────────────────────────────┐  │ │
│  │  │ Storage Layer                            │  │ │
│  │  │ -SQLite (symbols, edges, chunks, meta)   │  │ │
│  │  │ -Embedding store                         │  │ │
│  │  │ -File cache / Runtime state              │  │ │
│  │  └──────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
│                        ▲                            │
│                        │ JSON-RPC 2.0 over stdio    │
│                        ▼                            │
│  ┌────────────────────────────────────────────────┐ │
│  │          TS Workflow Layer (worker)            │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Agent    │ │ Workflow │ │ LLM Interface  │ │ │
│  │  │ System   │ │ Engine   │ │ -provider mgr  │ │ │
│  │  │ -master  │ │ -quick   │ │ -prompt build  │ │ │
│  │  │ -product │ │ -migrate │ │ -context assem │ │ │
│  │  │ -solution│ │ -deliver │ │ -stream handle │ │ │
│  │  │ -dev     │ │ -gates   │ │ -cost tracking │ │ │
│  │  │ -review  │ │ -state   │ │                │ │ │
│  │  │ -qa      │ │          │ │                │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  │                                                │ │
│  │  ┌──────────┐ ┌──────────┐ ┌────────────────┐ │ │
│  │  │ Policy   │ │ Skill    │ │ Session        │ │ │
│  │  │ Engine   │ │ System   │ │ Manager        │ │ │
│  │  └──────────┘ └──────────┘ └────────────────┘ │ │
│  └────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Ownership split (đã chốt)

#### Rust sở hữu:

- **Process lifecycle** — host, spawn TS worker, health check, restart
- **CLI parsing** — entry point, argument handling
- **File scanning** — project detection, .gitignore, language detection, file inventory
- **Incremental indexing** — 3-tier hash (content/structure/public_api), dependency-aware invalidation
- **Parser** — tree-sitter multi-language, LanguageAdapter trait
- **Symbol extraction** — functions, classes, methods, variables, types, imports/exports
- **Graph engine** — unified canonical store với 4 projections (symbol, import, call, reference)
- **Query engine** — findSymbol, gotoDefinition, findReferences, findDependents, callHierarchy, traceFlow, impactAnalysis
- **Evidence builder** — structural evidence packets cho LLM
- **Search** — keyword (ripgrep), structural (graph-based), semantic (embedding), hybrid ranking
- **Storage** — SQLite coordination, embedding store, file cache
- **JSON-RPC server** — bridge protocol server
- **Runtime diagnostics** — health, status, doctor primitives

#### TypeScript sở hữu:

- **Agent system** — Master Orchestrator, Product Lead, Solution Lead, Dev, Reviewer, QA, Quick Agent
- **Workflow engine** — quick/migration/delivery lanes, state machine, approval gates
- **LLM interface** — provider management, prompt building, context assembly, streaming
- **Policy engine** — tool policy, answer policy, safety policy, budget policy
- **Skill system** — TDD, debugging, review, planning skills
- **Session manager** — conversation memory, resume, audit
- **MCP/skill routing** — selection policy, integration
- **Output formatting** — answer formatting, report rendering

#### Shared contract (JSON-RPC):

- Typed method catalog versioned by protocol version
- Evidence packet schema
- Error/degraded mode semantics
- Event/notification system

### Boundary principle

> **Rust sở hữu structural truth. TS sở hữu orchestration truth.**
>
> TS KHÔNG giữ bản sao code-intelligence data.
> TS gọi Rust để lấy kết quả, kết hợp với LLM context, rồi orchestrate workflow.

---

## Bridge Design (đã chốt)

### Protocol

- **JSON-RPC 2.0** over **stdio** (stdin/stdout)
- **Content-Length framing** (giống LSP)
- Coarse-grained calls, không chatty
- Typed contracts: **Zod (TS)** + **serde (Rust)**

### Initialization handshake

```
Rust spawns TS worker
  → Rust sends: initialize request (protocol version, capabilities, workspace info)
  ← TS responds: initialized (accepted version, TS capabilities)
  → Rust sends: ready notification
  → Normal operation begins
```

### Method catalog

```
query.*    — findSymbol, gotoDefinition, findReferences, findDependents,
             findDependencies, callHierarchy, traceFlow, impactAnalysis, buildEvidence
index.*    — workspace, file, status, invalidate
search.*   — keyword, structural, semantic, hybrid
file.*     — read, readRange, list, diff, write, applyPatch
tool.*     — execute, status, cancel
runtime.*  — health, diagnostics, config
```

### Event system

```
Rust → TS:  event.index.progress, event.file.changed, event.engine.degraded, event.tool.outputChunk
TS → Rust:  event.workflow.stateChanged, event.agent.status
```

### Streaming

- Long-running operations use **terminal response + notification stream**
- Cancellation via `$/cancelRequest`

Chi tiết đầy đủ: `docs/migration/deep-dive-02-bridge-jsonrpc.md`

---

## Process Model (đã chốt)

### Rust là host duy nhất

```
User chạy: dh ask "how does auth work?"
  │
  ▼
Rust binary starts (main process)
  ├── Parse CLI args
  ├── Check runtime health, load/verify index
  ├── Spawn TS worker (bundled Node subprocess)
  ├── JSON-RPC handshake (initialize/initialized/ready)
  ├── TS receives task
  │   ├── Agent classifies intent
  │   ├── Agent calls Rust for evidence (query.buildEvidence)
  │   ├── Agent builds prompt, calls LLM
  │   ├── Agent formats answer
  │   └── Agent returns result to Rust
  ├── Rust streams result to CLI
  └── Cleanup or keep warm for next command
```

### Distribution

- **Phase 1:** Side-by-side distribution (Rust binary + bundled Node + TS worker bundle)
- **Later:** Single-binary optimization (embed TS bundle inside Rust binary, self-extract)
- **User experience:** download 1 archive → extract → run `dh`
- **No Node.js install required by user**

### TS Worker lifecycle

- Rust spawns, health-monitors (heartbeat), restarts on crash
- Graceful shutdown on SIGTERM/SIGINT
- Warm-start: keep TS worker alive between commands in interactive mode

Chi tiết đầy đủ: `docs/migration/deep-dive-04-process-model.md`

---

## Migration Phases (cập nhật)

### Phase 0 — Baseline và benchmark setup (1-2 tuần)

**Mục tiêu:** Định nghĩa "tốt hơn" trước khi code.

**Deliverables:**

- Benchmark corpus (DH repo + 2-3 repo thật khác nhau)
- Parity criteria cho structural extraction
- Baseline measurements:
  - cold index time
  - incremental reindex time
  - query latency p50/p95
  - memory usage (peak RSS)
  - symbol/reference/call-graph correctness
  - evidence packet quality
- Preserved invariants checklist:
  - local-first product intent
  - evidence-first answers
  - lane semantics intact
  - CLI command shape stable

**Decision gate:**
- Không bắt đầu code Rust nếu chưa có baseline suite chạy lặp lại được.

---

### Phase 1 — Prove the Rust engine (4-6 tuần)

**Mục tiêu:** Rust core engine parse và index codebase thật, query trả kết quả đúng.

**Scope:**

- Rust project scaffold (Cargo workspace)
- File scanner + incremental indexer (3-tier hash)
- tree-sitter parser với TS/JS LanguageAdapter
- Symbol extraction đầy đủ
- Import graph extraction
- Reference tracking
- SQLite storage layer
- CLI wrapper đơn giản để test trực tiếp (không cần TS layer)

**Chưa làm:**

- Agent system, workflow engine
- LLM integration
- Full bridge
- Call graph (phase 3)
- Semantic search (phase 3)

**Validation:**

- Index benchmark corpus
- So sánh parity với kết quả baseline
- Benchmark latency, memory, correctness
- findSymbol, gotoDefinition, findReferences trả đúng kết quả

**Rollback criteria:**
- Nếu Rust không đạt parity chấp nhận được cho TS/JS → dừng, đánh giá lại.

Chi tiết thiết kế: `docs/migration/deep-dive-01-indexer-parser.md`

---

### Phase 2 — Bridge + basic agent end-to-end (3-4 tuần)

**Mục tiêu:** TS layer gọi được Rust qua JSON-RPC, 1 agent chạy end-to-end.

**Scope:**

- JSON-RPC server trong Rust (Content-Length framing, router, handlers)
- JSON-RPC client trong TS (type-safe wrappers)
- Process management: Rust spawn TS worker, health check, restart
- Initialize handshake protocol
- 1 Quick Agent cơ bản
- Evidence packet builder (Rust side)
- LLM integration (TS side)
- `dh ask "..."` chạy end-to-end: user → Rust → TS agent → Rust query → TS prompt → LLM → answer

**Chưa làm:**

- Multi-agent, full workflow modes
- Advanced search, call graph

**Validation:**

- `dh ask "how does X work?"` trả lời dựa trên evidence thật từ Rust engine
- Bridge latency overhead chấp nhận được (<10ms per round trip)
- Crash recovery: TS worker crash → Rust restart → resume

Chi tiết thiết kế: `docs/migration/deep-dive-02-bridge-jsonrpc.md`, `docs/migration/deep-dive-04-process-model.md`

---

### Phase 3 — Code understanding depth (4-6 tuần)

**Mục tiêu:** Engine hiểu code sâu, không chỉ symbol lookup.

**Scope:**

- Call graph extraction + query
- Trace flow (từ A đến B qua những bước nào)
- Impact analysis (sửa chỗ này ảnh hưởng gì)
- Semantic search (embedding integration)
- Hybrid ranking (keyword + structural + semantic)
- Evidence quality improvement: confidence scoring, graph context extraction
- query.buildEvidence — coarse-grained call tập hợp tất cả evidence cho 1 câu hỏi

**Validation:**

- Shadow-mode so sánh answer quality trên `ask`, `explain`, `trace` prompts
- Benchmark call graph correctness, precision/recall
- Evidence packets chính xác hơn, nhanh hơn, hoặc cả hai
- Không tăng opaque failure modes

**Rollback criteria:**
- Nếu answer quality giảm dù engine nhanh hơn → dừng, sửa trước khi tiếp.

Chi tiết thiết kế: `docs/migration/deep-dive-03-graph-engine.md`

---

### Phase 4 — Workflow + multi-agent (4-6 tuần)

**Mục tiêu:** 3 workflow modes hoạt động với đúng agent topology.

**Scope:**

- Workflow state machine đầy đủ
- Agent roster: Master Orchestrator, Product Lead, Solution Lead, Fullstack Dev, Code Reviewer, QA, Quick Agent
- Quick Task mode: single-agent, brainstorm → plan → implement → test → done
- Migration mode: baseline → strategy → upgrade → review → verify
- Full Delivery mode: scope → solution → implement → review → QA → done
- Approval gates giữa mỗi phase
- Handoff protocols giữa agents
- Session management, conversation memory, resume

**Validation:**

- Quick task chạy end-to-end trên task thật
- Full delivery chạy end-to-end trên feature thật
- Agent handoff đúng, gate đúng, state machine đúng

---

### Phase 5 — Production hardening (ongoing)

**Scope:**

- Diagnostics / `dh doctor` kiểm tra cả Rust và TS health
- Error handling / degraded modes đầy đủ
- Multi-language parser: Python, Go, Rust adapters
- Performance optimization dựa trên telemetry thật
- Binary packaging optimization (single-binary nếu justified)
- Distribution: GitHub Releases, Homebrew, install script
- Incremental index UX: stale detection, progress reporting

---

## Go Retirement (đã chốt)

### Quyết định

**Go sẽ bị thay thế hoàn toàn bởi Rust.** Không giữ Go dưới bất kỳ hình thức nào trong end-state.

### Go chỉ còn tồn tại trong quá trình transition nếu:

- Cần tham chiếu logic cũ để đảm bảo parity
- Cần chạy song song để benchmark so sánh

### Exit criteria cho Go:

- [ ] Rust engine đạt parity structural extraction cho TS/JS
- [ ] Rust engine thắng benchmark ở ≥2/4 hot paths (index speed, query latency, memory, evidence precision)
- [ ] JSON-RPC bridge ổn định qua ≥2 iteration cycles
- [ ] Distribution path không yêu cầu user cài Go
- [ ] `dh doctor` kiểm tra được Rust + TS health mà không cần Go

Khi tất cả criteria pass → Go code được archive, docs được cập nhật, ADR gốc được supersede.

---

## Compatibility Hotspots

### 1. Hiện tại docs và ADR vẫn reference Go runtime fork

**Hazard:** confusion nếu không cập nhật docs.

**Mitigation:** Sau Phase 2 thành công, cập nhật:
- `docs/project-architecture.md`
- `docs/structure.md`
- `docs/architecture/opencode-integration-decision.md`
- Viết ADR mới: "DH chuyển core runtime từ Go sang Rust"

### 2. TS packages hiện assume Go runtime surfaces

**Hazard:** TS code có thể reference Go-specific contracts.

**Mitigation:** TS layer mới sẽ được build từ đầu dựa trên JSON-RPC contract mới. Không port Go-specific wiring.

### 3. Parser parity không miễn phí

**Hazard:** Rust tree-sitter có thể xử lý edge cases khác với web-tree-sitter/TS-side extraction cũ.

**Mitigation:** Parity harness bắt buộc ở Phase 1. So sánh symbol-by-symbol, edge-by-edge trên benchmark corpus.

### 4. Packaging phức tạp hơn trong ngắn hạn

**Hazard:** Side-by-side distribution (Rust binary + bundled Node + TS) phức tạp hơn single Go binary.

**Mitigation:** Chấp nhận trong Phase 1-3. Optimize packaging ở Phase 5 khi core đã ổn.

---

## Validation và Benchmark Plan

### Benchmark corpus

1. DH repo itself
2. 1 medium TS-heavy repo (vài nghìn file)
3. 1 mixed-language monorepo
4. 1 repo có import/call graph phức tạp
5. 1 large repo (>10K files) để test memory/latency strain

### Metrics

#### Structural correctness
- Symbol extraction parity (count, kind, range, visibility)
- Import edge completeness
- Reference precision/recall
- Call graph precision (static calls)
- Evidence packet line-range stability

#### Performance
- Cold indexing time
- Incremental indexing time
- Query latency p50/p95
- Peak RSS / memory profile
- CLI startup to first answer

#### Product-level outcome
- Answer support quality cho `ask`, `explain`, `trace`
- Số lần "insufficient evidence" degradation
- Confidence accuracy (confidence cao → answer đúng)

### Success thresholds

- **No material regression** trong structural correctness
- **Clear measurable win** ở ≥1 core hot path
- **No increase** trong opaque failure modes
- Nếu Rust chỉ "roughly equal" + thêm complexity → **không ép migration sâu hơn**

---

## Decision Gates

### Gate 1 — Sau Phase 0 (baseline)
- Benchmark suite chạy lặp lại được?
- Nếu không → dừng, fix baseline trước.

### Gate 2 — Sau Phase 1 (engine proof)
- Rust match structural output cho TS/JS?
- Nếu không → dừng ở experimental.

### Gate 3 — Sau Phase 2 (end-to-end)
- Bridge hoạt động ổn định?
- `dh ask` chạy được với quality chấp nhận?
- Nếu không → fix bridge/engine trước khi mở rộng.

### Gate 4 — Sau Phase 3 (depth)
- Evidence quality tốt hơn hoặc bằng?
- Performance win rõ ràng?
- Nếu không → cân nhắc scope lại.

### Gate 5 — Sau Phase 4 (workflow)
- 3 modes hoạt động đúng?
- Agent handoff đúng?
- Ready cho production hardening?

### Rollback principle

> Rollback luôn ưu tiên:
> - answer quality
> - evidence integrity
> - operator trust
>
> Không tiếp tục chỉ vì "đã viết nhiều code rồi".

---

## Resolved Decisions (cập nhật từ deep-dive)

Các quyết định sau đã được chốt qua 4 deep-dive analysis:

| Quyết định | Kết quả | Reference |
|---|---|---|
| Bridge protocol | JSON-RPC 2.0 over stdio, Content-Length framing | `deep-dive-02-bridge-jsonrpc.md` |
| Process model | Rust host → spawn TS worker | `deep-dive-04-process-model.md` |
| Go strategy | Full replacement, không giữ | User decision |
| Indexer model | File-atomic, 3-tier hash, dependency-aware invalidation | `deep-dive-01-indexer-parser.md` |
| Parser approach | tree-sitter + LanguageAdapter trait, TS/JS first | `deep-dive-01-indexer-parser.md` |
| Graph architecture | Unified canonical store, 4 logical projections | `deep-dive-03-graph-engine.md` |
| Distribution | Side-by-side first, single-binary later | `deep-dive-04-process-model.md` |
| TS runtime | Bundled Node.js, user không cần cài riêng | `deep-dive-04-process-model.md` |

---

## Remaining Open Decisions

1. **Bundled Node version strategy** — pin specific version? auto-update? minimal runtime?
2. **Embedding provider** — text-embedding-3-small tiếp tục? local model? hybrid?
3. **Multi-language parser priority** — sau TS/JS, Python hay Go trước?
4. **Interactive/daemon mode** — timeline cho warm-start optimization?
5. **Homebrew/distribution automation** — timeline?

---

## Document References

| Document | Purpose |
|---|---|
| `2026-04-13-system-architecture-analysis-rust-ts.md` | Phân tích kiến trúc tổng thể |
| `deep-dive-01-indexer-parser.md` | Indexer + Parser thiết kế chi tiết |
| `deep-dive-02-bridge-jsonrpc.md` | Bridge JSON-RPC protocol spec |
| `deep-dive-03-graph-engine.md` | Graph Engine 4 loại graph |
| `deep-dive-04-process-model.md` | Process Model Rust host ↔ TS worker |

---

## Final Statement

> **DH sẽ được xây lại với Rust làm trái tim, TypeScript làm bộ não.**
>
> Rust sở hữu: parse, index, graph, query, evidence, storage, runtime host.
> TypeScript sở hữu: agents, workflow, policy, prompt, LLM, orchestration.
>
> Mục tiêu không phải "viết lại DH bằng Rust".
> Mục tiêu là: **xây một engine đọc hiểu code cực mạnh bằng Rust, rồi để TS orchestrate intelligence đó thành product value.**
