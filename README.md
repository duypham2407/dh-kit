# dh-kit

`dh` là một local-first AI software factory cho codebase work.

Mục tiêu của project:

- đọc hiểu codebase bằng hybrid retrieval: keyword + symbol + graph + semantic
- trả lời có evidence thay vì đoán
- hỗ trợ 3 lane workflow: `quick`, `delivery`, `migration`
- enforce tool usage và answer gating qua runtime hooks
- ship dưới dạng binary cho macOS/Linux

Repository này chứa toàn bộ source code, runtime, release scripts, diagnostics, và tài liệu kiến trúc của `dh`.

## What It Can Do

`dh` hiện hỗ trợ các nhóm tác vụ chính sau:

- hỏi đáp codebase: `ask`
- giải thích symbol/module: `explain`
- trace flow và dependency: `trace`
- index workspace để bật structural + semantic retrieval: `index`
- chạy workflow theo lane:
  - `quick` cho task hẹp, cần đi nhanh
  - `delivery` cho feature work hoặc multi-role flow
  - `migrate` cho upgrade, migration, compatibility remediation
- kiểm tra health/runtime/config bằng `doctor`
- cấu hình model, semantic mode, embedding provider bằng `config`

## Project Status

Theo roadmap hiện tại, các phase chính của project đã hoàn thành ở mức implementation và validation hiện có, bao gồm:

- runtime persistence
- CLI command surface
- lane workflows
- Go hook wiring
- retrieval + semantic retrieval
- diagnostics/doctor
- release packaging + install/upgrade flow
- hardening: ANN, telemetry, DB recovery

Tài liệu chi tiết:

- roadmap: `docs/architecture/implementation-roadmap.md`
- kiến trúc tổng thể: `docs/project-architecture.md`
- release/install runbook: `docs/operations/release-and-install.md`
- staging smoke runbook: `docs/operations/staging-e2e-smoke.md`

## Repository Layout

```text
apps/
  cli/                  CLI entrypoint and command layer

packages/
  opencode-core/        Forked Go runtime with dh hooks
  opencode-app/         Workflow, enforcement, config, orchestration logic
  runtime/              Diagnostics, indexing jobs, session/runtime services
  retrieval/            Retrieval + semantic retrieval pipeline
  intelligence/         Parser, symbols, graph, indexing intelligence
  storage/              SQLite repositories and persistence
  providers/            Provider/model registry
  shared/               Shared contracts and utilities

docs/
  architecture/         Architecture and implementation docs
  operations/           Install/release/smoke runbooks
```

## Requirements

### For Users

Nếu bạn chỉ muốn dùng `dh` như một app đã build sẵn, bạn chỉ cần:

- binary `dh` đúng với nền tảng của bạn

Không cần cài:

- Node.js
- npm
- Go

Optional:

- `OPENAI_API_KEY` nếu muốn dùng embedding provider thật

### For Developers

Nếu bạn muốn chạy từ source, test, build, hoặc phát triển thêm tính năng, bạn cần:

- Node.js
- npm
- Go
- make

### Optional Environment Variables

- `OPENAI_API_KEY`: dùng embedding provider thật thay vì mock provider
- `DH_RUN_QUIET=true`: tắt spinner / interactive noise trong automation và smoke runs

Local development:

- Node.js
- npm
- Go
- make

Optional:

- `OPENAI_API_KEY` để dùng embedding provider thật
- GPG key nếu muốn sign release artifacts

Lưu ý:

- Nếu không có `OPENAI_API_KEY`, semantic embedding tests và indexing flow sẽ dùng mock embedding provider deterministic.
- Provider-backed smoke/test sẽ skip khi không có key.

## Development Quick Start

Từ root repo:

```sh
npm install
npm run check
npm test
```

Go tests:

```sh
cd packages/opencode-core
go test ./...
```

Build local artifacts:

```sh
make build
make release-all
```

Verify packaged artifacts:

```sh
scripts/verify-release-artifacts.sh dist/releases
```

## CLI Overview

Help surface hiện tại:

```text
dh <command> [args]

Commands:
  quick <task> [--json]
  delivery <goal> [--json]
  migrate <goal> [--json]
  ask <question> [--json]
  explain <symbol> [--json]
  trace <target> [--json]
  index
  doctor [--json] [--debug-dump [path]]
  config --agent
  config --verify-agent [quick|delivery|migration]
  config --semantic [always|auto|off]
  config --embedding
  config --show
```

## First-Time Setup

### 1. Check runtime health

```sh
dh doctor
```

JSON output:

```sh
dh doctor --json
```

Write debug dump:

```sh
dh doctor --debug-dump
dh doctor --debug-dump .dh/debug-dump.json
```

`doctor` sẽ kiểm tra:

- SQLite readiness
- required tables
- embedding config
- provider/model registry
- workflow mirror
- hook readiness
- DB integrity
- recommended actions nếu thiếu config hoặc index

### 2. Configure semantic mode

Xem semantic mode hiện tại:

```sh
dh config --semantic
```

Đặt mode:

```sh
dh config --semantic always
dh config --semantic auto
dh config --semantic off
```

Policy hiện tại:

- `always`: luôn dùng semantic retrieval khi available
- `auto`: runtime có thể tự giảm semantic usage theo policy
- `off`: tắt semantic retrieval

### 3. Configure embedding provider

Interactive flow:

```sh
dh config --embedding
```

Mặc định project dùng:

- provider: OpenAI
- model: `text-embedding-3-small`

Set key khi muốn dùng provider thật:

```sh
export OPENAI_API_KEY="sk-..."
```

### 4. Configure agent model assignment

Interactive flow:

```sh
dh config --agent
```

Verify lane hiện đang resolve model nào:

```sh
dh config --verify-agent quick
dh config --verify-agent delivery
dh config --verify-agent migration
```

Xem toàn bộ config hiện tại:

```sh
dh config --show
```

## Indexing A Repository

Để bật structural retrieval + semantic retrieval, hãy index repo trước:

```sh
dh index
```

Index flow hiện tại sẽ:

1. scan workspace
2. extract symbols
3. extract import edges
4. extract call edges + call sites
5. chunk files
6. persist chunks
7. embed chunks
8. build ANN/HNSW semantic index

Output có diagnostics dạng:

- files refreshed
- files unchanged
- symbols extracted
- edges extracted
- call-sites extracted
- chunks produced
- embeddings stored / skipped / tokens used

Local runtime data được ghi vào `.dh/`.

## Knowledge Commands

### `dh ask`

Dùng khi muốn hỏi trực tiếp về codebase.

```sh
dh ask "how does authentication work?"
dh ask "where is session state persisted?"
dh ask "how does indexing rebuild embeddings?" --json
```

### `dh explain`

Dùng khi muốn giải thích symbol hoặc module cụ thể.

```sh
dh explain "runIndexWorkflow"
dh explain "HookEnforcer"
dh explain "packages/runtime/src/diagnostics/doctor.ts" --json
```

### `dh trace`

Dùng khi muốn trace flow, dependency, impact hoặc execution path.

```sh
dh trace "authentication request flow"
dh trace "runIndexWorkflow"
dh trace "semantic search path" --json
```

### JSON Output

Các command `ask`, `explain`, `trace`, `quick`, `delivery`, `migrate` đều hỗ trợ `--json`.

Ví dụ:

```sh
dh ask "how does doctor work?" --json
dh quick "add a new doctor check" --json
```

## Workflow Lanes

`dh` có 3 workflow lane chính.

### 1. Quick

Phù hợp cho:

- bug fix nhỏ
- refactor hẹp
- command/tooling change nhỏ
- docs cleanup

Ví dụ:

```sh
dh quick "fix semantic search ordering bug"
dh quick "update release docs for installer verification"
```

### 2. Delivery

Phù hợp cho:

- feature work
- cross-package change
- task cần analysis/design/review rõ ràng

Ví dụ:

```sh
dh delivery "implement telemetry dashboard export"
dh delivery "add end-to-end browser verification for frontend workflows"
```

### 3. Migration

Phù hợp cho:

- dependency upgrade
- framework migration
- compatibility remediation
- preserve-behavior upgrade work

Ví dụ:

```sh
dh migrate "upgrade embedding provider integration to new API contract"
dh migrate "migrate sqlite health checks to new runtime schema"
```

### Lane behavior

- session bị khóa theo lane hiện tại
- lane không tự chuyển nếu user không yêu cầu
- mỗi lane có topology và policy riêng

## Semantic Retrieval Details

Semantic retrieval mặc định bật với embedding model `text-embedding-3-small`.

Search strategy hiện tại:

1. HNSW index
2. flat ANN cache fallback
3. DB scan fallback

Project cũng đã có:

- ANN/HNSW project-local cache trong `.dh/cache/`
- telemetry log tại `.dh/telemetry/events.jsonl`
- DB integrity/recovery path trong doctor/runtime

Nếu không có `OPENAI_API_KEY`, system dùng mock embedding provider deterministic để test/dev không phụ thuộc network.

## Diagnostics, Debugging, Recovery

### Doctor

```sh
dh doctor
dh doctor --json
```

### Debug dump

```sh
dh doctor --debug-dump
```

Default output path:

```text
.dh/debug-dump.json
```

### DB integrity and recovery

Doctor hiện đã kiểm tra DB integrity và sẽ report action nếu SQLite state hỏng.

Runtime cũng đã có recovery helpers cho:

- backup DB
- WAL checkpoint
- VACUUM
- schema recreation (last resort)

### Telemetry

Telemetry events được ghi local vào:

```text
.dh/telemetry/events.jsonl
```

Các event chính:

- embedding pipeline metrics
- ANN build metrics
- semantic search metrics

## Release And Install

### Build release artifacts

```sh
make release-all
```

Artifacts sẽ nằm ở `dist/releases/`.

### Verify artifacts

```sh
scripts/verify-release-artifacts.sh dist/releases
```

### Test installers

```sh
scripts/test-installers.sh dist/releases
```

### Run staging smoke

```sh
DH_RUN_QUIET=true scripts/staging-e2e-smoke.sh dist/releases
```

### Install from release directory

```sh
scripts/install-from-release.sh dist/releases
```

### Upgrade from release directory

```sh
scripts/upgrade-from-release.sh dist/releases
```

### Uninstall

```sh
scripts/uninstall.sh
```

Chi tiết đầy đủ:

- `docs/operations/release-and-install.md`
- `docs/operations/staging-e2e-smoke.md`

## Validation Commands

Các lệnh validation chính đang dùng trong project:

```sh
npm run check
npm test
cd packages/opencode-core && go test ./...
make release-all
scripts/verify-release-artifacts.sh dist/releases
DH_RUN_QUIET=true scripts/staging-e2e-smoke.sh dist/releases
scripts/test-installers.sh dist/releases
```

## Notes For Contributors

- Không commit dữ liệu local trong `.dh/`
- Không commit DB/WAL/telemetry/cache artifacts
- Không commit thư mục demo hoặc file chứa credentials
- Nếu thêm command mới, hãy cập nhật README và runbook tương ứng
- Nếu thay đổi workflow/runtime behavior, hãy sync với `docs/architecture/implementation-roadmap.md`

## More Documentation

- `docs/project-architecture.md`
- `docs/structure.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/implementation-roadmap.md`
- `docs/operations/release-and-install.md`
- `docs/operations/staging-e2e-smoke.md`
