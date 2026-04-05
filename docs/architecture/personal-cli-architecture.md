# DH Personal CLI Architecture

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt hướng kiến trúc thực dụng cho `dh`, app cá nhân sở hữu toàn bộ runtime qua fork OpenCode (Go core + TypeScript SDK), lấy cảm hứng từ các công cụ đi trước như Cursor, Augment và Antigravity nhưng lọc lại theo 4 ràng buộc thực tế:

1. trước mắt chỉ cần CLI, không cần GUI
2. đây là app cá nhân, nên phải tối ưu chi phí vận hành
3. hệ thống sở hữu runtime riêng qua fork OpenCode — không phụ thuộc external install
4. ship dưới dạng single pre-built binary cho macOS/Linux

Mục tiêu không phải sao chép nguyên xi các sản phẩm lớn, mà là giữ lại các cơ chế tạo ra chất lượng đọc hiểu codebase và loại bỏ các phần đắt, nặng hoặc chưa cần ở giai đoạn cá nhân.

Current implementation note:

- Đây là tài liệu định hướng kiến trúc và trade-off ở mức sản phẩm.
- Current codebase đã hiện thực local-first TypeScript path, semantic retrieval mặc định, SQLite persistence, CLI workflows, Go runtime integration và single-binary distribution path.
- Phần còn lại của tài liệu này nên được đọc như trade-off và hướng mở rộng của sản phẩm hơn là gap completion ở current shipped state.

Tên app được chốt là `dh`.

## Những gì nên học từ Cursor, Augment, Antigravity

### 1. Không query trực tiếp trên repo thô

Điểm chung mạnh nhất của các công cụ tốt là chúng không để LLM đọc repo thô theo từng query. Chúng biến repo thành một lớp knowledge trung gian gồm:

- file metadata
- symbol index
- chunk index
- import graph
- call or reference graph
- semantic retrieval metadata

Đây là phần bắt buộc phải giữ lại.

### 2. Dùng hybrid retrieval thay vì một loại search duy nhất

Điểm nên giữ lại:

- keyword search cho tốc độ và độ chính xác với identifier cụ thể
- symbol or AST search cho definition và references
- graph expansion cho trace flow
- semantic retrieval cho natural language queries

Đây là cơ chế lõi giúp đọc hiểu vừa sâu vừa chắc.

### 3. Chỉ đưa cho model context nhỏ nhưng đúng

Điểm nên giữ lại:

- chunk theo symbol hoặc block thay vì token ngẫu nhiên
- rerank evidence trước khi build prompt
- chỉ mở rộng graph từ top seeds đủ tốt
- final prompt dùng evidence packets thay vì cả file dài

### 4. Tách index-time khỏi query-time

Điểm nên giữ lại:

- parse và index trước
- query chỉ làm lookup, rerank và compose context
- chỉ reindex file thay đổi

Đây là lý do các công cụ mạnh thường rất nhanh.

## Những gì không nên bê nguyên vào app của chúng ta

Vì đây là app cá nhân CLI-first, có nhiều thứ từ các công cụ lớn không cần mang vào sớm.

### 1. Không cần GUI architecture

Chưa cần:

- editor extension phức tạp
- UI state management
- collaboration layer
- remote sync UI

Chỉ cần CLI commands rõ ràng như:

- `ask`
- `explain`
- `trace`
- `index`
- `doctor`

### 2. Không cần hạ tầng phân tán

Chưa cần:

- remote vector database
- distributed workers
- queue phức tạp
- cloud indexing pipeline

Thay vào đó nên ưu tiên:

- SQLite
- local cache
- local file watcher
- local background jobs đơn giản

### 3. Semantic là mặc định nhưng phải cost-aware

`dh` mặc định luôn bật semantic retrieval vì mục tiêu là đọc hiểu codebase chắc hơn text search thuần.

Tuy nhiên semantic layer phải được kiểm soát chi phí bằng:

- incremental embedding
- chunking chuẩn
- caching
- semantic mode policy

Provider mặc định:

- OpenAI `text-embedding-3-small`

Không dùng local embedding backend mặc định để tránh yêu cầu cấu hình riêng cho từng máy.

## Quyết định kiến trúc mới cho app của chúng ta

