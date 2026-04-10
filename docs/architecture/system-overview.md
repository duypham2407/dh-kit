# DH System Overview

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này mô tả kiến trúc tổng thể của `dh`, một AI software factory sở hữu toàn bộ runtime qua fork hoàn toàn OpenCode (Go core + TypeScript SDK), tập trung vào:

- ranh giới giữa các layer và package
- vai trò của forked OpenCode runtime và 6 hook points
- luồng dữ liệu chính từ query đến answer
- trách nhiệm của từng khối
- nguyên tắc thiết kế để AI có thể search, đọc hiểu và trace codebase chắc chắn

Tài liệu này là overview cấp hệ thống. Chi tiết schema index nằm ở `docs/architecture/indexing-model.md`. Chi tiết retrieval pipeline nằm ở `docs/architecture/retrieval-strategy.md`. Chi tiết quyết định fork nằm ở `docs/architecture/opencode-integration-decision.md`.

Current implementation note:

- Đây là tài liệu mô tả target architecture của hệ thống.
- Ở code hiện tại, các phần chính của application, retrieval, intelligence, storage, Go runtime hook wiring và binary distribution path đã có implementation và validation usable end-to-end.
- Các phần target-state trong tài liệu này nên được đọc chủ yếu như hướng scale-up, tuning và mở rộng capability, không còn là phần nền tảng chưa hoàn tất.

## Mục tiêu sản phẩm

Hệ thống cần hỗ trợ tốt các nhóm use case sau:

1. `find definition`
2. `explain module`
3. `trace flow`
4. `impact analysis`
5. `bug investigation`
6. `codebase Q&A`

Đầu ra kỳ vọng:

- câu trả lời có evidence rõ ràng
- có thể trích dẫn file, symbol và line range
- context được xây từ nhiều nguồn thay vì chỉ text match
- runtime có thể kiểm tra AI đã dùng đúng tool chưa
- workflow lane được giữ ổn định trong suốt session

## Nguyên tắc thiết kế

1. Context quality quan trọng hơn model size.
2. Code intelligence phải là capability lõi, không phải phần phụ.
3. Retrieval phải là hybrid retrieval: semantic + keyword + AST + graph.
4. Tool usage phải được enforce ở runtime bằng code hook, không chỉ prompt.
5. Mỗi layer chỉ nên giữ một loại trách nhiệm chính.
6. Evidence phải đi cùng context trong toàn bộ pipeline.
7. Lane lock là runtime contract bắt buộc.
8. `dh` sở hữu runtime qua fork — không phụ thuộc external install.
9. 6 hook points là surface kiểm soát chính cho mọi enforcement.

## Kiến trúc phân lớp

Hệ thống gồm 6 khối chính, trong đó forked OpenCode runtime là lõi thực thi:

```text
CLI Interface
-> dh Application Layer (lane, planning, enforcement, context)
-> Forked OpenCode Runtime (Go core + TS SDK, with 6 dh hooks)
-> Retrieval Layer
-> Code Intelligence Engine
-> Storage + Runtime Services
```

Quan hệ thực tế:

- `CLI Interface` gọi `dh Application Layer`
- `Application Layer` quyết định policy, tạo execution envelope
- `Forked Runtime` là target nơi policy sẽ được enforce đầy đủ qua 6 hooks: model override, pre-tool-exec, pre-answer, skill activation, MCP routing, session state injection
- `Retrieval` truy vấn dữ liệu từ `Storage` và logic từ `Code Intelligence Engine`
- `Runtime Services` hỗ trợ jobs, telemetry, watch, diagnostics

## Runtime Hook Points

`dh` patch 6 hook points vào forked OpenCode Go core. Đây là surface kiểm soát trung tâm:

| Hook | Where in Go Core | Purpose |
|---|---|---|
| Model Selection Override | model dispatch path | Override model cho từng agent identity |
| Pre-Tool-Execution | tool execution path | Enforce required tools, block unauthorized, audit log |
| Pre-Answer | answer pipeline | Validate evidence, gate confidence, retry nếu thiếu |
| Skill Activation | agent initialization | Inject active skills theo lane/role/intent policy |
| MCP Routing | MCP connection/dispatch | Override MCP priority và blocking per task type |
| Session State Injection | session context building | Inject dh lane, stage, envelope, semantic mode |

Chi tiết interface cho từng hook nằm ở `docs/architecture/opencode-integration-decision.md`.

## Workflow modes

`dh` có 3 workflow mode chính:

1. `quick`
2. `delivery`
3. `migration`

Mỗi mode là một lane runtime thực sự với topology và policy riêng.

### `quick`

- 1 agent owner
- dùng đầy đủ retrieval và intelligence stack
- tối ưu tốc độ cho task hàng ngày

### `delivery`

- coordinator
- analyst
- architect
- implementers
- reviewers
- testers

Quy tắc điều phối:

- phân tích và thiết kế chạy tuần tự
- thực thi và kiểm tra có thể song song nếu task độc lập

### `migration`

- topology giống `delivery`
- policy ưu tiên preserve behavior
- giữ nguyên UI/UX và core logic khi nâng stack hoặc migrate project

## Lane lock

Khi session đã vào một lane bằng command tương ứng, lane đó bị khóa cho đến khi user chủ động chọn lane khác.

Ví dụ:

- `/quick` -> session lock = `quick`
- `/delivery` -> session lock = `delivery`
- `/migrate` -> session lock = `migration`

Coordinator hoặc orchestrator không được tự override lane lock.

## Package boundaries

Cấu trúc thực tế của `dh`:

```text
apps/
  cli/

packages/
  opencode-core/     <- Forked Go runtime with dh hooks
  opencode-sdk/      <- dh-owned internal bridge SDK
  shared/
  opencode-app/      <- dh application logic
  intelligence/
  retrieval/
  storage/
  runtime/
  providers/
```

Target distribution của `dh` là single pre-built binary cho macOS/Linux. Current state vẫn có TypeScript-centric developer/runtime surfaces; khi packaging path hoàn tất thì end users không cần cài Node.js, Go, hay OpenCode riêng.

## Trách nhiệm của từng package

### `apps/cli`

Trách nhiệm:

- nhận lệnh từ user
- hiển thị progress và stream output
- gọi vào application facade

Không nên chứa:

- parsing logic
- retrieval logic
- graph traversal logic
- hook implementation

### `packages/opencode-core`

Trách nhiệm:

- forked Go runtime — process orchestration, model dispatch, tool execution, LLM streaming
- 6 hook point integration: model override, pre-tool-exec, pre-answer, skill activation, MCP routing, session state injection
- binary entrypoint (`cmd/dh/`)
- build target: cross-compiled binary cho macOS/Linux

Không nên chứa:

- dh business logic (lane policy, skill selection, agent config)
- TypeScript code trực tiếp trong Go

### `packages/opencode-sdk`

Trách nhiệm:

- dh-owned internal bridge SDK
- type definitions và protocol contracts
- client-side utilities cho communication với Go core

### `packages/opencode-app`

Trách nhiệm (đây là nơi chứa dh business logic):

- classify intent
- resolve lane
- build retrieval plan
- chọn tool cần dùng
- chạy tool song song khi hợp lý
- merge và rerank evidence
- build final prompt
- enforce tool usage policy (called by pre-tool-exec hook)
- enforce answer confidence policy (called by pre-answer hook)
- enforce skill activation policy (called by skill activation hook)
- enforce MCP routing policy (called by MCP routing hook)
- resolve agent model assignment (called by model override hook)
- enforce lane lock (called by session state injection hook)
- điều phối team topology cho `delivery` và `migration`

Đây là nơi quyết định pipeline trả lời.

### `packages/intelligence`

Trách nhiệm:

- parse file bằng tree-sitter hoặc parser phù hợp
- extract symbol, import, export, call site
- build import graph và call graph
- tạo chunk theo symbol hoặc block
- hỗ trợ incremental indexing

