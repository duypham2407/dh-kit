# DH Implementation Sequence

Last reviewed against code: 2026-04-05

## Mục tiêu

Tài liệu này chốt thứ tự triển khai thực tế cho `dh` dựa trên toàn bộ bộ docs kiến trúc đã có, bao gồm quyết định fork OpenCode và binary distribution.

Mục tiêu là:

- fork OpenCode runtime trước, build binary trước
- build đúng thứ tự phụ thuộc
- tránh dựng UI hoặc orchestration rỗng trước khi có runtime contract
- tránh làm intelligence engine rời rạc không gắn với workflow
- giữ implementation bám sát source-tree blueprint

Đây không phải V1/V2 theo nghĩa cắt bớt kiến trúc. Đây là trình tự xây dựng của cùng một kiến trúc hoàn chỉnh.

Current implementation note:

- Tài liệu này mô tả thứ tự build lý tưởng theo target architecture.
- Thực tế codebase hiện tại đã đi xa hơn ở TypeScript so với trình tự ban đầu: persistence, workflow runners, retrieval, semantic retrieval, config flows và diagnostics đã có implementation usable.
- Điểm nghẽn lớn nhất hiện tại không còn là config/persistence scaffold, mà là Go/runtime hook wiring hoàn chỉnh, orchestration depth và binary packaging.

## Nguyên tắc triển khai

1. Fork OpenCode runtime và build binary là target path cuối, nhưng khi môi trường Go chưa sẵn sàng thì có thể tiếp tục harden TypeScript/runtime path trước.
2. Implement 6 hook point stubs trong Go core trước khi wire logic.
3. Dựng contracts và state trước logic phức tạp.
4. Dựng runtime lane lock trước multi-agent orchestration.
5. Dựng indexing đúng trước khi tối ưu retrieval.
6. Dựng hybrid retrieval trước khi tune ranking sâu.
7. Dựng config và registry trước khi phụ thuộc vào chúng ở dispatch path.
8. Dựng CLI interactive flow sau khi runtime config contracts đã rõ.

## Dependency Spine

Chuỗi phụ thuộc chính:

```text
opencode-core fork + hook stubs
-> opencode-sdk fork
-> shared contracts
-> runtime state + storage
-> opencode-app enforcement logic
-> CLI shell
-> provider and model registry
-> hook wiring (connect Go hooks to TS logic)
-> intelligence engine
-> retrieval engine
-> workflow orchestration depth
-> skills and MCP routing
-> interactive config and diagnostics
-> binary packaging and distribution
```

## Phase -1: OpenCode Fork Setup

### Mục tiêu

Fork OpenCode runtime, add hook stubs, build first binary.

### Cần làm

1. Fork OpenCode Go core vào `packages/opencode-core/`
2. Record fork origin (commit hash, version) in `FORK_ORIGIN.md`
3. Fork OpenCode TypeScript SDK vào `packages/opencode-sdk/`
4. Add 6 hook point stubs in Go core:
   - `internal/hooks/model_override.go`
   - `internal/hooks/pre_tool_exec.go`
   - `internal/hooks/pre_answer.go`
   - `internal/hooks/skill_activation.go`
   - `internal/hooks/mcp_routing.go`
   - `internal/hooks/session_state.go`
   - `internal/hooks/hooks_registry.go`
5. Add `Makefile` for Go cross-compilation
6. Verify: `make build` produces a working binary
7. Binary boots and runs basic OpenCode functionality
8. Create `PATCHES.md` to track all dh-specific changes

### Output kỳ vọng

- `dh` binary builds and boots on macOS and Linux
- 6 hook stubs are called at the correct points in Go runtime (no-op initially)
- FORK_ORIGIN.md records exact upstream commit

## Phase 0: Foundation Contracts

### Mục tiêu

Tạo bộ type, constants và config contracts để các package sau bám vào.

### Cần làm

1. `packages/shared/src/types/`
2. `packages/shared/src/constants/`
3. `packages/shared/src/utils/`
4. lane enums
5. role enums
6. stage enums
7. execution envelope types
8. agent model assignment types
9. session/work item types

### Output kỳ vọng

- toàn bộ contracts nền đã có type rõ ràng
- các package khác có thể import thống nhất

## Phase 1: Runtime State And Persistence

### Mục tiêu

Làm cho `dh` có state thật để giữ lane lock, workflow stage, work items và audits.

### Cần làm

