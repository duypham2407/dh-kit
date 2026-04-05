# DH Implementation Roadmap

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này là master execution plan để triển khai `dh` từ trạng thái scaffold hiện tại đến trạng thái hoàn chỉnh theo kiến trúc đã chốt trong `docs/architecture/`.

Roadmap này không thay thế các tài liệu kiến trúc khác. Nó tổng hợp chúng thành kế hoạch thực thi phase-to-phase với:

- mục tiêu của từng phase
- dependency đầu vào
- output bắt buộc
- acceptance criteria
- khu vực code chính sẽ bị tác động
- trạng thái hiện tại

## Tài liệu nguồn

Roadmap này bám trực tiếp vào các tài liệu sau:

- `docs/architecture/implementation-sequence.md`
- `docs/architecture/source-tree-blueprint.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/workflow-orchestration.md`
- `docs/architecture/runtime-state-schema.md`
- `docs/architecture/model-routing-and-agent-config.md`
- `docs/architecture/opencode-integration-decision.md`

## Trạng thái hiện tại

Hiện tại repository đã có scaffold mới từ đầu, gồm:

- root TypeScript workspace
- CLI shell tối thiểu
- shared contracts tối thiểu
- provider/model registry tối thiểu
- storage/runtime skeleton tối thiểu
- opencode-app workflow skeleton tối thiểu
- `packages/opencode-core/` placeholder với 6 hook stubs
- `packages/opencode-sdk/` placeholder

Những phần này vẫn là nền ban đầu, nhưng repository hiện đã vượt qua mức scaffold ở nhiều phase TypeScript.

Đã có thêm implementation thật cho:

- SQLite bootstrap và các repository thật cho session, workflow, audit, chunks, embeddings
- workflow runners cơ bản cho `quick`, `delivery`, `migration`
- role outputs, handoff payloads, review/verification gates cơ bản
- tree-sitter parser init, AST-first symbol extraction, import extraction, graph building cơ bản
- retrieval core và semantic retrieval pipeline end-to-end ở TS
- diagnostics/doctor có output hành động cụ thể
- TS-side hook enforcement bridge ghi quyết định xuống SQLite

Roadmap này vì vậy cần được đọc theo hai lớp trạng thái:

- implementation đã có trong TypeScript/runtime hiện tại
- phần còn thiếu để đạt acceptance criteria đầy đủ ở Go/runtime, binary packaging, orchestration depth và hardening

## Cách dùng roadmap này

Mỗi phase nên được coi là hoàn thành chỉ khi:

1. output bắt buộc của phase đã tồn tại
2. acceptance criteria của phase đã pass
3. không còn phần phụ thuộc blocker cho phase kế tiếp
4. docs liên quan đã được cập nhật nếu implementation khác giả định ban đầu

## Tổng quan phase map

```text
Phase -1  Fork Setup
Phase 0   Foundation Contracts
Phase 1   Runtime State And Persistence
Phase 2   CLI Shell And Binary Integration
Phase 3   Lane Core And Workflow Core
Phase 4   Agent Contracts And Dispatch
Phase 5   Provider, Model, Variant Registry
Phase 6   Interactive Agent Config Flow
Phase 6.5 Hook Wiring
Phase 7   Intelligence Engine Core
Phase 8   Retrieval Engine Core
Phase 9   Semantic Retrieval Integration
Phase 10  Skill Activation And MCP Routing
Phase 11  Very-Hard Tool Enforcement And Answer Gating
Phase 12  Delivery And Migration Orchestration Depth
Phase 13  Diagnostics And Doctor
Phase 14  Browser Verification Depth
Phase 15  Binary Packaging And Distribution
Phase 16  Hardening
```

## Phase Status Summary

| Phase | Name | Status |
|---|---|---|
| -1 | Fork Setup | Complete |
| 0 | Foundation Contracts | Complete |
| 1 | Runtime State And Persistence | Complete |
| 2 | CLI Shell And Binary Integration | Complete |
| 3 | Lane Core And Workflow Core | Complete |
| 4 | Agent Contracts And Dispatch | Complete |
| 5 | Provider, Model, Variant Registry | Complete |
| 6 | Interactive Agent Config Flow | Complete |
| 6.5 | Hook Wiring | Complete |
| 7 | Intelligence Engine Core | Complete |
| 8 | Retrieval Engine Core | Complete |
| 9 | Semantic Retrieval Integration | Complete |
| 10 | Skill Activation And MCP Routing | Complete |
| 11 | Very-Hard Tool Enforcement And Answer Gating | Complete |
| 12 | Delivery And Migration Orchestration Depth | Complete |
| 13 | Diagnostics And Doctor | Complete |
| 14 | Browser Verification Depth | Complete |
| 15 | Binary Packaging And Distribution | Complete |
| 16 | Hardening | Complete |

## Reality Check: TS Vs Go Runtime

Để tránh nhầm giữa "đã có implementation" và "đã hoàn tất phase theo acceptance criteria", dùng bảng này như snapshot ngắn của trạng thái hiện tại.

| Area | Đã có ở TypeScript / current runtime | Còn thiếu ở Go/runtime / production path |
|---|---|---|
| Persistence | SQLite bootstrap, repositories, workflow mirror, chunks/embeddings persistence | migration/versioning strategy sâu hơn, giảm duplication file-backed compatibility layers |
| CLI/config | `config --agent`, `--semantic`, `--embedding`, `--show`, `doctor`, `index`, lane/knowledge command presenters (`text/json`) | tiếp tục polish UX và output contracts khi command surface mở rộng |
| Workflow lanes | quick/delivery/migration runners, lane lock, dependency-aware planning, execution sequencing, lane-aware handoff artifacts | production-scale scheduling/perf tuning theo dữ liệu thực tế |
| Retrieval | keyword/symbol/definition/reference/graph retrieval, evidence packets, retrieval tests cho `ask/explain/trace` | quality calibration theo telemetry/task thực tế |
| Semantic retrieval | embedding pipeline, semantic mode wiring, re-embed flow, DB-backed cache, ANN cache path | large-scale indexing/search optimization theo khối lượng production |
| Enforcement | required-tools policy, answer gating, TS-side hook logging + SQLite bridge, Go DecisionReader + integration tests + run-entry smoke + deterministic and provider-backed staging smoke (`scripts/staging-e2e-smoke.sh`) | tiếp tục lặp lại smoke theo cadence vận hành staging/prod |
| Skills/MCP | registries, activation/routing policy, audit logging, browser verification routing baseline | mở rộng policy depth theo use-cases mới |
| Diagnostics | doctor report có action guidance, `--json` output, `--debug-dump`, provider/model coverage diagnostics | schema stabilization nếu downstream tooling phụ thuộc mạnh |
| Packaging | vendored upstream Go runtime, cross-compile + release packaging + checksum/manifest + installer checksum verify + release-dir install/upgrade helpers + artifact integrity verifier (`scripts/verify-release-artifacts.sh`) | channel hardening ngoài local/staging path theo rollout thực tế |