Kiến trúc cũ coi OpenCode như lớp shell bên ngoài. Kiến trúc mới sở hữu runtime qua fork, hướng `single-user, CLI-first, local-first, cost-aware, binary-distributed`.

### Quyết định 1: Chỉ giữ CLI

Interface trước mắt chỉ gồm CLI.

```text
apps/
  cli/
```

Không tạo `apps/api` hay `apps/worker` ở phase đầu. Nếu cần background work, đặt nó trong runtime nội bộ thay vì tách app riêng.

### Quyết định 2: Fork OpenCode làm runtime lõi

Không dùng OpenCode như external shell. `dh` fork toàn bộ OpenCode runtime (Go core + TypeScript SDK) và diverge hoàn toàn.

`dh` sở hữu:

- model dispatch (override qua model selection hook)
- tool execution (gate qua pre-tool-exec hook)
- answer pipeline (validate qua pre-answer hook)
- skill activation (inject qua skill activation hook)
- MCP routing (control qua MCP routing hook)
- session state (inject qua session state hook)

Forked runtime nằm ở:

- `packages/opencode-core/` (Go)
- `packages/opencode-sdk/` (TypeScript)

App logic riêng của `dh` (planning, enforcement, context building) nằm ở:

- `packages/opencode-app/`

Chi tiết quyết định fork: `docs/architecture/opencode-integration-decision.md`

### Quyết định 3: Binary distribution

`dh` ship dưới dạng single pre-built binary:

- macOS: arm64 (Apple Silicon), amd64 (Intel)
- Linux: amd64, arm64

User không cần cài Node.js, Go, hay bất kỳ runtime nào. Binary là self-contained.

### Quyết định 4: Ưu tiên local-first storage

Toàn bộ phase đầu nên local-first:

- SQLite cho metadata và graph
- local filesystem cache cho snapshots và embeddings nếu có
- không phụ thuộc dịch vụ ngoài cho indexing

### Quyết định 5: Symbol-first, graph-next, semantic-always

Đây là quyết định tối ưu chi phí quan trọng nhất.

Thứ tự đầu tư nên là:

1. keyword search
2. symbol extraction
3. definition and reference lookup
4. import graph
5. call graph
6. context builder
7. semantic retrieval với `text-embedding-3-small`

Lý do:

- symbol + graph + keyword vẫn là xương sống của độ chính xác
- semantic giúp tăng recall và xử lý query tự nhiên
- semantic phải được dùng như tín hiệu mạnh nhưng không được phá cost discipline

### Quyết định 6: Incremental indexing và embeddings đều là capability bắt buộc

Nếu phải chọn một thứ để tối ưu tốc độ, nên tối ưu incremental indexing trước, vì semantic của `dh` sẽ sống dựa trên index tốt chứ không thay thế index.

Incremental indexing giúp:

- query nhanh hơn
- reindex rẻ hơn
- trải nghiệm mượt hơn hàng ngày

Embeddings là capability bắt buộc của `dh`, nhưng phải được triển khai theo hướng tiết kiệm và incremental.

## Kiến trúc mục tiêu đã lọc

Hệ thống có 6 khối chính:

```text
CLI
-> dh Application Layer (lane, planning, enforcement, context)
-> Forked OpenCode Runtime (Go core + TS SDK, with 6 dh hooks)
-> Retrieval Layer
-> Code Intelligence Layer
-> Local Storage and Runtime
```

Giải thích:

- `CLI`: giao diện duy nhất
- `dh Application Layer`: intent, planning, tool routing, context building, enforcement policy
- `Forked OpenCode Runtime`: process orchestration, model dispatch, tool execution, LLM streaming — tất cả đi qua dh hooks
- `Retrieval Layer`: keyword, symbol, graph, semantic default-on
- `Code Intelligence Layer`: parser, symbols, imports, calls, chunking
- `Local Storage and Runtime`: SQLite, cache, watcher, incremental indexing

## Cấu trúc thư mục khuyến nghị mới

