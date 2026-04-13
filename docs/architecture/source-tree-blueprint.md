# DH Source Tree Blueprint

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chuyển toàn bộ kiến trúc của `dh` thành một blueprint source tree cụ thể để implementation có thể scaffold nhất quán với các tài liệu kiến trúc khác.

Current implementation note:

- Đây là blueprint/target layout, không phải ảnh chụp trạng thái hoàn chỉnh của working tree.
- Nhiều path trong blueprint đã tồn tại và đang được dùng, nhưng một số khu vực như presenters, runtime-client bridge, Go fork runtime thật và packaging path vẫn còn là blueprint target.

Blueprint này ưu tiên:

- bám sát lane model của `dh`
- bám sát OpenCode-based orchestration
- có đủ chỗ cho intelligence, retrieval, skills, MCP routing và runtime state
- không phình quá mức ở ngày đầu nhưng vẫn đúng kiến trúc hoàn chỉnh

## Nguyên tắc

1. Cấu trúc file phải phản ánh đúng package boundaries đã chốt.
2. Những phần là core contract phải có vị trí rõ ràng ngay từ đầu.
3. CLI là entrypoint chính.
4. OpenCode integration, model routing, lane orchestration và runtime state đều phải có nhà riêng.
5. Tên gọi trong source tree phải ưu tiên rõ nghĩa hơn là generic.

## Top-Level Layout

```text
dh/
  apps/
  packages/
  docs/
  ref/
  scripts/
  data/
```

## Top-Level Responsibilities

### `apps/`

Chứa entrypoint runnable của sản phẩm.

### `packages/`

Chứa toàn bộ logic cốt lõi theo module boundaries.

### `docs/`

Chứa kiến trúc, ADR, runbook và các artifact định hướng.

### `ref/`

Chứa skills tham chiếu và các reference assets đi kèm.

### `scripts/`

Chứa script hỗ trợ development, indexing, diagnostics và bootstrap.

### `data/`

Chứa local runtime data như SQLite DB, caches, embedding artifacts và session state.

## App Layer

`dh` hiện là CLI-first, và app layer target/current layout nên đọc như sau:

```text
apps/
  cli/
    src/
      main.ts
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
          agent-selector.ts
          provider-selector.ts
          model-selector.ts
          variant-selector.ts
      adapters/
        runtime-client.ts
```

## CLI Command Responsibilities

### Lane commands

- `quick.ts`
- `delivery.ts`
- `migrate.ts`

Các command này:

- set lane
- enforce lane lock
- tạo workflow session
- dispatch role chain tương ứng

### Knowledge commands

- `ask.ts`
- `explain.ts`
- `trace.ts`

Các command này:

- tạo query request
- route vào orchestrator theo lane hiện tại
- trả answer ngắn gọn có citations

### Infra commands

- `index.ts`
- `doctor.ts`
- `config.ts`

Các command này:

- index repo
- kiểm tra môi trường/runtime
- cấu hình agent models, semantic mode và runtime options

## Package Layout

Blueprint chính cho `packages/`:

```text
packages/
  opencode-core/     <- Forked Go runtime with dh hooks
  opencode-sdk/      <- dh-owned internal bridge SDK
  shared/
  opencode-app/
  intelligence/
  retrieval/
  storage/
  runtime/
  providers/
```

## `packages/opencode-core/`

Đây là forked Go runtime, sở hữu hoàn toàn bởi dh.

```text
packages/opencode-core/
  cmd/
    dh/
      main.go
  internal/
    hooks/
      model_override.go
      pre_tool_exec.go
      pre_answer.go
      skill_activation.go
      mcp_routing.go
      session_state.go
      hooks_registry.go
    dispatch/
    executor/
    answer/
    session/
    mcp/
  pkg/
    types/
    protocol/
  go.mod
  go.sum
  Makefile
  FORK_ORIGIN.md
  PATCHES.md
  README.md
```

## `packages/opencode-sdk/`

Đây là dh-owned internal bridge SDK, cung cấp type definitions và protocol contracts.

```text
packages/opencode-sdk/
  src/
    types/
    protocol/
    client/
  package.json
  tsconfig.json
  FORK_ORIGIN.md
  PATCHES.md
  README.md
```

## `packages/shared/`

Chứa types, constants và utils dùng chung.

```text
packages/shared/
  src/
    types/
      session.ts
      lane.ts
      stage.ts
      work-item.ts
      execution-envelope.ts
      agent.ts
      model.ts
      file.ts
      symbol.ts
      chunk.ts
      graph.ts
      retrieval.ts
      answer.ts
    constants/
      lanes.ts
      roles.ts
      stages.ts
      tool-names.ts
      skill-names.ts
      mcp-names.ts
    utils/
      hash.ts
      path.ts
      text.ts
      async.ts
      score.ts
      ids.ts
```

## `packages/opencode-app/`

Đây là application layer gần nhất với OpenCode runtime.