Quy ước đọc roadmap:

- Nếu checklist ghi `[x]` nhưng có hậu tố `TS-side` hoặc `workflow/TS-side`, nghĩa là implementation đã tồn tại nhưng chưa đạt runtime-level completion.
- Một phase chỉ nên được coi là hoàn tất khi acceptance criteria của chính phase đó đã pass, không chỉ vì checklist implementation ở TypeScript đã nhiều.

## Evidence Snapshot

Các phase dưới đây là những phase roadmap dễ bị hiểu nhầm nhất. Tham chiếu nhanh này giúp map trạng thái roadmap với code hiện tại.

### Phase 3 Evidence

- lane/session bootstrap: `packages/runtime/src/session/session-manager.ts`
- quick workflow runner: `packages/opencode-app/src/workflows/quick.ts`
- delivery workflow runner: `packages/opencode-app/src/workflows/delivery.ts`
- migration workflow runner: `packages/opencode-app/src/workflows/migration.ts`

Acceptance gap:

- lane workflow đã có orchestration depth theo work-item execution order + gate aggregation; phần còn lại chủ yếu là tuning hiệu năng và mở rộng cho production scale

### Phase 6 Evidence

- config command surface: `apps/cli/src/commands/config.ts`
- agent config interactive flow: `apps/cli/src/interactive/config-agent-flow.ts`
- embedding config flow + reembed: `apps/cli/src/interactive/config-embedding-flow.ts`
- config persistence/service: `packages/opencode-app/src/config/config-service.ts`

Acceptance gap:

- config flow, presenters (text/json) và runtime-client bridge đã usable; phần còn lại chủ yếu là polish UX khi CLI surface mở rộng thêm

### Phase 6.5 Evidence

- TS-side hook enforcement bridge: `packages/opencode-app/src/executor/hook-enforcer.ts`
- Go bridge contract + SQLite DecisionReader: `packages/opencode-core/internal/bridge/bridge.go`, `packages/opencode-core/internal/bridge/sqlite_reader.go`
- Go runtime hook registration and dispatch: `packages/opencode-core/internal/dhhooks/dhhooks.go`, `packages/opencode-core/cmd/dh/main.go`
- Go bridge integration tests (TS-write/Go-read): `packages/opencode-core/internal/bridge/integration_test.go`
- Hook-adapter DB-backed integration tests:
  - `packages/opencode-core/internal/llm/agent/pre_answer_bridge_integration_test.go`
  - `packages/opencode-core/internal/llm/agent/pre_tool_bridge_integration_test.go`
  - `packages/opencode-core/internal/hooks/skill_mcp_bridge_integration_test.go`
- workflow-level hook audit logging: `packages/runtime/src/workflow/workflow-audit-service.ts`

Acceptance gap:

- đã có TS-side enforcement, Go DecisionReader thật, runtime registration, DB-backed integration coverage cho các hook policy chính, smoke test cho `cmd/dh` hook wiring theo bridge decisions, run-entry smoke coverage cho `--run` path (lookup/dispatch đủ 6 hook), `--run-smoke` deterministic hook verification command, và staging E2E provider-backed evidence trên `dh --run`

### Phase 7 Evidence

- tree-sitter init: `packages/intelligence/src/parser/tree-sitter-init.ts`
- AST-first symbol extraction: `packages/intelligence/src/parser/ast-symbol-extractor.ts`
- symbol extraction pipeline: `packages/intelligence/src/symbols/extract-symbols.ts`
- index workflow runner: `packages/runtime/src/jobs/index-job-runner.ts`

Acceptance gap:

- parser/symbol/import/chunk/index flow đã có call-site extraction và incremental refresh diagnostics; phần còn lại là scale tuning

Update mới:

- call-site extraction đã được bổ sung qua `packages/intelligence/src/graph/extract-call-sites.ts`
- index workflow đã trả thêm diagnostics về refresh/unchanged file counts trong `packages/runtime/src/jobs/index-job-runner.ts`

### Phase 8-9 Evidence

- retrieval orchestration: `packages/retrieval/src/query/run-retrieval.ts`
- chunking: `packages/retrieval/src/semantic/chunker.ts`
- embedding pipeline: `packages/retrieval/src/semantic/embedding-pipeline.ts`
- semantic search: `packages/retrieval/src/semantic/semantic-search.ts`

Acceptance gap:

- retrieval và semantic pipeline đã có ANN cache path và skip re-chunk optimization; phần còn lại là quality tuning theo dữ liệu production thực tế

Update mới:

- ANN cache read/write path đã có trong `packages/retrieval/src/semantic/ann-index.ts`
- retrieval path được tune để tránh re-chunk khi đã có persisted chunk cache (`packages/retrieval/src/query/run-retrieval.ts`)

### Phase 10-11 Evidence

- tool enforcement policy: `packages/opencode-app/src/executor/enforce-tool-usage.ts`
- answer gating policy: `packages/opencode-app/src/executor/answer-gating.ts`
- delivery workflow skill/MCP audit usage: `packages/opencode-app/src/workflows/delivery.ts`
- workflow audit service: `packages/runtime/src/workflow/workflow-audit-service.ts`

Acceptance gap:

- policy và audit đã có ở TS/workflow path, đồng thời Go hook wiring đã vào runtime dispatch path; đã có thêm run-entry smoke coverage cho `--run` và deterministic `--run-smoke` để kiểm chứng hook dispatch đầy đủ

### Phase 13 Evidence

- doctor implementation: `packages/runtime/src/diagnostics/doctor.ts`
- doctor command surface: `apps/cli/src/commands/doctor.ts`

Acceptance gap:

- doctor đã có hook readiness, debug dump và machine-readable output; đồng thời bổ sung provider/model coverage diagnostics để giảm mù trạng thái registry