```text
apps/
  cli/
    src/
      commands/
        quick.ts
        delivery.ts
        migrate.ts
        ask.ts
        explain.ts
        trace.ts
        index.ts
        doctor.ts
        config.ts
      presenters/
        text-presenter.ts
        json-presenter.ts
        stream-presenter.ts
      interactive/
        config-agent-flow.ts
        selectors/
      adapters/
        runtime-client.ts
      main.ts

packages/
  opencode-core/
    cmd/dh/
    internal/
      hooks/
        model_override.go
        pre_tool_exec.go
        pre_answer.go
        skill_activation.go
        mcp_routing.go
        session_state.go
      dispatch/
      executor/
      answer/
    pkg/
    FORK_ORIGIN.md
    PATCHES.md
    Makefile
    go.mod

  opencode-sdk/
    src/
    package.json
    FORK_ORIGIN.md
    PATCHES.md

  shared/
    src/
      types/
      constants/
      utils/

  opencode-app/
    src/
      lane/
      intents/
      planner/
      executor/
      context/
      policies/
      team/
      registry/
      contracts/
      config/

  intelligence/
    src/
      parser/
      symbols/
      imports/
      calls/
      chunks/
      graph/
      indexer/
      workspace/

  retrieval/
    src/
      keyword/
      symbol/
      graph/
      semantic/
      merge/

  storage/
    src/
      sqlite/
      cache/
      fs/

  runtime/
    src/
      session/
      workflow/
      config/
      watch/
      jobs/
      diagnostics/
      telemetry/

  providers/
    src/
      registry/
      resolution/
      contracts/

docs/
  architecture/
  decisions/
  runbooks/
```

Điểm khác với bản trước:

- thêm `opencode-core` (Go, forked) và `opencode-sdk` (TypeScript, forked)
- bỏ `api`, `worker` riêng
- bỏ `llm` thành package riêng vì LLM access đi qua forked Go core
- `opencode-app` chứa dh business logic, gọi qua hooks từ Go core

## Vai trò của từng package trong phiên bản cá nhân

### `apps/cli`

Chứa entrypoint và UX CLI.

Nhiệm vụ:

- parse command và flags
- stream kết quả
- hiển thị answer và citations

### `packages/opencode-app`

Đây là application layer chứa dh business logic — policy engine được gọi bởi hooks trong forked runtime.

Nhiệm vụ:

- classify intent
- resolve and lock lane
- lập retrieval plan
- chọn tools cần chạy
- gọi retrieval primitives
- build evidence packets
- kiểm tra answer confidence
- điều phối multi-agent workflow cho `delivery` và `migration`
- implement enforcement functions cho 6 hooks:
  - `resolveAgentModel()` -> model selection override hook
  - `enforceToolUsage()` -> pre-tool-exec hook
  - `validateAnswer()` -> pre-answer hook
  - `resolveSkills()` -> skill activation hook
  - `routeMcps()` -> MCP routing hook
  - `injectSessionState()` -> session state injection hook

Đây là lớp giữ `secret sauce` ở mức app logic.

### `packages/intelligence`

Nhiệm vụ:

- parse code
- trích xuất symbols
- trích xuất imports và calls
- build graph
- chunk theo symbol hoặc block
- cập nhật index theo file thay đổi

### `packages/retrieval`

Nhiệm vụ:

- keyword search
- symbol lookup
- references and definition lookup
- graph expansion
- semantic retrieval mặc định luôn bật
- merge và rerank

### `packages/storage`

Nhiệm vụ:

- SQLite schema
- lưu files, symbols, chunks, edges, query logs
- local caches
- local snapshot state

### `packages/runtime`

Nhiệm vụ:

- file watching
- index jobs
- diagnostics
- telemetry nhẹ

## Tối ưu chi phí: nguyên tắc bắt buộc

Vì đây là app cá nhân, cost control phải là một phần của kiến trúc, không phải tối ưu sau.

### 1. Local-first

Ưu tiên local compute và local storage khi có thể.

### 2. Không embedding lại toàn bộ repo mỗi lần

Chỉ tạo hoặc cập nhật embedding khi:

- file thay đổi
- chunk mới được tạo

Không được re-embed toàn bộ repo cho mỗi query.

### 3. Query phải rẻ hơn indexing

Mọi việc nặng nên chuyển sang indexing time:

- parsing
- symbol extraction
- graph building
- hash computation

