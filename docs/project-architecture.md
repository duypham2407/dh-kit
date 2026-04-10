# DH Architecture

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt kiến trúc cho `dh`, một AI software factory sở hữu toàn bộ runtime của mình thông qua fork hoàn toàn OpenCode (Go core + TypeScript SDK). Mục tiêu:

- AI search codebase tốt
- AI đọc hiểu codebase sâu
- AI trace flow qua nhiều file chắc chắn
- AI trả lời dựa trên evidence thay vì đoán
- runtime enforce tool usage ở cấp code, không chỉ nhắc trong prompt
- hỗ trợ 3 lane workflow chính: `quick`, `delivery`, `migration`
- ship dưới dạng single binary cho macOS và Linux

Quyết định kiến trúc quan trọng nhất:

- `dh` fork toàn bộ OpenCode runtime (Go core + dh-owned bridge SDK) và diverge hoàn toàn
- `dh` sở hữu 6 runtime hook points để kiểm soát model selection, tool execution, answer gating, skill activation, MCP routing, và session state injection
- `dh` được phân phối dưới dạng pre-built binary, user không cần cài Node.js hay Go
- Chi tiết quyết định tại `docs/architecture/opencode-integration-decision.md`

Current implementation note:

- Đây là tài liệu kiến trúc tổng hợp ở mức target state, nhưng các khối chính được mô tả ở đây hiện đã có implementation và validation tương ứng trong codebase hiện tại.
- Current codebase đã có persistence, workflows, retrieval, semantic retrieval, config flows, diagnostics, Go runtime hook wiring, release packaging và single-binary distribution path chạy được end-to-end.
- Những phần còn lại nên được đọc chủ yếu như hướng mở rộng và tối ưu hóa tiếp theo, không còn là blocker cho trạng thái hoàn thành hiện tại.

Nguyên tắc nền:

1. Chất lượng context quan trọng hơn chất lượng model.
2. Retrieval phải là multi-source: semantic + keyword + AST + graph.
3. Code intelligence phải là first-class layer, không phải phần phụ.
4. Tool usage phải được enforce ở runtime level, bằng code hook thực sự.
5. Lane workflow là runtime contract cốt lõi.
6. `dh` sở hữu runtime — không phụ thuộc external OpenCode install.

## Mental Model

Hệ thống nên được nhìn như 6 lớp chồng lên nhau:

```text
CLI Interface
-> dh Application Layer (lane, planning, enforcement, context)
-> Forked OpenCode Runtime (Go core + dh-owned bridge SDK, with 6 dh hooks)
-> Code Intelligence Engine
-> Retrieval Layer
-> Index + Storage + Runtime Layer
```

Giải thích ngắn:

- `CLI Interface` nhận query và stream output.
- `dh Application Layer` hiểu intent, chọn lane, chọn tool, điều phối pipeline và agent topology, enforce skills/MCP.
- `Forked OpenCode Runtime` xử lý model dispatch, tool execution, LLM streaming — nhưng mọi quyết định đều đi qua dh hooks.
- `Code Intelligence Engine` parse code, trích xuất symbol, build graph.
- `Retrieval Layer` thực hiện search đa nguồn và rerank.
- `Index + Storage + Runtime` lưu index, cache, job, telemetry, diagnostics.

## Kiến trúc tổng thể đề xuất

Lưu ý cập nhật quan trọng:

- `dh` fork toàn bộ OpenCode runtime (Go core + TypeScript SDK) và diverge hoàn toàn khỏi upstream
- đây là app cá nhân nên kiến trúc phải `local-first` và `cost-aware`
- OpenCode không còn là lớp shell bên ngoài — nó là runtime lõi do dh sở hữu
- target distribution của dh là single pre-built binary cho macOS/Linux
- semantic retrieval mặc định luôn bật bằng `text-embedding-3-small`
- user có thể hạ semantic mode qua config hoặc command khi cần tối ưu chi phí
- workflow session bị khóa theo lane cho đến khi user chủ động đổi lane
- 6 hook points (model override, pre-tool-exec, pre-answer, skill activation, MCP routing, session injection) được patch trực tiếp vào Go core