## Execution Checklist

Checklist này dùng để track implementation thực tế. Mỗi item chỉ nên được đánh dấu xong khi có code hoặc bằng chứng kiểm chứng tương ứng.

### Phase -1 Checklist

- [x] Tạo `packages/opencode-core/` placeholder structure
- [x] Tạo `packages/opencode-sdk/` placeholder structure
- [x] Tạo 6 hook stub files trong Go core
- [x] Tạo `FORK_ORIGIN.md` và `PATCHES.md` cho hai package fork
- [x] Ghi discovery candidate upstream commit hash vào `FORK_ORIGIN.md`
- [x] Hook invocation logging thật ở TS-side
- [x] Go build pass trên môi trường dev
- [x] Chốt fork provenance strategy (ADR `docs/adr/2026-04-05-fork-provenance-strategy.md`)
- [x] Xác định 6 hook injection sites cụ thể trong upstream source
- [x] Vendoring step 1: import upstream core packages (agent, provider, models, tools, session, message, db, config, pubsub)
- [x] Vendoring step 2: reconcile dependencies (SQLite driver, LLM SDK versions, module path rewrite)
- [x] Vendoring step 3: wire dh hooks into upstream agent loop (6 injection points)
- [x] Vendoring step 4: wire binary entrypoint via upstream cmd/app paths

### Phase 0 Checklist

- [x] Tạo lane types
- [x] Tạo stage types
- [x] Tạo agent/model/session/envelope/audit types
- [x] Tạo lane/stage/default-agent constants
- [x] Tạo utility functions cơ bản (`ids`, `time`, `path`)
- [x] Bổ sung role output contracts đầy đủ
- [x] Bổ sung retrieval and evidence contracts
- [x] Bổ sung indexing entities contracts
- [x] Chuẩn hóa export surface giữa các package

### Phase 1 Checklist

- [x] Tạo config store file-backed tạm thời
- [x] Tạo session store file-backed tạm thời
- [x] Tạo session manager cơ bản
- [x] Tạo sqlite path resolver placeholder
- [x] Tạo SQLite bootstrap thật
- [x] Tạo migrations/schema bootstrap
- [x] Implement `sessions` repository thật
- [x] Implement `workflow_state` repository thật
- [x] Implement `work_items` repository thật
- [x] Implement `execution_envelopes` repository thật
- [x] Implement `agent_model_assignments` repository thật bằng SQLite
- [x] Implement audit repositories (`tool_usage`, `skill_activation`, `mcp_route`, `hook_logs`)
- [x] Implement role outputs repository
- [x] Đồng bộ compatibility mirror vào `.dh/workflow-state.json`

### Phase 2 Checklist

- [x] Tạo CLI entrypoint `apps/cli/src/main.ts`
- [x] Tạo root command router
- [x] Tạo command skeleton cho `quick`, `delivery`, `migrate`
- [x] Tạo command skeleton cho `ask`, `explain`, `trace`, `index`, `doctor`, `config`
- [x] Tạo text/json/stream presenters đúng nghĩa
- [x] Tạo `runtime-client.ts` bridge
- [x] Nối CLI với Go runtime hoặc embedded execution path
- [x] Chuẩn hóa help, usage, exit codes, error rendering toàn diện

### Phase 3 Checklist

- [x] Tạo lane resolver tối thiểu
- [x] Tạo lane lock session bootstrap tối thiểu
- [x] Implement stage runner
- [x] Implement gate evaluator
- [x] Implement handoff manager
- [x] Implement workflow runners đầy đủ cho `quick`, `delivery`, `migration`
- [x] Persist stage transitions thật
- [x] Enforce lane lock khi resume session

### Phase 4 Checklist

- [x] Tạo execution envelope tối thiểu trong session bootstrap
- [x] Tạo role output contracts cho coordinator/analyst/architect/implementer/reviewer/tester
- [x] Tạo team role stubs đúng structure docs
- [x] Persist role outputs
- [x] Handoff payload chuẩn giữa các roles
- [x] Review/test gate surfaces cho downstream roles

### Phase 5 Checklist

- [x] Tạo provider registry hardcoded tối thiểu
- [x] Tạo model registry hardcoded tối thiểu
- [x] Tạo variant registry hardcoded tối thiểu
- [x] Tạo default model resolver cho agent
- [x] Xác định source of truth cho provider capabilities thật
- [x] Thêm fallback/error policy rõ khi thiếu config
- [x] Thêm capability sync path nếu cần

### Phase 6 Checklist

- [x] Tạo `config --agent` flow skeleton
- [x] Tạo selectors cơ bản
- [x] Persist assignment qua config-backed repo tạm thời
- [x] Làm flow interactive thật
- [x] Hiển thị current assignment
- [x] Validate unavailable selections
- [x] Đổi sang SQLite-backed assignment repo thật
- [x] Verify session mới dùng resolved model vừa được config
- [x] Thêm `config --semantic` cho semantic mode
- [x] Thêm `config --embedding` flow và re-embed trigger
- [x] Thêm `config --show` để inspect config hiện tại

### Phase 6.5 Checklist

- [x] Chốt hướng bridge DB-backed TS -> Go ở mức POC
- [x] Chốt Go <-> TS bridge strategy cho production build
- [x] Wire model override hook -> model resolver thật ở Go/runtime path
- [x] Wire pre-tool-exec hook -> tool enforcement thật ở TS-side
- [x] Wire pre-answer hook -> answer gating thật ở TS-side
- [x] Wire skill activation hook -> skill policy thật ở workflow/TS-side
- [x] Wire MCP routing hook -> MCP routing thật ở workflow/TS-side
- [x] Wire session state hook -> runtime session state thật ở Go/runtime path
- [x] Ghi hook invocation logs thật ở TS-side
- [x] Implement Go DecisionReader và runtime hook registration hoàn chỉnh
- [x] Thêm smoke coverage cho `cmd/dh` hook wiring với TS-bridge decisions

### Phase 7 Checklist

- [x] Tạo intelligence package placeholder
- [x] Workspace enumeration thật
- [x] Language detection thật
- [x] Parser integration thật cho tree-sitter path hiện có
- [x] Symbol extraction thật
- [x] Import extraction thật
- [x] Call-site extraction thật
- [x] Chunking theo symbol/block
- [x] Graph building cơ bản
- [x] Incremental indexing cơ bản

### Phase 8 Checklist