```text
packages/opencode-app/
  src/
    lane/
      resolve-lane.ts
      enforce-lane-lock.ts
      lane-policy.ts
    intents/
      classify-intent.ts
      intent-taxonomy.ts
    planner/
      plan-query.ts
      choose-tools.ts
      choose-skills.ts
      choose-mcps.ts
      choose-agent-model.ts
      define-expansion-strategy.ts
      build-execution-envelope.ts
    executor/
      run-plan.ts
      run-tool-batch.ts
      enforce-tool-usage.ts
      enforce-skill-activation.ts
      enforce-mcp-routing.ts
      retry-policy.ts
      answer-gating.ts
    context/
      collect-context.ts
      dedupe-context.ts
      rank-context.ts
      trim-context.ts
      build-evidence-packets.ts
      build-final-answer.ts
    workflows/
      quick.ts
      delivery.ts
      migration.ts
    team/
      coordinator.ts
      analyst.ts
      architect.ts
      implementer.ts
      reviewer.ts
      tester.ts
    config/
      config-service.ts
      semantic-mode.ts
      workflow-options.ts
    registry/
      agent-registry.ts
      skill-registry.ts
      mcp-registry.ts
    contracts/
      coordinator-output.ts
      analyst-output.ts
      architect-output.ts
      implementer-output.ts
      reviewer-output.ts
      tester-output.ts
```

## `packages/intelligence/`

Đây là lõi code understanding.

```text
packages/intelligence/
  src/
    workspace/
      detect-projects.ts
      detect-languages.ts
      detect-config-files.ts
      enumerate-files.ts
    parser/
      language-registry.ts
      parse-file.ts
      tree-sitter-adapter.ts
    symbols/
      extract-symbols.ts
      symbol-kinds.ts
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
      chunk-features.ts
    graph/
      build-import-graph.ts
      build-call-graph.ts
      build-reference-graph.ts
      graph-traversal.ts
      graph-distance.ts
    indexer/
      full-index.ts
      incremental-index.ts
      file-change-processor.ts
      delete-file.ts
```

## `packages/retrieval/`

Đây là hybrid retrieval layer.

```text
packages/retrieval/
  src/
    keyword/
      keyword-search.ts
      regex-search.ts
    symbol/
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
    semantic/
      embed-query.ts
      semantic-search.ts
      semantic-ranker.ts
    merge/
      normalize-result.ts
      merge-results.ts
      score-results.ts
      rerank-results.ts
    query/
      retrieval-request.ts
      retrieval-result.ts
```

## `packages/storage/`

Chứa state, index metadata, audit data và caches.

```text
packages/storage/
  src/
    sqlite/
      db.ts
      migrations/
      repositories/
        sessions-repo.ts
        workflow-state-repo.ts
        work-items-repo.ts
        execution-envelopes-repo.ts
        agent-model-assignments-repo.ts
        files-repo.ts
        symbols-repo.ts
        chunks-repo.ts
        edges-repo.ts
        embeddings-repo.ts
        query-logs-repo.ts
        tool-usage-audit-repo.ts
        skill-activation-audit-repo.ts
        mcp-route-audit-repo.ts
        role-outputs-repo.ts
    cache/
      file-cache.ts
      ast-cache.ts
      embedding-cache.ts
      retrieval-cache.ts
    fs/
      session-store.ts
      snapshot-store.ts
      config-store.ts
```

## `packages/runtime/`

Chứa session management, workflow state, index jobs và diagnostics.

```text
packages/runtime/
  src/
    session/
      session-manager.ts
      session-bootstrap.ts
      lane-lock-manager.ts
    workflow/
      workflow-state-manager.ts
      gate-evaluator.ts
      stage-runner.ts
      handoff-manager.ts
    work-items/
      work-item-manager.ts
      dependency-resolver.ts
      parallel-execution-planner.ts
    config/
      runtime-config.ts
      semantic-config.ts
      agent-model-config.ts
    jobs/
      index-job-runner.ts
      reindex-job-runner.ts
    watch/
      file-watcher.ts
      debounce.ts
    diagnostics/
      doctor.ts
      health-check.ts
      debug-dump.ts
    telemetry/
      logger.ts
      metrics.ts
      tracing.ts
```

## `packages/providers/`

Chứa lớp tích hợp provider/model/variant registry lấy từ OpenCode environment.

```text
packages/providers/
  src/
    registry/
      provider-registry.ts
      model-registry.ts
      variant-registry.ts
      sync-provider-capabilities.ts
    resolution/
      resolve-agent-model.ts
      resolve-fallback-model.ts
    contracts/
      provider-entry.ts
      model-entry.ts
      variant-entry.ts
```

## Data Layout

Vì `dh` là local-first, nên nên có data layout rõ ràng:

```text
data/
  sqlite/
    dh.db
  cache/
    embeddings/
    ast/
    retrieval/
  sessions/
  logs/
```

## Scripts Layout

```text
scripts/
  bootstrap/
    init-dev-env.sh
  index/
    rebuild-index.sh
  diagnostics/
    dump-runtime-state.sh
```