Tài liệu chi tiết cho quyết định fork nằm ở `docs/architecture/opencode-integration-decision.md`.
Tài liệu chi tiết cho hướng CLI-first nằm ở `docs/architecture/personal-cli-architecture.md`.

## Danh tính sản phẩm

Tên app là `dh`.

`dh` không phải chỉ là CLI chat repo. Mục tiêu của nó là kết hợp 2 năng lực chính:

1. đọc hiểu codebase sâu bằng structural retrieval
2. điều phối workflow AI theo lane và vai trò agent

## Workflow Lanes

`dh` có 3 lane chính:

1. `quick`
2. `delivery`
3. `migration`

### `quick`

- dành cho task hàng ngày, hẹp, ít ceremony
- chỉ có 1 workflow owner agent
- agent này vẫn dùng đầy đủ sub-tools, retrieval và intelligence stack

### `delivery`

- dành cho feature work hoặc công việc cần team nhiều vai trò
- có coordinator, analyst, architect, implementers, reviewers, testers
- giai đoạn phân tích và thiết kế là tuần tự
- giai đoạn thực thi và kiểm tra có thể song song nếu task không giẫm chân nhau

### `migration`

- topology giống `delivery`
- chuyên cho migrate project, upgrade stack, remediation compatibility
- policy ưu tiên giữ nguyên UI/UX và core logic

## Lane Lock Contract

Khi user vào một lane bằng command tương ứng, session bị khóa vào lane đó.

Ví dụ:

- `/quick` khóa session vào `quick`
- `/delivery` khóa session vào `delivery`
- `/migrate` khóa session vào `migration`

Runtime không được tự ý chuyển lane. Chỉ user mới được đổi lane bằng cách bắt đầu workflow lane khác.

### Hướng production-ready

```text
apps/
  cli/

packages/
  opencode-core/      <- Forked Go runtime with dh hooks
  opencode-sdk/       <- dh-owned internal bridge SDK
  shared/
  opencode-app/       <- dh application logic (planning, enforcement, context)
  intelligence/
  retrieval/
  storage/
  runtime/
  providers/

docs/
  architecture/
  decisions/
  runbooks/
```

### Build pipeline

```text
1. Compile packages/opencode-core (Go) with dh hooks
2. Compile packages/opencode-sdk (TypeScript) -> bundled JS
3. Compile packages/* (dh TypeScript logic) -> bundled JS
4. Embed or link TS bundles into Go binary
5. Cross-compile for macOS (arm64, amd64) and Linux (amd64, arm64)
6. Output: single binary per platform
```

Khuyến nghị:

- kiến trúc hiện tại là `CLI-first, local-first, binary-distributed`
- `dh` sở hữu toàn bộ runtime qua fork OpenCode — không phải wrapper hay adapter
- trong mọi biến thể, lane orchestration, tool enforcement và code intelligence vẫn là phần bắt buộc của kiến trúc hoàn chỉnh
- 6 runtime hooks được patch vào Go core là điểm kiểm soát chính

## Layer 1: Interface

Interface phải mỏng. Nó không nên chứa logic retrieval, parsing hay graph traversal.

Ví dụ cấu trúc:

```text
apps/
  cli/
    src/
      commands/
        ask.ts
        explain.ts
        trace.ts
        index.ts
        doctor.ts
      ui/
        stream-renderer.ts
        result-printer.ts
      main.ts

  api/
    src/
      routes/
        ask.ts
        search.ts
        trace.ts
        index.ts
        health.ts
      server.ts
```

Trách nhiệm:

- nhận query từ user
- nhận repo path hoặc workspace target
- stream output về CLI/API
- gọi vào orchestrator hoặc application service

Không nên:

- parse file trực tiếp ở CLI
- truy vấn SQLite trực tiếp ở route handler
- chứa logic xếp hạng context

## Layer 2: dh Application Layer + Forked OpenCode Runtime