- [x] Tạo retrieval package placeholder
- [x] Keyword search
- [x] Symbol search
- [x] Definition search
- [x] Reference search
- [x] Graph expansion
- [x] Normalize/merge/rerank results
- [x] Build evidence packets

### Phase 9 Checklist

- [x] Embedding pipeline
- [x] Chunk embedding cache
- [x] Query embedding
- [x] Semantic search path
- [x] Semantic mode config (`always`, `auto`, `off`)
- [x] Default semantic mode wiring
- [x] ANN / approximate nearest-neighbor path cho scale lớn

### Phase 10 Checklist

- [x] Tạo skill selection placeholder
- [x] Tạo MCP selection placeholder
- [x] Tạo skill registry thật
- [x] Tạo MCP registry thật
- [x] Lane/role/intent activation policies đầy đủ
- [x] MCP priority/blocking policies đầy đủ
- [x] Audit skill activation và MCP routing

### Phase 11 Checklist

- [x] Tạo tool enforcement placeholder
- [x] Tạo answer gating placeholder
- [x] Required-tools-by-intent matrix
- [x] Evidence thresholding thật
- [x] Retry policy thật
- [x] Degrade response policy thật
- [x] Audit enforcement decisions

### Phase 12 Checklist

- [x] Delivery handoff chain cơ bản
- [x] Migration handoff chain cơ bản
- [x] Review gates cơ bản
- [x] Verification gates cơ bản
- [x] Preserve-behavior policy cho migration ở mức policy/messaging ban đầu
- [x] Work item planning thật
- [x] Dependency-aware execution sequencing
- [x] Parallel-safe execution planning
- [x] Delivery handoff chain thật theo topology sâu
- [x] Migration handoff chain thật theo topology sâu
- [x] Review gates thật với enforcement/runtime evidence đầy đủ
- [x] Verification gates thật với runtime/browser evidence khi cần

### Phase 13 Checklist

- [x] Tạo `doctor` command scaffold
- [x] Tạo doctor runtime skeleton
- [x] Report XDG paths
- [x] Report SQLite readiness
- [x] Report provider/model registry health
- [x] Report semantic config health
- [x] Report runtime state health
- [x] Report actionable next steps cho embedding/index/config gaps
- [x] Report hook readiness
- [x] Debug dump command
- [x] Machine-readable doctor output (`--json`)

### Phase 14 Checklist

- [x] Browser verification routing baseline từ tester path
- [x] Chrome DevTools verification flow
- [x] Playwright smoke verification flow
- [x] Browser evidence capture policy

### Phase 15 Checklist

- [x] Tạo Go `Makefile` tối thiểu
- [x] Chốt binary embedding strategy
- [x] Top-level build orchestration
- [x] Cross-compile macOS arm64
- [x] Cross-compile macOS amd64
- [x] Cross-compile Linux amd64
- [x] Cross-compile Linux arm64
- [x] Release artifact packaging
- [x] Install/upgrade/uninstall scripts

### Phase 16 Checklist

- [x] Resume reliability hardening
- [x] State corruption recovery paths
- [x] Retrieval quality tuning
- [x] Indexing performance tuning
- [x] Diagnostic depth improvements
- [x] Daily-use stability review

---

## Phase -1: Fork Setup

### Mục tiêu

Tạo fork runtime thực tế cho `dh`, có binary entrypoint và 6 hook points đúng contract.

### Dependency đầu vào

- ADR fork đã chốt tại `docs/architecture/opencode-integration-decision.md`
- blueprint source tree đã chốt

### Khu vực code chính

- `packages/opencode-core/`
- `packages/opencode-sdk/`

### Trạng thái hiện tại

Đã có placeholder structure, `go.mod`, `Makefile`, `cmd/dh/main.go`, 6 hook surfaces, `FORK_ORIGIN.md`, `PATCHES.md`, SQLite-backed Go `DecisionReader`, hook registry smoke test và buildable scaffold binary.

Fork provenance strategy đã được chốt ở `docs/adr/2026-04-05-fork-provenance-strategy.md`:

- `opencode-core` = fork adapted from `opencode-ai/opencode` (Go runtime)
- `opencode-sdk` = dh-owned internal SDK/bridge (NOT a fork)
- 6 hook injection sites đã xác định cụ thể trong upstream Go source

Chưa có:

- upstream Go source vendored vào `packages/opencode-core/`
- runtime execution path thật của upstream (agent loop, provider dispatch, tool execution)
- 6 hooks nằm đúng production path thay vì scaffold registry path

### Output bắt buộc

- `packages/opencode-core/` có fork runtime thật từ upstream Go source
- `packages/opencode-sdk/` có bridge contract types cho TS <-> Go communication
- `FORK_ORIGIN.md` ghi exact commit hash (done)
- `PATCHES.md` track patch surface (done)
- 6 hook points compile được và được gọi ở đúng upstream runtime path

### Acceptance criteria

- `make build` trong `packages/opencode-core/` tạo được binary từ vendored upstream source
- binary chạy được `--version` hoặc help
- có smoke test hoặc log chứng minh 6 hooks fire ở đúng upstream runtime path
- upstream agent loop (streaming + tool dispatch + multi-turn) compilable

### Vendoring plan

Vendoring sẽ thực hiện theo các bước nhỏ, mỗi bước phải build pass:

#### Step 1: Import upstream core packages (minimal compilable)

Copy từ upstream commit `73ee493` vào `packages/opencode-core/`:

- `internal/llm/agent/` - core agent loop (hook injection target)
- `internal/llm/provider/` - LLM provider abstraction (hook injection target)
- `internal/llm/models/` - model definitions
- `internal/llm/prompt/` - system prompts (hook injection target)
- `internal/llm/tools/` - built-in tool implementations
- `internal/session/` - session service (hook injection target)
- `internal/message/` - message model
- `internal/db/` - SQLite layer
- `internal/config/` - configuration
- `internal/pubsub/` - event broker

Rewrite module path from `github.com/opencode-ai/opencode` to `github.com/duypham93/dh/packages/opencode-core`.

Target: `go build` passes with upstream packages present.

#### Step 2: Reconcile dependencies

- Switch SQLite driver: current dh bridge uses `modernc.org/sqlite`, upstream uses `ncruces/go-sqlite3`. Decision: adopt `ncruces/go-sqlite3` for consistency with upstream.
- Add upstream Go dependencies to `go.mod`: anthropic-sdk-go, openai-go, genai, mcp-go, bubbletea, goose, cobra, viper, etc.
- Resolve any version conflicts.