Các script này là phụ trợ. Runtime chính vẫn nằm trong `packages/`.

## Build Pipeline

```text
build/
  Makefile              <- Top-level build orchestrator
  scripts/
    build-go.sh         <- Compile opencode-core with hooks
    build-ts.sh         <- Bundle TypeScript packages
    cross-compile.sh    <- Cross-compile for macOS/Linux targets
    embed-ts.sh         <- Embed TS bundles into Go binary (or link)
```

### Build Flow

```text
1. Compile packages/opencode-core (Go) with dh hooks linked in
2. Compile packages/opencode-sdk (TypeScript) -> bundled JS
3. Compile packages/* (dh TypeScript logic) -> bundled JS
4. Embed or link TS bundles into Go binary
5. Cross-compile for:
   - macOS arm64 (Apple Silicon)
   - macOS amd64 (Intel)
   - Linux amd64
   - Linux arm64
6. Output: single binary per platform in dist/
```

## Runtime Config Files

`dh` sẽ cần một vài config/state surface rõ ràng.

### Gợi ý

```text
.dh/
  config.json
  workflow-state.json
  sessions/
  work-items/
```

### Ý nghĩa

- `config.json`: semantic mode, agent model assignments, runtime toggles
- `workflow-state.json`: mirror trạng thái workflow hiện tại
- `sessions/`: session state theo phiên
- `work-items/`: work item state hoặc snapshots nếu cần

## Mapping Từ Docs Sang Source Tree

### `opencode-integration-decision.md`

Đổ vào:

- `packages/opencode-core/` structure và hook implementation
- `packages/opencode-sdk/` structure
- build pipeline configuration

### `workflow-orchestration.md`

Đổ vào:

- `packages/opencode-app/src/workflows/`
- `packages/runtime/src/workflow/`
- `packages/runtime/src/session/`

### `agent-contracts.md`

Đổ vào:

- `packages/opencode-app/src/team/`
- `packages/opencode-app/src/contracts/`
- `packages/shared/src/types/agent.ts`

### `skills-and-mcp-integration.md`

Đổ vào:

- `packages/opencode-app/src/planner/choose-skills.ts`
- `packages/opencode-app/src/planner/choose-mcps.ts`
- `packages/opencode-app/src/registry/skill-registry.ts`
- `packages/opencode-app/src/registry/mcp-registry.ts`

### `model-routing-and-agent-config.md`

Đổ vào:

- `apps/cli/src/interactive/config-agent-flow.ts`
- `packages/providers/src/registry/`
- `packages/runtime/src/config/agent-model-config.ts`
- `packages/storage/src/sqlite/repositories/agent-model-assignments-repo.ts`

### `runtime-state-schema.md`

Đổ vào:

- `packages/shared/src/types/`
- `packages/storage/src/sqlite/repositories/`
- `packages/runtime/src/session/`
- `packages/runtime/src/workflow/`

### `retrieval-strategy.md`

Đổ vào:

- `packages/retrieval/src/`
- `packages/opencode-app/src/planner/`
- `packages/opencode-app/src/executor/`
- `packages/opencode-app/src/context/`

### `indexing-model.md`

Đổ vào:

- `packages/intelligence/src/`
- `packages/storage/src/sqlite/repositories/`
- `packages/retrieval/src/semantic/`

## First Scaffold Priority

Nếu bắt đầu scaffold thật, nên tạo theo thứ tự:

1. `packages/opencode-core/` (fork Go source, add hook stubs)
2. `packages/opencode-sdk/` (dh-owned bridge SDK baseline)
3. `apps/cli/`
4. `packages/shared/`
5. `packages/opencode-app/`
6. `packages/runtime/`
7. `packages/storage/`
8. `packages/providers/`
9. `packages/intelligence/`
10. `packages/retrieval/`
11. `data/`
12. `.dh/`
13. `build/` pipeline

Lý do:

- forked runtime phải có trước để binary boots được
- CLI và contracts phải có trước để app command pipeline work
- runtime và storage phải có trước để lane lock, config, session state có chỗ bám
- intelligence và retrieval theo sau vì đó là phần sâu hơn nhưng cần contracts có sẵn

## Những File Không Nên Tạo Quá Sớm

Để tránh phình sớm, chưa cần tạo đầy đủ implementation cho mọi file ngay ngày đầu.

Có thể scaffold stub trước cho:

- `chrome-devtools` specific runtime helpers
- `playwright` advanced scripted flows
- complex fallback model resolution
- deep telemetry metrics

Nhưng vị trí của chúng nên được reserve đúng chỗ trong source tree.

## Kết luận

Blueprint này là cầu nối giữa docs kiến trúc và source code thật của `dh`. Nếu scaffold theo blueprint này, codebase sẽ phản ánh đúng các quyết định đã chốt về forked OpenCode runtime, 6 hook points, binary distribution, lane orchestration, agent contracts, skill/MCP routing, model config, intelligence engine và runtime state.