Đây là lõi đọc hiểu codebase.

### `packages/retrieval`

Trách nhiệm:

- semantic search
- keyword search
- AST hoặc symbol query
- graph expansion
- normalize và score kết quả từ nhiều nguồn

Semantic search trong `dh` mặc định luôn bật và dùng `text-embedding-3-small`, nhưng có thể hạ xuống `auto` hoặc `off` bằng config hoặc command.

Đây là lớp truy xuất và hợp nhất evidence.

### `packages/storage`

Trách nhiệm:

- quản lý SQLite schema và repositories
- lưu file, symbol, chunk, graph edges
- lưu embeddings và query logs
- cung cấp cache cho AST, embedding, retrieval result

### `packages/runtime`

Trách nhiệm:

- session context
- job runner
- file watcher
- telemetry và diagnostics
- tool audit

### `packages/providers`

Trách nhiệm:

- provider/model/variant registry
- agent model assignment resolution
- provider capability sync

### `packages/shared`

Trách nhiệm:

- shared types
- constants
- helper utilities
- normalized contracts giữa các package

## Luồng dữ liệu chính

Luồng trả lời một query:

```text
User Query
-> CLI Interface
-> dh Application Layer: verify or set lane lock (via session state hook)
-> dh Application Layer: classify intent
-> dh Application Layer: build plan, resolve agent model
-> Forked Runtime: dispatch agent (model override hook selects provider/model/variant)
-> Forked Runtime: agent requests tool (pre-tool-exec hook enforces policy)
-> Retrieval: run hybrid retrieval in parallel
-> Retrieval: merge and rerank
-> Retrieval: graph expansion
-> dh Application Layer: context ranking and trimming
-> Forked Runtime: LLM generates answer (pre-answer hook validates evidence)
-> CLI Interface: stream final answer
```

## Hai vòng lặp chính của hệ thống

### 1. Query-time loop

Vòng lặp này phục vụ câu hỏi thời gian thực:

1. nhận query
2. classify intent
3. chạy retrieval
4. build context
5. gọi model
6. validate answer

Trong `delivery` và `migration`, query-time loop nằm bên trong workflow stage hiện tại và chịu điều phối bởi lane coordinator.

### 2. Index-time loop

Vòng lặp này phục vụ cập nhật kiến thức về codebase:

1. enumerate workspace
2. detect changed files
3. parse files
4. extract symbols và edges
5. build chunks
6. update storage
7. refresh embeddings nếu cần

Hai vòng lặp này phải tách rời nhau để request path không bị phụ thuộc vào reindex nặng.

## Dependency direction

```text
apps/cli -> opencode-app -> retrieval -> intelligence -> storage
apps/cli -> opencode-app -> providers
opencode-core (Go) -> hooks -> opencode-app (via FFI or embedded TS)
runtime -> intelligence
runtime -> storage
all packages -> shared
```

Không nên để:

- `intelligence` phụ thuộc `opencode-app`
- `storage` phụ thuộc `retrieval`
- `cli` phụ thuộc trực tiếp `storage`
- `opencode-core` chứa dh business logic (chỉ chứa hook call sites)

## Các primitive cốt lõi của hệ thống

Toàn bộ hệ thống nên xoay quanh một số primitive chuẩn hóa.

### Session

Giữ lane lock, repo target, semantic mode, workflow state.

### Lane

Đại diện cho `quick`, `delivery`, `migration` cùng policy riêng của từng lane.

### Role

Đại diện cho coordinator, analyst, architect, implementer, reviewer, tester.

### Work Item

Đại diện cho đơn vị công việc trong `delivery` hoặc `migration`, là thứ có thể được chia nhỏ để thực thi song song.

### Workspace

Đại diện cho root codebase đang được phân tích.

### File

Đơn vị vật lý trên filesystem, có metadata và parse status.

### Symbol

Đơn vị ngữ nghĩa như function, class, method, interface, route handler, schema block.

### Chunk