Target: `go mod tidy && go build` passes.

#### Step 3: Wire dh hooks into upstream agent loop

Inject the 6 hooks at identified upstream sites:

1. `internal/llm/provider/provider.go` - model override hook in `NewProvider()`
2. `internal/llm/agent/agent.go` - pre-tool-exec hook before `tool.Run()`
3. `internal/llm/agent/agent.go` - pre-answer hook before final AgentEvent
4. `internal/session/session.go` - session state hook in `Create()`
5. `internal/llm/prompt/` - skill activation hook in prompt builder
6. `internal/llm/agent/mcp-tools.go` - MCP routing hook in `GetMcpTools()`

Keep existing dh bridge/hook infrastructure as the backend for hook decisions.

Target: `go build && go test ./...` passes, smoke test proves all 6 hooks fire.

#### Step 4: Wire binary entrypoint

Update `cmd/dh/main.go` to use the vendored upstream `cmd/` and `internal/app/` paths instead of the current scaffold registry demo.

Target: `make build` produces a binary that can start a session.

### Deferred items (not in Phase -1 scope)

- `internal/tui/` vendoring -- defer until TUI mode is prioritized
- `internal/lsp/` vendoring -- defer until LSP integration is needed
- `internal/history/` vendoring -- defer until undo/history support is needed
- cross-compile and release packaging -- Phase 15
- provider capability sync beyond hardcoded registry -- Phase 5 remainder

### Còn phải làm

1. Execute vendoring step 1: import upstream core packages
2. Execute vendoring step 2: reconcile dependencies
3. Execute vendoring step 3: wire dh hooks into upstream agent loop
4. Execute vendoring step 4: wire binary entrypoint
5. Keep `PATCHES.md` synchronized with each vendoring step

---

## Phase 0: Foundation Contracts

### Mục tiêu

Chốt toàn bộ type contracts nền để runtime, storage, CLI, orchestration và retrieval cùng dựa vào một schema thống nhất.

### Dependency đầu vào

- runtime-state schema
- workflow orchestration contract
- model routing contract

### Khu vực code chính

- `packages/shared/src/types/`
- `packages/shared/src/constants/`
- `packages/shared/src/utils/`

### Trạng thái hiện tại

Đã có skeleton cho:

- lane
- stage
- agent
- model
- session
- work item
- execution envelope
- audit

### Output bắt buộc

- shared type set đủ cho session, workflow, execution envelope, audit, config
- constants đủ cho lanes, stages, default agents
- utility functions tối thiểu cho id, time, path

### Acceptance criteria

- TypeScript check pass
- các package khác import được contracts mà không phải redefine shape riêng

### Còn phải làm

1. bổ sung contracts còn thiếu cho role outputs, retrieval results, evidence packets, indexing entities
2. chuẩn hóa enum/union names nếu có drift so với docs
3. thêm barrel exports nếu cần

---

## Phase 1: Runtime State And Persistence

### Mục tiêu

Làm cho session, workflow, config, envelope, audit và work items có persistence thật theo local-first/XDG contract.

### Dependency đầu vào

- Phase 0 contracts
- runtime-state schema

### Khu vực code chính

- `packages/storage/`
- `packages/runtime/`

### Trạng thái hiện tại

Đã có:

- file-backed config store và session store như compatibility/legacy layer
- SQLite bootstrap thật
- repositories thật cho sessions, workflow_state, work_items, execution_envelopes, audits, role outputs
- `.dh/workflow-state.json` mirror update logic
- session manager tạo session, workflow state và execution envelope

Chưa có hoàn chỉnh:

- tách hẳn file-backed session/config path khỏi runtime path chính nếu muốn giảm duplication
- migration/versioning strategy rõ ràng ngoài bootstrap hiện tại

### Output bắt buộc

- persistent runtime state theo XDG paths
- repositories rõ cho session/workflow/envelope/audit/config
- workflow-state mirror hoặc compatibility state được cập nhật

### Acceptance criteria

- tạo session xong có thể đọc lại được đầy đủ state
- assignment/config thay đổi được persist ổn định
- state schema không phụ thuộc vào in-memory flow

### Còn phải làm

1. thay file-backed temporary repos bằng SQLite-backed repos thật
2. thêm migrations hoặc schema bootstrap
3. thêm repositories cho workflow state, work items, role outputs, hook logs
4. mirror state ra `.dh/` nếu giữ compatibility surface

---

## Phase 2: CLI Shell And Binary Integration

### Mục tiêu

Xây CLI-first shell đúng surface của `dh`, sau đó nối dần vào runtime thật và binary distribution.

### Dependency đầu vào

- Phase 0 contracts
- Phase 1 runtime state cơ bản

### Khu vực code chính

- `apps/cli/`
- `packages/opencode-core/`
- `packages/opencode-sdk/`

### Trạng thái hiện tại

Đã có CLI command router, command skeletons và interactive config flows cơ bản.

Đã có thêm:

- `config --agent` interactive flow thật
- `config --semantic`, `config --embedding`, `config --show`
- doctor output có action guidance

Chưa có:

- presenter layer đúng nghĩa cho text/json/stream
- runtime bridge Go <-> TS hoàn chỉnh
- binary-integrated CLI runtime
- UX/help/error rendering được chuẩn hóa toàn diện

### Output bắt buộc

- `dh quick|delivery|migrate|ask|explain|trace|index|doctor|config`
- command parsing ổn định
- output format ổn định
- binary path rõ ràng

### Acceptance criteria

- CLI commands chạy được end-to-end ở mode scaffold
- command errors rõ ràng
- không cần đọc source mới biết command contract

### Còn phải làm

1. thêm presenter layer đầy đủ
2. thêm runtime-client bridge
3. nối CLI với binary runtime hoặc embedded execution path
4. làm UX interactive cho config và diagnostics

---

## Phase 3: Lane Core And Workflow Core

### Mục tiêu

Biến `quick`, `delivery`, `migration` thành runtime workflow thật có lane lock, stage chain và gate rules.

### Dependency đầu vào

- Phase 1 state persistence
- workflow orchestration docs

### Khu vực code chính

- `packages/opencode-app/src/lane/`
- `packages/opencode-app/src/workflows/`
- `packages/runtime/src/workflow/`
- `packages/runtime/src/session/`