Đây là trái tim của hệ thống. `dh` sở hữu toàn bộ runtime qua fork OpenCode, với 6 hook points cho phép kiểm soát sâu. Application layer (`packages/opencode-app`) quyết định policy, còn forked runtime (`packages/opencode-core`) thực thi policy đó qua hooks.

Cấu trúc application layer:

```text
packages/opencode-app/
  src/
    planner/
      classify-intent.ts
      resolve-lane.ts
      choose-tools.ts
      define-expansion-strategy.ts
      plan-query.ts

    executor/
      run-plan.ts
      run-tool-batch.ts
      enforce-tool-usage.ts
      enforce-lane-lock.ts
      retry-policy.ts
      timeout-policy.ts

    context/
      collect-context.ts
      dedupe-context.ts
      rank-context.ts
      trim-context.ts
      build-final-prompt.ts

    policies/
      tool-policy.ts
      answer-policy.ts
      safety-policy.ts
      budget-policy.ts

    workflows/
      quick.ts
      delivery.ts
      migration.ts
      answer-question.ts
      explain-symbol.ts
      trace-flow.ts
      impact-analysis.ts

    team/
      coordinator.ts
      analyst.ts
      architect.ts
      implementer.ts
      reviewer.ts
      tester.ts

    contracts/
      plan.ts
      tool-result.ts
      context-item.ts
      answer-request.ts
      answer-response.ts
```

Cấu trúc forked runtime:

```text
packages/opencode-core/
  cmd/dh/           <- binary entrypoint
  internal/
    hooks/          <- 6 dh hook points patched into runtime
      model_override.go
      pre_tool_exec.go
      pre_answer.go
      skill_activation.go
      mcp_routing.go
      session_state.go
    dispatch/       <- modified model dispatch path
    executor/       <- modified tool execution path
    answer/         <- modified answer pipeline
  pkg/
  FORK_ORIGIN.md
  PATCHES.md
  Makefile
```

Trách nhiệm application layer:

- hiểu intent của user
- xác định hoặc xác minh lane hiện tại
- lập plan retrieval
- chạy tool song song khi hợp lý
- merge và xếp hạng kết quả
- graph expansion khi cần trace flow
- build context cuối cho LLM
- enforce tool usage theo loại query — qua pre-tool-exec hook
- enforce lane lock theo session — qua session state injection hook
- điều phối topology cho `delivery` và `migration`

Trách nhiệm forked runtime (Go core):

- process orchestration, model dispatch (overridden bởi model selection hook)
- tool execution (gated bởi pre-tool-exec hook)
- LLM streaming và response pipeline (gated bởi pre-answer hook)
- session management (injected bởi session state hook)
- MCP connection management (routed bởi MCP routing hook)
- skill context injection (managed bởi skill activation hook)

Phần bắt buộc nên có ở cả hai tầng:

1. `classify-intent.ts`
2. `resolve-lane.ts`
3. `choose-tools.ts`
4. `enforce-tool-usage.ts`
5. `enforce-lane-lock.ts`
6. `rank-context.ts`
7. `trim-context.ts`

Nếu thiếu `enforce-tool-usage`, hệ thống sẽ quay về kiểu trả lời dựa trên suy đoán.

Nếu thiếu `enforce-lane-lock`, hệ thống sẽ tự drift sang workflow khác và phá vỡ hợp đồng session.

## Semantic Retrieval Policy

`dh` hỗ trợ semantic retrieval như một phần của hybrid retrieval và mặc định luôn bật.

Chính sách hiện tại:

1. embedding provider mặc định là OpenAI
2. embedding model mặc định là `text-embedding-3-small`
3. semantic mode mặc định là `always`
4. user có thể chuyển semantic mode sang `auto` hoặc `off` bằng config hoặc command
5. không dùng local embedding backend mặc định để tránh tăng chi phí cấu hình mỗi máy

Semantic retrieval là tín hiệu quan trọng nhưng không được là nguồn quyết định duy nhất. Nó phải luôn được kết hợp với keyword, symbol và graph.

## Layer 3: Code Intelligence Engine

Đây là phần quan trọng nhất để AI hiểu codebase thật sự.

Ví dụ cấu trúc:

```text
packages/intelligence/
  src/
    parser/
      language-registry.ts
      tree-sitter-adapter.ts
      parse-file.ts

    symbols/
      symbol-kinds.ts
      extract-symbols.ts
      symbol-normalizer.ts
      symbol-relationships.ts

    imports/
      extract-imports.ts
      resolve-import-path.ts
      module-resolution.ts

    calls/
      extract-call-sites.ts
      resolve-call-targets.ts

    chunks/
      chunk-by-symbol.ts
      chunk-by-block.ts
      chunk-ranking-features.ts

    graph/
      build-import-graph.ts
      build-symbol-graph.ts
      build-call-graph.ts
      graph-traversal.ts
      graph-distance.ts

    workspace/
      detect-projects.ts
      detect-languages.ts
      detect-config-files.ts
      enumerate-files.ts

    indexer/
      full-index.ts
      incremental-index.ts
      file-change-processor.ts
      delete-file.ts
```

Trách nhiệm:

- parse code ra AST
- trích xuất symbols
- trích xuất import/export
- trích xuất call sites
- build graph giữa file, module, symbol
- tạo chunk theo cấu trúc code thật

Tối thiểu phải hỗ trợ các thực thể:

1. file
2. symbol
3. import/export edge
4. call edge
5. chunk theo symbol hoặc block
6. metadata về language, hash, timestamps

## Layer 4: Retrieval

Retrieval nên là package riêng, không trộn vào orchestrator.

Ví dụ cấu trúc:

```text
packages/retrieval/
  src/
    semantic/
      embed-query.ts
      semantic-search.ts
      semantic-ranker.ts

    keyword/
      keyword-search.ts
      regex-search.ts

    ast/
      ast-query.ts
      symbol-search.ts
      definition-search.ts
      reference-search.ts

    graph/
      expand-from-symbol.ts
      expand-from-file.ts
      find-callers.ts
      find-callees.ts
      find-dependencies.ts
      find-dependents.ts

    merge/
      normalize-result.ts
      merge-results.ts
      score-results.ts
      rerank-results.ts

    query/
      retrieval-request.ts
      retrieval-result.ts
      retrieval-features.ts
```

Trách nhiệm:

- semantic search
- keyword search
- AST/symbol search
- graph expansion
- merge kết quả từ nhiều nguồn
- rerank thành một thứ tự thống nhất

Scoring nên là hybrid scoring. Ví dụ:

```ts
score =
  semanticScore * 0.35 +
  keywordScore * 0.20 +
  symbolMatchScore * 0.20 +
  graphDistanceScore * 0.15 +
  pathHeuristicScore * 0.10;
```

Các trọng số có thể được tune sau dựa trên dữ liệu query thực tế.

## Layer 5: LLM (thông qua Forked Runtime)

LLM access giờ đi qua forked OpenCode Go core. `dh` không cần package `llm` riêng vì:

- model dispatch đã được kiểm soát qua model selection override hook
- streaming đi qua Go core
- guardrails được enforce qua pre-answer hook
- prompt building vẫn nằm ở `packages/opencode-app/src/context/`

Nếu cần thêm prompt templates hoặc adapter logic, chúng nằm trong application layer chứ không phải package riêng.

## Layer 6: Storage

Storage là nền cho index bền vững, query nhanh và dễ debug.

```text
packages/storage/
  src/
    sqlite/
      db.ts
      migrations/
      repositories/
        files-repo.ts
        symbols-repo.ts
        chunks-repo.ts
        edges-repo.ts
        jobs-repo.ts

    vector/
      vector-store.ts
      embedding-repo.ts

    cache/
      query-cache.ts
      file-cache.ts
      embedding-cache.ts

    fs/
      workspace-store.ts
      snapshot-store.ts
```

Khuyến nghị thực tế:

1. SQLite cho file, symbol, chunk, graph edges, job state, query logs.
2. Vector store có thể bắt đầu đơn giản, chưa cần external service ngay.
3. Cache phải có cho embeddings, parsed AST và query results.

Schema tối thiểu nên có:

- `files`
- `symbols`
- `chunks`
- `imports`
- `calls`
- `references`
- `embeddings`
- `index_runs`
- `query_logs`

## Layer 7: Runtime

Runtime là phần điều hành hệ thống trong thực tế: indexing jobs, file watch, telemetry, diagnostics.

```text
packages/runtime/
  src/
    session/
      session-manager.ts
      request-context.ts

    jobs/
      job-queue.ts
      index-job-runner.ts
      reindex-worker.ts

    watchers/
      file-watcher.ts
      debounce.ts

    config/
      app-config.ts
      env.ts
      feature-flags.ts

    telemetry/
      logger.ts
      metrics.ts
      tracing.ts
      tool-audit.ts

    diagnostics/
      doctor.ts
      health-check.ts
      debug-dump.ts
```

Trách nhiệm:

- quản lý session và request context
- chạy background indexing
- theo dõi thay đổi file để incremental reindex
- ghi telemetry và audit trail
- hỗ trợ diagnostics khi câu trả lời sai hoặc thiếu context

Nếu muốn hệ thống đọc hiểu codebase sâu và chắc, `tool-audit.ts` là một phần gần như bắt buộc.

## Shared Contracts

Nên có package riêng cho shared types và utilities dùng chung.

```text
packages/shared/
  src/
    types/
      file.ts
      symbol.ts
      chunk.ts
      graph.ts
      search.ts
      answer.ts

    constants/
      languages.ts
      symbol-kinds.ts
      tool-names.ts

    utils/
      hash.ts
      path.ts
      async.ts
      text.ts
      score.ts
```

Lợi ích:

- tránh circular dependency
- thống nhất contracts giữa orchestrator, retrieval, intelligence và storage
- dễ mở rộng cho CLI, API và worker

## Luồng dữ liệu chuẩn

Luồng truy vấn chuẩn nên như sau:

```text
User Query
-> Intent Classifier
-> Query Planner
-> Parallel Retrieval
   - Semantic Search
   - Keyword Search
   - Symbol or AST Search
-> Merge + Normalize
-> Graph Expansion
-> Context Ranking
-> Context Trimming
-> Prompt Builder
-> LLM Streaming Answer
-> Evidence Validation
-> Final Response
```

Phần cần nhấn mạnh:

1. Retrieval nên chạy song song khi có thể.
2. Graph expansion chỉ chạy sau khi đã có seed results chất lượng.
3. Final answer phải được kiểm tra theo evidence threshold.

## Những lớp dữ liệu bắt buộc phải index

### 1. File Index

Mỗi file nên có:

- path
- language
- size
- hash
- updated_at
- parse_status

### 2. Symbol Index

Mỗi symbol nên có:

- id
- name
- kind
- file_id
- start_line
- end_line
- signature
- exported
- parent_symbol_id

### 3. Chunk Index

Mỗi chunk nên có:

- id
- file_id
- symbol_id nullable
- chunk_type
- content
- token_estimate
- embedding_id nullable

### 4. Graph Index

Các edge chính:

- import edge
- export edge
- call edge
- reference edge

### 5. Query Log

Để debug và tune retrieval, mỗi query nên lưu:

- query text
- intent
- generated plan
- tools used
- top results
- latency
- failures
- final answer summary

Nếu thiếu `query_logs`, rất khó debug vì sao AI trả lời sai.

## Cách AI nên search theo intent

Không nên có một kiểu search duy nhất cho mọi câu hỏi. Nên có retrieval profile theo intent.

Ví dụ:

### Query: `how auth works`

- semantic search với `auth`, `session`, `login`, `token`
- keyword search với pattern gần nghĩa
- symbol search cho `AuthService`, `login`, `validateToken`
- graph expansion theo callers, callees, imports

### Query: `where is user permissions enforced`

- keyword search và symbol search trước
- graph expansion từ middleware, guard, policy, permission service

### Query: `why changing payment service breaks checkout`

- dependency graph
- call graph
- reference search
- context từ checkout flow và payment boundary

## Enforce Tool Usage

Đây là phần bắt buộc nếu muốn hệ thống hoạt động chắc chắn.