Đơn vị context để retrieval và LLM sử dụng, nên bám theo symbol hoặc block.

### Edge

Quan hệ giữa các node, ví dụ import, export, call, reference.

### Evidence Packet

Đơn vị context cuối cùng gửi cho model, có file path, symbol, line range, reason và score.

## Tại sao phải tách Retrieval khỏi Intelligence

Hai khối này liên quan chặt nhưng không nên trộn vào một package.

`Intelligence` chịu trách nhiệm xây hiểu biết nền:

- parse code
- extract structure
- build graph

`Retrieval` chịu trách nhiệm dùng hiểu biết đó để trả lời query:

- chạy search
- merge nhiều nguồn
- rank theo intent

Tách như vậy giúp:

- dễ benchmark retrieval quality
- dễ đổi ranking policy mà không phá parser/indexer
- dễ tái sử dụng intelligence engine cho nhiều workflow khác

## Tại sao phải có Runtime layer riêng

Nếu không có runtime layer, các concern sau thường bị dồn vào CLI hoặc orchestrator:

- index jobs
- file watcher
- telemetry
- debug tools
- diagnostics

Điều đó khiến hệ thống nhanh chóng rối và khó vận hành. Runtime layer giúp tách phần điều hành sản phẩm khỏi phần logic đọc hiểu code.

## Thiết kế cho độ chắc chắn thay vì chỉ demo

Để AI đọc hiểu codebase chắc chắn, không đủ chỉ có semantic search. Hệ thống cần đồng thời có:

1. symbol-aware indexing
2. graph-aware expansion
3. evidence-aware ranking
4. tool usage enforcement
5. answer validation

Đây là các yếu tố biến hệ thống từ `text search có LLM` thành `code intelligence app`.

## Những quyết định kiến trúc quan trọng

1. Fork toàn bộ OpenCode runtime (Go core + TypeScript SDK) và diverge hoàn toàn.
2. Implement 6 runtime hook points trong Go core cho Level 3 control.
3. Ship dưới dạng single pre-built binary — user không cần runtime dependencies.
4. Chọn `apps/ + packages/` với `opencode-core` và `opencode-sdk` là packages riêng.
5. Tách `opencode-app`, `retrieval`, `intelligence`, `storage`, `runtime`, `providers` thành các package độc lập.
6. Dùng `shared` để chuẩn hóa contracts và tránh circular dependency.
7. Giữ lane lock như runtime contract không được vi phạm — enforce qua session state injection hook.
8. Giữ `query-time flow` tách khỏi `index-time flow`.

## Tài liệu liên quan

- `docs/project-architecture.md`: tài liệu tổng hợp ý tưởng và roadmap
- `docs/architecture/opencode-integration-decision.md`: ADR chốt fork strategy, hook points, binary distribution
- `docs/architecture/indexing-model.md`: schema và mô hình index
- `docs/architecture/retrieval-strategy.md`: strategy cho intent, tool selection và context building
- `docs/architecture/workflow-orchestration.md`: lane model, handoff rules và orchestration contract
- `docs/architecture/skills-and-mcp-integration.md`: default skills, MCP routing và activation policy
- `docs/architecture/agent-contracts.md`: role contracts, execution envelope và escalation rules
- `docs/architecture/runtime-state-schema.md`: session state, workflow state, work items, envelopes và audits
- `docs/architecture/model-routing-and-agent-config.md`: agent model assignment, registry và config flow
- `docs/architecture/source-tree-blueprint.md`: source tree và file layout cho implementation
- `docs/architecture/implementation-sequence.md`: thứ tự build thực tế theo phases

## Kết luận

Kiến trúc này tối ưu cho một mục tiêu rất cụ thể: giúp AI có context thật về codebase thay vì đoán từ text match rời rạc. Muốn đạt điều đó, package boundaries phải rõ, data flow phải tách lớp, evidence phải đi xuyên suốt từ indexing đến final answer, và runtime hooks phải enforce mọi policy ở cấp code.