### Trạng thái hiện tại

Đã có lane resolution, lane lock session bootstrap, stage runner, gate evaluator, handoff manager và workflow runners cơ bản cho cả ba lane.

Chưa có chiều sâu orchestration đầy đủ cho delivery/migration theo topology cuối cùng.

### Output bắt buộc

- lane lock thật
- stage transition logic
- gate evaluator cơ bản
- workflow runner cho từng lane

### Acceptance criteria

- `quick` tạo đúng stage chain
- `delivery` và `migration` không bỏ qua analysis/solution stages
- runtime không tự ý đổi lane

### Còn phải làm

1. implement stage runner
2. implement gate evaluator
3. implement handoff manager
4. thêm state transition persistence

---

## Phase 4: Agent Contracts And Dispatch

### Mục tiêu

Tạo dispatch model rõ ràng cho các role và execution envelope đầy đủ.

### Dependency đầu vào

- Phase 0 contracts
- Phase 3 workflow core

### Khu vực code chính

- `packages/opencode-app/src/team/`
- `packages/opencode-app/src/contracts/`
- `packages/opencode-app/src/planner/build-execution-envelope.ts`
- `packages/runtime/src/session/`

### Trạng thái hiện tại

Đã có execution envelope persisted, role output contracts, role stubs, role output persistence và handoff payload cơ bản.

Chưa có dispatch/runtime envelope path sâu hơn ở Go/runtime integration.

### Output bắt buộc

- role-specific dispatch contracts
- persisted execution envelopes
- persisted role outputs
- handoff-ready payloads

### Acceptance criteria

- mỗi role được dispatch với envelope đúng lane/stage/model
- role output có thể được resume hoặc audit lại

### Còn phải làm

1. thêm coordinator/analyst/architect/implementer/reviewer/tester contracts
2. thêm persistence cho role outputs
3. chuẩn hóa agent identity -> role contract mapping

---

## Phase 5: Provider, Model, Variant Registry

### Mục tiêu

Làm cho runtime biết provider/model/variant nào thực sự khả dụng và resolve model đúng agent.

### Dependency đầu vào

- model routing docs
- Phase 0 shared model contracts

### Khu vực code chính

- `packages/providers/`
- `packages/opencode-app/src/planner/choose-agent-model.ts`

### Trạng thái hiện tại

Đã có registry hardcoded tối thiểu và default mapping.

### Output bắt buộc

- provider registry
- model registry
- variant registry
- agent model resolver
- fallback policy rõ ràng

### Acceptance criteria

- config flow list được providers/models/variants hợp lệ
- session creation resolve được model cho agent

### Còn phải làm

1. xác định source of truth cho provider capabilities
2. thêm capability sync logic nếu cần
3. làm fallback/error behavior rõ hơn khi thiếu assignment

---

## Phase 6: Interactive Agent Config Flow

### Mục tiêu

Biến `dh config --agent` thành flow usable thật theo docs.

### Dependency đầu vào

- Phase 5 registry
- Phase 1 persistence

### Khu vực code chính

- `apps/cli/src/interactive/`
- `packages/opencode-app/src/config/`
- `packages/storage/src/sqlite/repositories/agent-model-assignments-repo.ts`

### Trạng thái hiện tại

Đã có flow interactive thật cho `config --agent` và đã mở rộng thêm config surfaces cho semantic mode, embedding model và config inspection.

### Output bắt buộc

- list agent
- list provider
- list model
- list variant
- persist assignment thật

### Acceptance criteria

- user đổi model cho một agent và session mới dùng đúng resolved model đó
- summary output rõ ràng

### Còn phải làm

1. thêm prompt/input flow thật
2. hiển thị current assignment
3. validate unavailable options
4. đổi persistence sang SQLite-backed repo thật

---

## Phase 6.5: Hook Wiring

### Mục tiêu

Nối 6 hook points trong Go core vào enforcement logic thật của `dh`.

### Dependency đầu vào

- Phase -1 fork thật
- Phase 1 persistence thật
- Phase 5 và 6 model/config flows

### Khu vực code chính

- `packages/opencode-core/internal/hooks/`
- `packages/opencode-app/src/executor/`
- `packages/opencode-app/src/planner/`
- `packages/runtime/src/session/`

### Trạng thái hiện tại

Đã có hook runtime wiring phía Go, bridge contract + SQLite DecisionReader thật, TS-side enforcement và hook logging vào SQLite, cùng workflow-level hook decision logging.

Đã build/verify được ở môi trường hiện tại. Session-state hook đã inject vào runtime in-memory state store cho tất cả session create paths (`Create`, `CreateTaskSession`, `CreateTitleSession`), bridge reader có envelope fallback (empty + missing envelope -> session scope), pre-answer có action handling runtime (`retry`, `degrade/insufficient`, hard block), các hook chính đã có DB-backed integration coverage ở Go side (pre-answer, pre-tool, skill, MCP), và `cmd/dh` đã có smoke test cho bridge-driven hook dispatch. Gap lớn còn lại là end-to-end evidence trực tiếp cho đường `dh --run` với bridge decisions trong non-interactive app path.

### Output bắt buộc

- model override hook -> model resolver
- pre-tool-exec hook -> tool policy
- pre-answer hook -> answer gating
- skill activation hook -> skill policy
- MCP routing hook -> MCP policy
- session state hook -> session state injection

### Acceptance criteria

- hook decisions phản ánh state thật của `dh`
- có audit logs chứng minh hook đã fire và đã quyết định gì

### Còn phải làm

1. thêm E2E evidence chạy đầy đủ agent loop trên đường `dh --run` với quyết định từ TS bridge (provider/runtime thật)
2. tiếp tục giảm fallback-based context propagation ở các call site chưa có context đầy đủ
3. cân nhắc persistence cho injected session-state nếu cần giữ qua process restart

Phase 6.5 validation snapshot mới nhất:

- `go test ./...` pass (đã xử lý panic upstream test `TestLsTool_Run` khi config chưa load)
- `make build` pass
- `make release-all` pass

---

## Phase 7: Intelligence Engine Core

### Mục tiêu

Xây lõi đọc hiểu codebase: parser, symbol extraction, graph building, chunking.

### Dependency đầu vào

- shared indexing contracts
- storage repositories cho files/symbols/chunks/edges

### Khu vực code chính