1. SQLite bootstrap
2. repositories cho:
   - `sessions`
   - `workflow_state`
   - `work_items`
   - `execution_envelopes`
   - `agent_model_assignments`
   - `tool_usage_audit`
   - `skill_activation_audit`
   - `mcp_route_audit`
   - `role_outputs`
3. `session-manager.ts`
4. `lane-lock-manager.ts`
5. `workflow-state-manager.ts`
6. `config-store.ts`

### Output kỳ vọng

- session có thể tạo
- lane lock có thể lưu
- workflow stage có thể chuyển state
- role dispatch có chỗ lưu envelope và output

## Phase 2: CLI Shell And Binary Integration

### Mục tiêu

Tạo CLI shell chạy trên forked binary, nối vào runtime state.

### Cần làm

1. `apps/cli/src/main.ts`
2. command skeletons: `quick.ts`, `delivery.ts`, `migrate.ts`, `ask.ts`, `explain.ts`, `trace.ts`, `index.ts`, `doctor.ts`, `config.ts`
3. presenters: `text-presenter.ts`, `json-presenter.ts`
4. `runtime-client.ts` — bridge giữa CLI TypeScript và Go binary
5. Wire CLI into Go binary build (embed or sidecar)

### Output kỳ vọng

- `dh` binary accepts commands
- command parse và route works
- command có thể tạo session và ghi state cơ bản
- single binary chứa cả Go runtime và CLI logic

## Phase 3: Lane Core And Workflow Core

### Mục tiêu

Làm cho 3 lane của `dh` vận hành được ở mức runtime contract.

### Cần làm

1. `resolve-lane.ts`
2. `enforce-lane-lock.ts`
3. `lane-policy.ts`
4. workflow runners:
   - `quick.ts`
   - `delivery.ts`
   - `migration.ts`
5. `gate-evaluator.ts`
6. `handoff-manager.ts`
7. `stage-runner.ts`

### Output kỳ vọng

- lane vào đúng command sẽ được khóa
- stage chain của từng lane chạy được
- handoff giữa stages có guard cơ bản

## Phase 4: Agent Contracts And Dispatch

### Mục tiêu

Làm cho `Coordinator`, `Analyst`, `Architect`, `Implementer`, `Reviewer`, `Tester` có execution envelope thật và output contract thật.

### Cần làm

1. `team/` role stubs
2. `contracts/` output contracts
3. `build-execution-envelope.ts`
4. envelope persistence
5. role output persistence
6. dispatch precedence cho agent model resolution

### Output kỳ vọng

- mỗi role có thể được dispatch với envelope đúng
- runtime biết role nào đang chạy bằng model nào

## Phase 5: Provider, Model, Variant Registry

### Mục tiêu

Cho phép `dh` biết runtime hiện có những agent-config options nào.

### Cần làm

1. `provider-registry.ts`
2. `model-registry.ts`
3. `variant-registry.ts`
4. `sync-provider-capabilities.ts`
5. `resolve-agent-model.ts`
6. `resolve-fallback-model.ts`

### Output kỳ vọng

- runtime list được providers
- provider list được models
- model list được variants
- dispatch resolve được provider/model/variant cho agent

## Phase 6: Interactive Agent Config Flow

### Mục tiêu

Triển khai command `/config --agent` đúng UX đã chốt.

### Cần làm

1. `config-agent-flow.ts`
2. `agent-selector.ts`
3. `provider-selector.ts`
4. `model-selector.ts`
5. `variant-selector.ts`
6. persist vào `agent_model_assignments`

### Output kỳ vọng

- user có thể chọn `agent -> provider -> model -> variant`
- assignment được lưu thành state thật

Current implementation note:

- `dh config --agent` đã interactive và persist vào SQLite-backed assignment repo.
- Ngoài ra CLI hiện đã có thêm `dh config --semantic`, `dh config --embedding`, `dh config --show`.

## Phase 6.5: Hook Wiring

### Mục tiêu

Wire 6 Go hook stubs vào dh TypeScript enforcement logic thật.

### Cần làm

