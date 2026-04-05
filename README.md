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

## User Guide

Phần này dành cho người chỉ muốn dùng `dh`, không muốn đọc code trước.

### Cách dùng nhanh nhất

Muốn dùng `dh`, bạn làm theo thứ tự này:

1. lấy binary `dh` phù hợp với máy của bạn
2. cài binary vào máy
3. mở terminal trong repo bạn muốn phân tích
4. chạy `dh doctor`
5. chạy `dh index`
6. bắt đầu dùng `dh ask`, `dh explain`, `dh trace`, hoặc workflow lanes

### Bước 1: Lấy binary

Nếu bạn đã có thư mục release `dist/releases/`, trong đó sẽ có các file như:

- `dh-darwin-arm64`
- `dh-darwin-amd64`
- `dh-linux-amd64`
- `dh-linux-arm64`

Chọn binary đúng với máy của bạn:

- Mac Apple Silicon: `dh-darwin-arm64`
- Mac Intel: `dh-darwin-amd64`
- Linux x86_64: `dh-linux-amd64`
- Linux ARM64: `dh-linux-arm64`

### Bước 2: Cài binary

Cách dễ nhất:

```sh
scripts/install-from-release.sh dist/releases
```

Lệnh này sẽ:

- tự chọn binary phù hợp với máy
- verify checksum từ `SHA256SUMS`
- cài `dh` vào `$HOME/.local/bin/dh`

Nếu muốn cài vào thư mục khác:

```sh
scripts/install-from-release.sh dist/releases "$HOME/bin"
```

### Bước 3: Đảm bảo `dh` nằm trong `PATH`

Nếu bạn cài vào `$HOME/.local/bin`, hãy chắc rằng shell của bạn có path này.

Kiểm tra:

```sh
echo "$PATH"
which dh
```

Nếu `which dh` không ra gì, thêm vào shell config.

Ví dụ với `zsh`:

```sh
export PATH="$HOME/.local/bin:$PATH"
```

Sau đó reload shell:

```sh
source ~/.zshrc
```

### Bước 4: Kiểm tra cài đặt

Chạy:

```sh
dh --help
dh doctor
```

Nếu `dh doctor` chạy được, nghĩa là app đã cài đúng.

### Bước 5: Mở đúng repo bạn muốn dùng

`dh` làm việc theo thư mục hiện tại.

Ví dụ:

```sh
cd /path/to/your-project
dh doctor
```

Bạn nên luôn đứng trong root của project muốn phân tích trước khi chạy `dh`.

### Bước 6: Index repo lần đầu

Trước khi hỏi `dh` về codebase, hãy index repo:

```sh
dh index
```

Việc này giúp `dh`:

- scan workspace
- extract symbols
- build graph
- chunk code
- build semantic index

Nếu repo thay đổi nhiều, bạn có thể chạy lại `dh index` để refresh.

### Bước 7: Bắt đầu dùng các lệnh chính

Hỏi trực tiếp về codebase:

```sh
dh ask "how does authentication work?"
```

Giải thích một symbol hoặc module:

```sh
dh explain "runIndexWorkflow"
```

Trace luồng xử lý:

```sh
dh trace "authentication request flow"
```

### Bước 8: Dùng workflow lanes khi cần

Task nhỏ, hẹp:

```sh
dh quick "fix semantic search ordering bug"
```

Feature hoặc thay đổi lớn hơn:

```sh
dh delivery "implement telemetry export command"
```

Migration / upgrade / compatibility:

```sh
dh migrate "upgrade embedding provider integration"
```

## User Walkthrough

Ví dụ đầy đủ cho một user mới:

```sh
# 1. Cài app
scripts/install-from-release.sh dist/releases

# 2. Đi tới project muốn phân tích
cd ~/Code/my-project

# 3. Kiểm tra health
dh doctor

# 4. Index project
dh index

# 5. Hỏi về codebase
dh ask "how does auth work?"

# 6. Giải thích symbol
dh explain "createServer"

# 7. Trace flow
dh trace "login flow"
```

## Khi nào cần `OPENAI_API_KEY`

Bạn chỉ cần `OPENAI_API_KEY` khi muốn dùng embedding provider thật.

Ví dụ:

```sh
export OPENAI_API_KEY="sk-..."
```

Khi có key, semantic retrieval/provider-backed flows sẽ dùng model thật.

Khi không có key:

- app vẫn dùng được
- nhiều flow dev/test vẫn chạy với mock provider
- nhưng semantic provider-backed behavior sẽ không đầy đủ như môi trường thật

## Những lệnh user nên nhớ

Nếu chỉ nhớ vài lệnh, hãy nhớ các lệnh này:

```sh
dh doctor
dh index
dh ask "..."
dh explain "..."
dh trace "..."
dh quick "..."
```

## Những lỗi thường gặp

### `dh: command not found`

Nguyên nhân:

- chưa cài binary
- binary chưa nằm trong `PATH`

Cách xử lý:

```sh
scripts/install-from-release.sh dist/releases
which dh
```

### `doctor` báo thiếu embedding key

Nguyên nhân:

- chưa set `OPENAI_API_KEY`

Cách xử lý:

- nếu chỉ muốn dùng local/dev flow thì có thể bỏ qua
- nếu muốn semantic/provider-backed behavior thật thì set key:

```sh
export OPENAI_API_KEY="sk-..."
```

### Kết quả trả lời yếu hoặc thiếu context

Nguyên nhân thường gặp:

- chưa chạy `dh index`
- index cũ sau khi codebase đã thay đổi lớn

Cách xử lý:

```sh
dh index
```

### `doctor` báo DB integrity hoặc SQLite issue

Nguyên nhân:

- local runtime state trong `.dh/` bị lỗi

Cách xử lý:

- đọc action guidance từ `dh doctor`
- nếu cần, tạo lại index bằng cách sửa local state rồi chạy lại `dh index`

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