- `packages/intelligence/`
- `packages/storage/src/sqlite/repositories/`

### Trạng thái hiện tại

Đã có workspace scan, language detection, tree-sitter parser init, AST-first symbol extraction, import extraction, graph building cơ bản và chunking theo symbol/window.

Chưa có call-site extraction và incremental indexing đầy đủ.

### Output bắt buộc

- workspace scan
- language detect
- parse file
- symbol extraction
- import/call extraction
- graph build cơ bản

### Acceptance criteria

- index được repo mẫu nhỏ và sinh ra files/symbols/chunks/edges có nghĩa

### Còn phải làm

1. chọn parser strategy
2. implement index pipeline cho JS/TS trước
3. thêm storage schema cho indexing entities

---

## Phase 8: Retrieval Engine Core

### Mục tiêu

Xây hybrid retrieval dựa trên keyword, symbol, graph và semantic-ready abstraction.

### Dependency đầu vào

- Phase 7 intelligence data
- storage/index repos

### Khu vực code chính

- `packages/retrieval/`
- `packages/opencode-app/src/context/`

### Trạng thái hiện tại

Chưa bắt đầu thực chất.

### Output bắt buộc

- keyword search
- symbol/definition/reference search
- graph expansion
- result normalization và scoring

### Acceptance criteria

- `ask`, `explain`, `trace` có thể tạo evidence packets từ nhiều nguồn

### Còn phải làm

1. define retrieval result contracts đầy đủ
2. implement source-specific searchers
3. implement merge/rank pipeline

---

## Phase 9: Semantic Retrieval Integration

### Mục tiêu

Bật semantic retrieval mặc định bằng `text-embedding-3-small` với mode `always/auto/off`.

### Dependency đầu vào

- Phase 7 chunk/index pipeline
- Phase 8 retrieval core

### Khu vực code chính

- `packages/retrieval/src/semantic/`
- `packages/storage/`
- `packages/opencode-app/src/config/`

### Trạng thái hiện tại

Đã có embedding pipeline, persisted chunk/embedding cache, semantic query path, semantic mode config và default semantic wiring.

Chưa có ANN path cho scale lớn và vẫn còn cơ hội tối ưu để tránh index/retrieval work thừa ở các flow nặng.

### Output bắt buộc

- embedding pipeline
- embedding cache
- semantic query path
- mode config wiring

### Acceptance criteria

- semantic mode đổi được qua config
- query không re-embed toàn repo mỗi lần

---

## Phase 10: Skill Activation And MCP Routing

### Mục tiêu

Biến skill và MCP thành runtime policy thật, không chỉ tài liệu.

### Dependency đầu vào

- Phase 6.5 hook wiring
- workflow and intent model cơ bản

### Khu vực code chính