Query time chỉ nên:

- lookup
- rerank
- expand graph có kiểm soát
- build prompt nhỏ

### 4. Context budget phải nhỏ và có kỷ luật

Không nhồi nhiều file vào context chỉ vì model đủ to.

Nên ưu tiên:

- definition chính
- callers hoặc callees gần nhất
- config hoặc schema liên quan trực tiếp

### 5. Semantic retrieval có mode điều chỉnh chi phí

Semantic retrieval của `dh` mặc định là `always`, nhưng user có thể đổi mode bằng config hoặc command:

- `always`
- `auto`
- `off`

## Thứ tự đầu tư kỹ thuật mới

### Phase 1: giá trị cao, chi phí thấp

Mục tiêu: có app CLI đọc hiểu codebase tốt hơn grep truyền thống.

Làm trước:

1. CLI commands
2. workspace scanner
3. parser và symbol extractor
4. SQLite schema cho files, symbols, chunks, edges
5. keyword search
6. symbol search
7. definition và reference lookup
8. import graph cơ bản
9. context builder dùng evidence packets

### Phase 2: tăng chiều sâu đọc hiểu

Mục tiêu: trace flow và impact analysis tốt.

Làm tiếp:

1. call graph
2. graph expansion theo intent
3. reranking nhiều tín hiệu
4. incremental indexing
5. file watcher

### Phase 3: semantic layer có kiểm soát

Mục tiêu: hỗ trợ câu hỏi tự nhiên tốt hơn nhưng vẫn giữ chi phí thấp.

Làm sau:

1. embedding pipeline dùng OpenAI `text-embedding-3-small`
2. semantic search cho top chunks
3. hybrid scoring có semantic như tín hiệu phụ
4. cache embeddings và invalidation strategy

Trong `dh`, phase này không có nghĩa là thêm semantic từ đầu số 0, mà là hoàn thiện quality, cache và cost-control của semantic layer đã tồn tại.

## Những gì kiến trúc mới coi là bắt buộc

1. fork OpenCode runtime (Go + TS) và diverge hoàn toàn
2. 6 runtime hook points cho Level 3 control
3. symbol-first indexing
4. graph-aware retrieval
5. evidence packets
6. incremental indexing
7. local SQLite store
8. CLI-first workflow
9. single binary distribution (macOS/Linux)
10. lane lock theo session
11. semantic retrieval default-on
12. very-hard tool enforcement qua pre-tool-exec hook

## Những gì kiến trúc mới coi là chưa cần

1. GUI
2. HTTP API
3. cloud vector DB
4. distributed jobs
5. multi-user collaboration
6. Node.js/Go runtime requirement cho end user

## Lệnh CLI mục tiêu

Ở phase đầu, app nên có một bộ command nhỏ nhưng đủ mạnh:

```text
dh quick "how auth works"
dh delivery "build feature X"
dh migrate "upgrade Next.js to latest"
dh ask "how auth works"
dh explain login
dh trace payment.checkout
dh index
dh doctor
dh doctor --json
dh doctor --debug-dump
```

Có thể thêm flag:

- `--repo`
- `--semantic`
- `--json`
- `--verbose`
- `--reindex`

Lane commands phải khóa session vào workflow tương ứng cho đến khi user chủ động đổi lane.

## Kết luận

Kiến trúc đã lọc cho app của chúng ta là:

- giữ lại phần mạnh nhất của Cursor, Augment, Antigravity: symbol index, graph expansion, hybrid retrieval, context cẩn thận
- bỏ các phần chưa cần cho app cá nhân: GUI, cloud infra, distributed services
- sở hữu toàn bộ runtime qua fork OpenCode — không wrapper, không external dependency
- 6 hook points cho Level 3 control: model override, pre-tool-exec, pre-answer, skill activation, MCP routing, session state injection
- ship dưới dạng single binary — user chỉ cần download và chạy
- tối ưu chi phí bằng local-first, SQLite-first, incremental indexing, semantic default-on nhưng có mode kiểm soát chi phí

Đây là hướng phù hợp nhất để đạt chất lượng đọc hiểu codebase cao mà vẫn thực tế để một cá nhân tự xây và vận hành.