1. Wire model override hook -> `packages/opencode-app/src/planner/choose-agent-model.ts`
2. Wire pre-tool-exec hook -> `packages/opencode-app/src/executor/enforce-tool-usage.ts`
3. Wire pre-answer hook -> `packages/opencode-app/src/executor/answer-gating.ts`
4. Wire skill activation hook -> `packages/opencode-app/src/executor/enforce-skill-activation.ts`
5. Wire MCP routing hook -> `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
6. Wire session state hook -> `packages/runtime/src/session/session-manager.ts`
7. Implement Go->TypeScript bridge hoặc SQLite-backed decision bridge production-ready

### Output kỳ vọng

- model selection override works end-to-end: config assigns model to agent, hook resolves it at dispatch
- pre-tool-exec hook blocks unauthorized tools and logs audit
- pre-answer hook validates evidence threshold
- hooks are testable independently

Current implementation note:

- TS-side hook enforcement, hook logging và Go bridge scaffolding đã tồn tại.
- Còn thiếu Go DecisionReader thật, runtime hook registration hoàn chỉnh và build verification ở môi trường có Go.

## Phase 7: Intelligence Engine Core

### Mục tiêu

Tạo lõi structural understanding cho codebase.

### Cần làm

1. workspace scanner
2. language registry
3. parser adapter
4. symbol extraction
5. import extraction
6. call-site extraction
7. chunking theo symbol/block
8. graph building cơ bản
9. indexing pipeline

### Ngôn ngữ ưu tiên

1. TypeScript/JavaScript
2. Python
3. Go

### Output kỳ vọng

- file, symbol, chunk, edge được index đúng
- repo nhỏ/vừa có thể parse và build graph cơ bản

Current implementation note:

- workspace scan, tree-sitter init, AST-first symbol extraction, import extraction, chunking và index workflow runner đã có.
- call-site extraction và incremental indexing vẫn là phần còn thiếu.

## Phase 8: Retrieval Engine Core

### Mục tiêu

Build hybrid retrieval thật cho `dh`.

### Cần làm

1. keyword search
2. symbol search
3. definition search
4. reference search
5. graph expansion
6. result normalization
7. reranking base
8. evidence packet building

### Output kỳ vọng

- `ask`, `explain`, `trace` không còn là text search đơn giản
- retrieval trả normalized results và evidence packets

Current implementation note:

- retrieval core hiện đã chạy được ở TS path với definition/reference/graph expansion/normalized results/evidence packets.

## Phase 9: Semantic Retrieval Integration

### Mục tiêu

Kích hoạt semantic retrieval mặc định bằng OpenAI `text-embedding-3-small` theo đúng cost policy đã chốt.

### Cần làm

1. embedding pipeline
2. query embedding
3. chunk embedding cache
4. semantic search integration
5. semantic mode policy:
   - `always`
   - `auto`
   - `off`
6. config wiring vào runtime

### Output kỳ vọng

- semantic retrieval mặc định luôn bật
- user đổi semantic mode được qua config
- không re-embed toàn repo ở query time

Current implementation note:

- embedding pipeline, persisted chunk/embedding cache, semantic search path, semantic mode wiring và re-embed flow đã có.
- Chưa có ANN path cho scale lớn.

## Phase 10: Skill Activation And MCP Routing

### Mục tiêu

Biến skills và MCP thành phần sống của orchestration.

### Cần làm

1. `skill-registry.ts`
2. `mcp-registry.ts`
3. `choose-skills.ts`
4. `choose-mcps.ts`
5. `enforce-skill-activation.ts`
6. `enforce-mcp-routing.ts`
7. bootstrap `using-skills`
8. route `augment_context_engine`, `context7`, `grep_app`, `websearch`, `chrome-devtools`, `playwright`

### Output kỳ vọng

- đúng lane/role/intent sẽ tự attach skill tương ứng
- đúng task sẽ tự route qua MCP đúng loại

Current implementation note:

- skill/MCP registries, policy selection và audit logging đã có ở workflow/TS-side path.
- Runtime hook integration đầy đủ vẫn phụ thuộc Phase 6.5 completion.

## Phase 11: Very-Hard Tool Enforcement And Answer Gating

### Mục tiêu

Chốt điểm khác biệt cốt lõi của `dh`: agent không được phép đoán.

### Cần làm

1. required tools by intent
2. evidence thresholding
3. retry policy
4. degrade response policy
5. tool usage audit
6. answer gating

### Output kỳ vọng

- query thiếu tool hoặc thiếu evidence không được finalize dạng confident

Current implementation note:

- required-tools policy, answer gating, retry/degrade policy và audit đã có ở TS-side.
- Runtime-level enforcement hoàn chỉnh vẫn còn phụ thuộc Go hook wiring.

## Phase 12: Delivery And Migration Orchestration Depth

### Mục tiêu

Làm cho `delivery` và `migration` vận hành đúng tinh thần team workflow đã chốt.

### Cần làm

1. task split persistence
2. dependency-aware work item planning
3. parallel execution planner
4. architect-driven sequencing
5. reviewer/tester gates
6. migration invariants enforcement

### Output kỳ vọng

- `delivery` và `migration` chạy tuần tự ở analysis/design
- execution có thể song song khi safe
- migration có policy preserve behavior rõ ràng

Current implementation note:

- delivery/migration workflows, handoff chain cơ bản và review/verification gates cơ bản đã có.
- Work-item planning, dependency-aware scheduling và topology sâu hơn vẫn pending.

## Phase 13: Diagnostics And Doctor

### Mục tiêu

Làm cho `dh` tự kiểm tra được runtime health và config health.

### Cần làm

1. `doctor.ts`
2. health checks cho:
   - provider registry
   - model registry
   - variant registry
   - SQLite
   - embedding config
   - lane state
   - skill/MCP registry
3. `debug-dump.ts`

### Output kỳ vọng

- user có thể kiểm tra hệ thống đang sẵn sàng tới đâu
- dễ debug session state và config problems

Current implementation note:

- `doctor` hiện đã report XDG paths, SQLite readiness, registry health, semantic config health, hook readiness và action guidance.
- Đã có `debug-dump` và output machine-readable qua `dh doctor --json`, nhưng schema diagnostics vẫn còn rất mỏng.

## Phase 14: Browser Verification Depth

### Mục tiêu

Hoàn thiện browser-oriented verification cho frontend work.

### Cần làm

1. route từ tester/reviewer sang `chrome-devtools`
2. scripted flow qua `playwright`
3. support smoke flows và inspection flows

### Output kỳ vọng

- UI/browser verification không còn chỉ là lý thuyết trong docs

## Phase 15: Binary Packaging And Distribution

### Mục tiêu

Ship `dh` dưới dạng single binary cho end user.

### Cần làm

1. Finalize Go->TypeScript embedding strategy
2. Cross-compile pipeline for macOS (arm64, amd64) and Linux (amd64, arm64)
3. GitHub Releases automation
4. Homebrew tap for macOS (optional)
5. Install/upgrade/uninstall scripts
6. Binary size optimization
7. Self-update mechanism (optional)

### Output kỳ vọng

- user downloads one binary, runs `dh`, everything works
- no Node.js, Go, or other runtime dependencies required

## Phase 16: Hardening

### Mục tiêu

Làm cho `dh` bền, có thể dùng hàng ngày.

### Cần làm

1. performance tuning cho indexing
2. retrieval quality tuning
3. audit coverage review
4. resume reliability
5. config migration safety
6. state corruption recovery paths

### Output kỳ vọng

- `dh` đủ ổn định cho daily use

## Cross-Phase Validation Rules

Mỗi phase nên chỉ được coi là đạt khi có bằng chứng cụ thể.

### Foundation phases

- type contracts compile hoặc validate được
- state round-trip được

### Runtime phases

- lane lock hoạt động đúng
- stage transitions không sai chain

### Intelligence phases

- symbols/chunks/edges được index đúng ở repo mẫu

### Retrieval phases

- answer có evidence packets
- `trace` và `explain` không còn chỉ dựa vào text search

### Config phases

- `/config --agent` đi đủ flow agent -> provider -> model -> variant

### Enforcement phases

- query thiếu tool không finalize được
- query thiếu evidence không trả lời chắc chắn

## Recommended First Real Implementation Slice

Nếu bắt đầu code thật ngay sau tài liệu này, slice đầu tiên nên là:

1. shared contracts
2. runtime state skeleton
3. CLI shell
4. lane lock
5. agent model registry skeleton
6. `/config --agent` flow skeleton

Lý do:

- đây là xương sống của `dh`
- chưa cần code intelligence đầy đủ vẫn có thể boot đúng product shape

## Những thứ không nên làm quá sớm

1. tuning retrieval weights quá sớm khi index chưa chắc
2. UI terminal phức tạp trước khi command shell ổn định
3. fallback model logic quá nhiều tầng trước khi primary routing chạy đúng
4. browser automation sâu trước khi workflow/tester contract ổn định

## Kết luận

Implementation sequence của `dh` phải đi từ contracts và runtime discipline ra intelligence và retrieval, rồi mới tối ưu trải nghiệm. Nếu làm ngược lại, hệ thống sẽ dễ thành một tập hợp tính năng rời rạc thay vì một AI software factory vận hành có kỷ luật trên nền OpenCode.