- `packages/opencode-app/src/registry/`
- `packages/opencode-app/src/planner/choose-skills.ts`
- `packages/opencode-app/src/planner/choose-mcps.ts`
- `packages/opencode-app/src/executor/enforce-skill-activation.ts`
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`

### Trạng thái hiện tại

Đã có skill/MCP registries, activation/routing policies và audit logging trong workflow path.

Phần còn thiếu chủ yếu nằm ở runtime hook integration đầy đủ thay vì chỉ workflow/TS-side orchestration.

### Output bắt buộc

- skill registry
- MCP registry
- activation/routing policy theo lane/role/intent

### Acceptance criteria

- envelope có active skills và active MCPs đúng policy
- hook audit log cho activation/routing có dữ liệu

---

## Phase 11: Very-Hard Tool Enforcement And Answer Gating

### Mục tiêu

Enforce required tool usage và evidence gating ở cấp runtime.

### Dependency đầu vào

- Phase 6.5 hook wiring
- Phase 8 retrieval core

### Khu vực code chính

- `packages/opencode-app/src/executor/enforce-tool-usage.ts`
- `packages/opencode-app/src/executor/answer-gating.ts`
- audit repositories

### Trạng thái hiện tại

Đã có required-tools-by-intent matrix, evidence thresholding, retry/degrade policy, audit logging và TS-side hook enforcement bridge.

Chưa đạt mức runtime enforcement hoàn chỉnh vì Go-side hook reader/registration vẫn còn pending.

### Output bắt buộc

- required tools by intent
- evidence thresholding
- retry/degrade policy
- audit logs

### Acceptance criteria

- answer thiếu required tool hoặc evidence thấp không được finalize như confident answer

---

## Phase 12: Delivery And Migration Orchestration Depth

### Mục tiêu

Làm cho `delivery` và `migration` chạy đúng topology và handoff rules.

### Dependency đầu vào

- Phase 3 workflow core
- Phase 4 agent contracts
- Phase 11 gating policy

### Khu vực code chính

- `packages/opencode-app/src/workflows/`
- `packages/runtime/src/workflow/`
- `packages/runtime/src/work-items/`

### Trạng thái hiện tại

Đã có delivery/migration workflow runners, handoff chain cơ bản, review gate và verification gate cơ bản.

Tuy vậy phase này chưa hoàn tất: `migration` vẫn chưa có topology sâu riêng, work-item planning và dependency-aware scheduling vẫn còn thiếu.

### Output bắt buộc

- work item planning
- dependency-aware sequencing
- parallel-safe execution planning
- review/test gates

### Acceptance criteria

- delivery và migration không còn là alias của quick flow
- migration enforce preserve-behavior orientation

---

## Phase 13: Diagnostics And Doctor

### Mục tiêu

Cho phép kiểm tra tình trạng runtime và config health của `dh`.

### Dependency đầu vào

- Phase 1 persistence
- Phase 5 registry
- các phase sau khi chúng xuất hiện

### Khu vực code chính

- `packages/runtime/src/diagnostics/`
- `apps/cli/src/commands/doctor.ts`

### Trạng thái hiện tại

Đã có doctor report có nghĩa hơn cho XDG paths, SQLite readiness, provider/model registry health, semantic config health, runtime state health, hook readiness, debug dump support và action guidance.

CLI hiện cũng đã hỗ trợ machine-readable diagnostics qua `dh doctor --json`.

### Output bắt buộc

- doctor report có meaning
- health checks cho config, DB, providers, semantic config, runtime state

### Acceptance criteria

- user chạy `dh doctor` và biết rõ hệ thống thiếu gì

### Còn phải làm

1. theo dõi schema machine-readable diagnostics khi external integrations tăng; hiện tại đã có baseline provider coverage + hook readiness
2. tiếp tục mở rộng debug dump theo nhu cầu sản phẩm mới; baseline đã bao gồm semantic mode, hook logs, chunk/embedding counts, và resolved paths

---

## Phase 14: Browser Verification Depth

### Mục tiêu

Cho frontend verification có đường chạy thật qua browser tooling.

### Dependency đầu vào

- delivery/tester contracts
- MCP routing

### Khu vực code chính

- browser verification routing trong `opencode-app`
- tester workflows

### Trạng thái hiện tại

Đã bắt đầu baseline browser-verification routing trong tester path:

- delivery/migration workflows chuyển objective + routed MCP context xuống tester
- tester fallback path nhận biết browser objective hoặc browser MCPs (`chrome-devtools`, `playwright`) để ghi browser verification evidence
- workflow summary phản ánh browser verification evidence khi có

Đã có deterministic browser verification flow ở tester fallback path:

- Playwright smoke routing được kiểm chứng theo MCP routing context
- Chrome DevTools diagnostics routing được kiểm chứng theo MCP routing context
- evidence/limitations được ghi rõ khi thiếu MCP browser cần thiết

### Output bắt buộc

- route browser tasks sang tooling phù hợp
- smoke verification flows

### Acceptance criteria

- tester flow có thể gọi browser verification path khi task cần

---

## Phase 15: Binary Packaging And Distribution

### Mục tiêu

Ship `dh` dưới dạng single binary cho macOS/Linux.

### Dependency đầu vào

- fork runtime thật
- bridge strategy rõ
- CLI và runtime ổn định

### Khu vực code chính

- `packages/opencode-core/`
- build pipeline scripts
- release pipeline docs/scripts

### Trạng thái hiện tại

Đã có packaging baseline chạy được ở cả root orchestration và Go core:

- root `Makefile` chạy `check`, `test`, `go-build`, `release-all`
- `packages/opencode-core/Makefile` build được các target cross-compile (`darwin/arm64`, `darwin/amd64`, `linux/amd64`, `linux/arm64`)
- scripts cài đặt cơ bản đã có: `scripts/install.sh`, `scripts/upgrade.sh`, `scripts/uninstall.sh`

Validation snapshot mới nhất:

- `make build` (root) pass
- `make release-all` (root) pass
- packaged artifacts generated at `dist/releases/` with:
  - `SHA256SUMS`
  - `manifest.json`
- release integrity verification pass: `scripts/verify-release-artifacts.sh dist/releases`

### Output bắt buộc

- cross-compile pipeline
- release artifacts
- install/upgrade/uninstall path

### Acceptance criteria

- user có thể tải một binary và chạy `dh`

### Còn phải làm

1. mở rộng distribution validation cho release channels thực tế ngoài local/staging path (artifact hosting, download path, bootstrap UX)

Binary embedding strategy đã chốt theo contract hiện tại:

- giữ binary Go độc lập cho runtime path
- dùng SQLite bridge (`.dh/sqlite/dh.db`) cho TS->Go hook decisions
- đóng gói release artifacts qua `dist/releases` với `SHA256SUMS` + `manifest.json`

ADR liên quan:

- `docs/adr/2026-04-05-phase15-release-packaging-contract.md`

---

## Phase 16: Hardening

### Mục tiêu

Làm cho `dh` đủ ổn định cho daily use.

### Dependency đầu vào

- tất cả phase trước ở mức usable

### Khu vực code chính

- toàn bộ packages theo bottleneck thực tế

### Output bắt buộc

- performance tuning
- recovery paths
- state corruption handling
- better diagnostics

### Acceptance criteria

- hệ thống resume ổn định
- failures có thể chẩn đoán được
- chất lượng retrieval/orchestration đủ ổn định cho dùng hàng ngày

---

## Recommended Immediate Next Slice

Roadmap phase checklist hiện đã đạt trạng thái complete theo phạm vi implementation hiện tại.

Post-roadmap hardening đã được triển khai (2026-04-05):

1. **Release CI workflow**: `.github/workflows/release-and-smoke.yml` — matrix build, artifact verification, upload, deterministic + provider-backed smoke on Linux and macOS
2. **Nightly staging smoke**: `.github/workflows/nightly-smoke.yml` — cron 03:00 UTC, doctor snapshot capture, auto-issue on failure
3. **Embedding quality CI**: `.github/workflows/embedding-quality.yml` — weekly provider-backed retrieval quality calibration with golden dataset
4. **Artifact signing**: `scripts/sign-release.sh` — GPG detached signatures; `scripts/verify-release-artifacts.sh` updated to verify signatures
5. **Installer hardening**: atomic swap, backup on upgrade, rollback on verification failure; `scripts/test-installers.sh` with 8 test scenarios
6. **DhSessionState DB persistence**: goose migration `20260405000000_add_dh_session_state.sql`, `DhStateStore` with write-through cache, cascade delete, full test coverage (7 Go tests)
7. **Retrieval quality calibration**: golden dataset with 6 code domains, structural + provider-backed semantic quality tests, batch sizing validation
8. **Doctor snapshots**: machine-readable `DoctorSnapshot` type, `scripts/check-doctor-snapshot.mjs` regression checker, CI artifact capture

Remaining operational work (deferred to real production usage):

- GPG key provisioning for release signing in CI
- HNSW/IVF index for production-scale embedding search (current: brute-force linear scan)
- Telemetry metrics pipeline (embedding tokens, query latency, indexing duration)
- DB corruption recovery tooling beyond doctor diagnostics

## Definition Of Done Ở cấp roadmap

Roadmap chỉ được coi là hoàn tất khi:

1. `dh` có thể chạy như một binary độc lập
2. lane model `quick/delivery/migration` được enforce thật
3. per-agent model routing được enforce thật qua runtime hooks
4. very-hard tool enforcement và pre-answer gating hoạt động thật
5. hybrid retrieval có evidence packets thật
6. skills và MCP routing được activate bằng runtime policy thật
7. state có thể resume và audit được

## Ghi chú vận hành

- Luôn cập nhật `FORK_ORIGIN.md` và `PATCHES.md` khi fork surface thay đổi.
- Khi implementation lệch giả định trong docs, cập nhật docs trước hoặc cùng lúc với code.
- Không coi scaffold là complete. Chỉ coi complete khi acceptance criteria của phase pass.