Không nên chỉ viết trong prompt kiểu `please use tool`. Phải có policy ở runtime.

Ví dụ contract:

```ts
type Intent =
  | "find_definition"
  | "trace_flow"
  | "explain_module"
  | "impact_analysis"
  | "bug_investigation";

const requiredToolsByIntent = {
  find_definition: ["symbolSearch"],
  trace_flow: ["symbolSearch", "graphExpand"],
  explain_module: ["keywordSearch", "symbolSearch"],
  impact_analysis: ["graphExpand", "referenceSearch"],
  bug_investigation: ["keywordSearch", "symbolSearch", "graphExpand"],
};
```

Sau khi executor chạy xong:

- nếu thiếu required tools
- hoặc evidence score dưới ngưỡng
- thì không cho phép final answer confident

Khi đó hệ thống có thể:

1. retry với plan mạnh hơn
2. trả về `insufficient evidence`
3. yêu cầu user cung cấp thêm scope cụ thể

## Context Builder nên hoạt động thế nào

Context gửi cho model không nên là raw file dài, mà nên là tập evidence packets.

Ví dụ:

```ts
{
  filePath: "src/auth/service.ts",
  symbol: "login",
  lines: [20, 68],
  reason: "definition match + called by route handler",
  score: 0.89,
  snippet: "..."
}
```

Nguyên tắc build context:

1. dedupe theo file hoặc symbol
2. ưu tiên definition trước
3. sau đó thêm caller hoặc callee liên quan
4. chỉ thêm config hoặc schema nếu thật sự liên quan
5. trim theo token budget

Mục tiêu là ít context hơn nhưng đúng hơn.

## Những thành phần thường bị thiếu nhưng rất quan trọng

1. `workspace detection`
2. `module resolution`
3. `incremental indexing`
4. `tool audit logs`
5. `evidence-driven answer`
6. `diagnostics for bad answers`

Thiếu các phần này thì demo có thể chạy, nhưng sản phẩm thật sẽ yếu và khó scale.

## Các rủi ro kiến trúc cần tránh

1. Trộn retrieval vào prompt engineering.
2. Trộn parsing hoặc graph logic vào CLI.
3. Chunk theo fixed tokens thay vì symbol boundary.
4. Dùng vector search như nguồn duy nhất.
5. Không lưu audit trail cho query.
6. Không tách definition, reference, dependency, call thành query primitives.
7. Không có incremental reindex.

## Đề xuất kiến trúc cho dh với forked OpenCode runtime

`dh` sở hữu toàn bộ runtime, tách rõ 3 khối lớn:

### Forked OpenCode runtime

- `packages/opencode-core` (Go, patched)
- `packages/opencode-sdk` (TypeScript, forked)

### dh application shell

- `apps/cli`
- `packages/opencode-app`
- `packages/runtime`
- `packages/providers`

### Code intelligence engine

- `packages/intelligence`
- `packages/retrieval`
- `packages/storage`

Tách như vậy giúp:

- CLI, API, editor integration có thể tái sử dụng cùng engine
- worker indexing có thể chạy độc lập
- dễ benchmark retrieval quality hơn
- dễ mở rộng sang multi-workspace trong tương lai
- forked runtime được isolate để dễ maintain hook patches

## Lộ trình triển khai khuyến nghị

### Phase 0: Fork và Hook Setup

Mục tiêu: `dh` sở hữu forked runtime và có thể build binary.

1. fork OpenCode Go core vào `packages/opencode-core/`
2. fork OpenCode TypeScript SDK vào `packages/opencode-sdk/`
3. implement 6 hook point stubs trong Go core
4. build pipeline: Go cross-compile -> single binary
5. verify binary boots và chạy cơ bản

### Phase 1: đọc hiểu thật

Mục tiêu: hệ thống có thể trả lời các câu hỏi kiểu `where defined` và `how flow works` với evidence cơ bản.

Nên làm theo thứ tự:

1. workspace enumerator
2. tree-sitter parser
3. symbol extractor
4. SQLite schema
5. symbol search
6. keyword search
7. basic orchestrator
8. CLI `ask` và `explain`

### Phase 2: hiểu luồng nhiều file

Mục tiêu: trace flow tốt hơn, phân tích dependencies chắc hơn.

Nên làm:

1. import graph
2. call graph
3. graph expansion
4. chunk-by-symbol
5. reranking
6. answer with evidence citations

### Phase 3: semantic intelligence

Mục tiêu: xử lý query mơ hồ và codebase lớn tốt hơn.

Nên làm:

1. embeddings
2. vector search
3. hybrid retrieval
4. query cache
5. incremental indexing
6. file watcher

### Phase 4: hardening và enforcement depth

Mục tiêu: hệ thống bền, enforce tool usage qua runtime hooks thật, đủ tin cậy để dùng hàng ngày.

Nên làm:

1. wire 6 hooks vào TypeScript enforcement logic thật
2. tool enforcement qua pre-tool-exec hook
3. answer gating qua pre-answer hook
4. model routing qua model override hook
5. telemetry và audit logging qua hook callbacks
6. benchmark retrieval quality
7. regression checks cho indexing và ranking

## Bộ tài liệu nền

Bộ tài liệu nền của kiến trúc hiện tại gồm:

1. `docs/project-architecture.md`
2. `docs/architecture/opencode-integration-decision.md`
3. `docs/architecture/system-overview.md`
4. `docs/architecture/indexing-model.md`
5. `docs/architecture/retrieval-strategy.md`
6. `docs/architecture/personal-cli-architecture.md`
7. `docs/architecture/workflow-orchestration.md`
8. `docs/architecture/skills-and-mcp-integration.md`
9. `docs/architecture/agent-contracts.md`
10. `docs/architecture/runtime-state-schema.md`
11. `docs/architecture/model-routing-and-agent-config.md`
12. `docs/architecture/source-tree-blueprint.md`
13. `docs/architecture/implementation-sequence.md`

Vai trò:

- `project-architecture.md`: tài liệu tổng hợp ý tưởng, phạm vi và roadmap kiến trúc
- `opencode-integration-decision.md`: ADR chốt quyết định fork OpenCode, 6 hook points, binary distribution, và divergence strategy
- `system-overview.md`: mô tả layer boundaries, package ownership và data flow tổng thể
- `indexing-model.md`: chốt schema file, symbol, chunk, edges và query logs
- `retrieval-strategy.md`: chốt intent, tool selection, merge, graph expansion và context building
- `personal-cli-architecture.md`: bản kiến trúc đã lọc cho app cá nhân, CLI-first, binary-distributed, sở hữu runtime
- `workflow-orchestration.md`: chốt lane model, lane lock, role topology, handoff rules và parallel execution contract
- `skills-and-mcp-integration.md`: chốt default skill registry, MCP registry, activation policy và routing policy — enforce qua runtime hooks
- `agent-contracts.md`: chốt input/output contract, status language, pass/fail rules và escalation rules cho từng role
- `runtime-state-schema.md`: chốt session state, lane lock state, work item state, execution envelope state, hook state và audit state
- `model-routing-and-agent-config.md`: chốt agent registry, provider/model/variant registry, flow interactive `/config --agent`, và model override hook integration
- `source-tree-blueprint.md`: chuyển toàn bộ kiến trúc thành cây thư mục/file cụ thể, bao gồm `opencode-core` và `opencode-sdk`
- `implementation-sequence.md`: chốt thứ tự triển khai thực tế, bắt đầu từ fork setup và binary build

## Kết luận

App kiểu Cursor không mạnh vì model lớn hơn, mà vì có kiến trúc tốt hơn ở 4 điểm:

1. Code intelligence engine mạnh
2. Retrieval đa nguồn
3. Context builder chất lượng cao
4. Runtime enforce tool usage

`dh` đi xa hơn bằng cách sở hữu toàn bộ runtime qua fork, cho phép enforce ở cấp code thay vì chỉ ở cấp prompt. Phần cần đầu tư nhất không phải UI hay prompt, mà là `intelligence + retrieval + enforcement + runtime hooks`.
