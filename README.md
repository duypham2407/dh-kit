# dh

`dh` là một local-first AI coding assistant cho macOS và Linux.

Current repository direction:

- `dh` dang duoc dua ve baseline upstream OpenCode day du hon o lop runtime
- sau do moi ap cac patch DH theo tung nhom thay doi co chu dich
- execution plan hien tai nam o `docs/architecture/opencode-upstream-update-plan.md`

Nó giúp bạn:

- hiểu codebase bằng `ask`, `explain` (và `trace` hiện trả `unsupported` trong bounded contract hiện tại)
- index project để có structural + semantic retrieval
- chạy workflow theo 3 lane: `quick`, `delivery`, `migration`
- xem trạng thái workspace/index bằng `status`

## Rust Host Lifecycle Authority Boundary

- First-wave knowledge commands (`dh ask`, `dh explain`, `dh trace`) use the
  supported Rust-hosted lifecycle path: the Rust `dh` host starts and supervises
  the TypeScript worker bundle, owns startup/readiness/health/timeout/recovery/
  shutdown/final-exit truth, and labels the lifecycle topology as
  `rust_host_ts_worker`.
- On that Rust-hosted path, bounded broad-understanding `dh ask` requests with a
  finite static subject (for example `how does auth work?`) can use
  Rust-authored `query.buildEvidence` packet truth. TypeScript may shape and
  present that packet, but legacy retrieval packets are non-canonical for this
  flow.
- Narrow `dh ask` and `dh explain` requests still use the named search,
  definition, or relationship query methods when those are the truthful surface;
  build evidence is not universal repository reasoning.
- `dh trace` is part of that Rust-hosted process lifecycle boundary, but the
  trace-flow result may still be `unsupported` under the current bounded command
  contract. This is not runtime tracing support.
- TypeScript remains the worker for workflow/output shaping on that path. Any
  TypeScript-hosted workflow, maintainer, or bridge path that still starts Rust
  is legacy/compatibility-only and is not equal lifecycle authority.
- This boundary is local child-process execution only. It does not add daemon
  mode, remote/local socket control plane behavior, Windows platform support,
  worker-pool behavior, generic shell/worktree orchestration redesign, or full
  workflow-lane parity.

`dh` được tối ưu để chạy như một binary local trên:

- macOS Apple Silicon
- macOS Intel
- Linux x86_64
- Linux ARM64

Supported target platforms are Linux and macOS. Windows is not a current target
platform for `dh` install or release support.

### Requirements

- **Node.js v22+** must be installed and available in `PATH` to run `dh` operational commands (`ask`, `explain`, `trace`, `status`, `index`, workflow commands, etc.).
- `dh --help` / `dh --version` may work without full runtime setup, but normal product-path usage assumes Node.js is present.

  ```sh
  node --version  # should print v22.x or later
  ```

## Who This Is For

`dh` phù hợp nếu bạn muốn:

- hỏi về codebase local của mình
- trace flow qua nhiều file khi trace-flow class được hỗ trợ trong một contract/lane tương lai
- hiểu symbol/module/dependency nhanh hơn grep đơn thuần
- dùng một AI workflow tool chạy local-first trên terminal

Bạn không cần đọc source code của `dh` để bắt đầu dùng.

## Install

### Option 0: One-line install from GitHub Releases

macOS và Linux có thể cài trực tiếp từ GitHub Releases bằng script này:

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/install-github-release.sh | sh
```

Script sẽ:

- detect macOS/Linux và CPU architecture
- tải đúng binary release
- verify checksum từ `SHA256SUMS` (bounded verification tier)
- cài vào `$HOME/.local/bin/dh`
- in lifecycle summary với `surface/condition/why/works/limited/next`

Lưu ý quan trọng về trust level:

- GitHub install path là **narrower path**: checksum-verified, nhưng không verify `manifest.json`/file-size
- path trust mạnh nhất vẫn là install từ local release directory (`install-from-release.sh`)

Nếu muốn cài vào thư mục riêng:

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/install-github-release.sh | sh -s -- latest "$HOME/bin"
```

### Option 1: Install from a release directory

Nếu bạn đã có thư mục release chứa các binary như:

- `dh-darwin-arm64`
- `dh-darwin-amd64`
- `dh-linux-amd64`
- `dh-linux-arm64`

thì cài bằng:

```sh
scripts/install-from-release.sh dist/releases
```

Lệnh này là trust path mạnh nhất hiện tại và sẽ:

- tự chọn binary đúng với hệ điều hành và CPU
- verify release metadata (`SHA256SUMS` + `manifest.json` + file-size)
- cài `dh` vào `$HOME/.local/bin/dh`
- report rõ signature status (`verified` / `skipped` / `unavailable` / `absent`)

Nếu muốn cài vào thư mục khác:

```sh
scripts/install-from-release.sh dist/releases "$HOME/bin"
```

### Option 2: Install a binary manually

Ví dụ với macOS Apple Silicon:

```sh
mkdir -p "$HOME/.local/bin"
cp dh-darwin-arm64 "$HOME/.local/bin/dh"
chmod +x "$HOME/.local/bin/dh"
```

Manual/direct binary path là bounded/manual trust path; không tương đương local
release-directory verification.

### Add `dh` to PATH

Nếu shell của bạn chưa có `$HOME/.local/bin` trong `PATH`, thêm vào.

Với `zsh`:

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Với `bash`:

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Kiểm tra:

```sh
which dh
dh --help
```

## What You Need

### For End Users

Bạn chỉ cần:

- binary `dh`
- Node.js v22+ trong `PATH`

Bạn không cần:

- npm
- Go

Optional:

- `OPENAI_API_KEY` nếu muốn semantic retrieval dùng provider thật

### For Developers

Nếu bạn muốn build/test từ source:

- Node.js
- npm
- Rust (toolchain 1.94.1 via `rust-toolchain.toml`)
- make

## First-Time Setup

Sau khi cài `dh`, cách bắt đầu đúng là:

1. mở terminal trong project bạn muốn phân tích
2. chạy `dh --help` để xem command set hiện có
3. chạy `dh status` để xem trạng thái workspace/index
4. chạy `dh index`
5. bắt đầu dùng `dh ask`, `dh explain` (`dh trace` hiện trả `unsupported` trong bounded contract này)

Nếu bạn chạy `dh ask`, `dh explain` quá sớm khi chưa index, CLI hiện sẽ gợi ý chạy `dh index` hoặc `dh status`.

### Step 1: Go to your project

Ví dụ:

```sh
cd ~/Code/my-project
```

`dh` luôn làm việc theo thư mục hiện tại.

### Step 2: Check available commands and workspace status

```sh
dh --help
dh status
```

`dh --help` sẽ giúp bạn biết command set hiện có, và `status` chỉ giúp bạn biết trạng thái workspace/index local:

- workspace state hiện tại
- index state hiện tại
- database/index metadata local hiện tại
- repo đã có index chưa

Status boundary (quan trọng):

- `dh status` chỉ trả lời trạng thái workspace/index/database/index ở mức người dùng.
- `dh status` không phải install readiness, provider config readiness, hay embedding-key readiness check.
- Nếu bạn cần workflow-state/evidence/policy status, dùng:
  `node .opencode/workflow-state.js status|show|show-policy-status|show-invocations|check-stage-readiness|resume-summary`.

Các diagnostics nội bộ phân loại lifecycle theo 3 nhóm để tránh false-OK:

- `install/distribution`
- `runtime/workspace readiness`
- `capability/tooling`

Mỗi nhóm có trạng thái: `healthy`, `degraded`, `unsupported`, hoặc `misconfigured`.

### Step 3: Build the local index

```sh
dh index
```

Lần index đầu tiên sẽ:

- scan workspace
- extract symbols
- extract graph edges
- chunk code
- build semantic index

Nếu project thay đổi nhiều, hãy chạy lại:

```sh
dh index
```

### Step 4: Start asking questions

```sh
dh ask "how does authentication work?"
dh explain "createServer"
```

`dh ask "how does <subject> work?"` is a bounded broad-understanding path: it
uses Rust-authored `query.buildEvidence` only when a finite static subject can be
extracted. Unbounded repository-wide, runtime tracing, or unsupported-depth asks
remain `unsupported` or `insufficient` instead of falling back to legacy
TypeScript-authored packet authority.

`dh trace` trong bounded contract hiện tại của QUERY-EVIDENCE-HARDENING trả về `unsupported` (truthful by design).

## Most Important Commands

Nếu bạn là user mới, hãy nhớ các lệnh này trước:

```sh
dh --help
dh status
dh index
dh ask "..."
dh explain "..."
dh quick "..."
dh clean --yes
```

`dh trace` là lệnh bounded; trong contract hiện tại nó được giữ ở trạng thái unsupported.

## Version

```sh
dh --version
```

## Everyday Usage

### Ask about the codebase

```sh
dh ask "how does auth work?"
dh ask "where is session state persisted?"
```

### Explain a symbol or file

```sh
dh explain "runIndexWorkflow"
dh explain "packages/runtime/src/diagnostics/audit-query-service.ts"
```

### Trace a flow (bounded)

`dh trace` hiện được giữ ở trạng thái `unsupported` trong bounded contract hiện tại.

Output đúng sẽ nói rõ unsupported thay vì fallback thành parser-backed proof.

### Use workflow lanes

Task nhỏ, hẹp:

```sh
dh quick "fix an index output bug"
```

Feature lớn hơn:

```sh
dh delivery "implement exportable telemetry summary"
```

Upgrade/migration:

```sh
dh migrate "upgrade provider integration to a new API contract"
```

## Optional: Enable Real Semantic Retrieval

## Language Support Boundary (bounded)

`dh` tách rõ 2 lớp trạng thái:

- answer/result state: `grounded | partial | insufficient | unsupported`
- language/capability state: `supported | partial | best-effort | unsupported`

Các state này không thay thế cho nhau. Một answer `grounded` không tự động nghĩa là
mọi capability của ngôn ngữ đều supported; và capability `supported` cũng không tự động
làm mọi invocation trở thành grounded.

Ngoài ra, retrieval-backed output vẫn có thể hữu ích nhưng không được diễn giải như
parser-backed proof khi evidence packet không chứng minh điều đó.

Nếu muốn semantic retrieval dùng embedding provider thật, set `OPENAI_API_KEY`:

```sh
export OPENAI_API_KEY="sk-..."
```

Nếu không set key:

- app vẫn chạy
- nhiều flow local/dev vẫn hoạt động
- nhưng semantic provider-backed behavior sẽ không đầy đủ như môi trường thật

## macOS And Linux Notes

`dh` hiện tối ưu theo hướng local binary cho macOS và Linux.

Platform mapping:

- macOS Apple Silicon: `dh-darwin-arm64`
- macOS Intel: `dh-darwin-amd64`
- Linux x86_64: `dh-linux-amd64`
- Linux ARM64: `dh-linux-arm64`

Install mặc định dùng thư mục:

```text
$HOME/.local/bin
```

Đây là lựa chọn phù hợp cho cả Linux và macOS, miễn là thư mục này có trong `PATH`.

## Common Problems

### `dh: command not found`

Nguyên nhân thường gặp:

- chưa cài binary
- binary chưa nằm trong `PATH`

Cách xử lý:

```sh
which dh
echo "$PATH"
```

Nếu cần, cài lại:

```sh
scripts/install-from-release.sh dist/releases
```

### Cần semantic provider-backed behavior

Embedding key không thuộc boundary của `dh status`.

Nếu bạn chỉ muốn dùng local flow cơ bản, có thể vẫn tiếp tục.

Nếu `dh ask` hoặc cấu hình provider-backed behavior cần embedding provider thật, set key tương ứng, ví dụ:

```sh
export OPENAI_API_KEY="sk-..."
```

### Kết quả yếu hoặc thiếu context

Thường do chưa index hoặc index cũ.

Chạy lại:

```sh
dh index
```

### Repo thay đổi nhiều sau khi đã index

Chạy lại:

```sh
dh index
```

### Muốn reset local state của `dh`

```sh
dh clean --yes
```

Lệnh này sẽ xóa `.dh/` của project hiện tại. Sau đó chạy lại:

```sh
dh status
dh index
```

## Upgrade

Nếu bạn đã cài `dh` và có release mới:

### Upgrade trực tiếp từ GitHub Releases

Khuyên dùng cách này nếu bạn muốn lấy đúng bản mới nhất thay vì phụ thuộc vào `dist/releases` local:

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/upgrade-github-release.sh | sh
```

Nếu muốn upgrade tới một tag cụ thể hoặc cài vào thư mục riêng:

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/upgrade-github-release.sh | sh -s -- v0.1.6 "$HOME/bin"
```

Script này sẽ:

- detect đúng OS/CPU
- tải binary mới nhất từ GitHub Releases
- verify checksum từ `SHA256SUMS`
- backup binary cũ
- verify binary mới bằng `dh --version`
- rollback nếu verify thất bại

Lưu ý: đây vẫn là GitHub checksum-bounded path (không manifest/file-size parity
với local release-directory path).

### Upgrade từ release directory local

Chỉ dùng cách này nếu bạn chắc chắn `dist/releases` là bản mới bạn vừa build hoặc vừa tải về:

```sh
scripts/upgrade-from-release.sh dist/releases
```

Script upgrade sẽ:

- chọn đúng binary cho máy
- verify checksum
- backup binary cũ
- rollback nếu binary mới lỗi khi verify

Path này giữ trust level mạnh nhất cho lifecycle từ local release bundle vì có
manifest/checksum/file-size verification trước khi mutate install target.

## Uninstall

```sh
scripts/uninstall.sh
```

Nếu bạn cài vào thư mục custom:

```sh
scripts/uninstall.sh "$HOME/bin"
```

## Full User Walkthrough

Ví dụ đầy đủ trên macOS/Linux:

```sh
# 1. Install dh
scripts/install-from-release.sh dist/releases

# 2. Check installation
which dh
dh --help

# 3. Go to your project
cd ~/Code/my-project

# 4. Check available commands and workspace status
dh --help
dh status

# 5. Build the index
dh index

# 6. Ask about the project
dh ask "how does auth work?"

# 7. Explain a symbol
dh explain "createServer"

# 8. Trace a flow
dh trace "login flow"
```

## More Documentation

User-facing docs:

- `docs/user-guide.md`
- `docs/troubleshooting.md`
- `docs/privacy-and-local-data.md`
- `docs/homebrew.md`
- `docs/changelog-policy.md`

Operations docs:

- `docs/operations/release-and-install.md`
- `docs/operations/staging-e2e-smoke.md`

Architecture docs:

- `docs/project-architecture.md`
- `docs/structure.md`
- `docs/architecture/system-overview.md`
- `docs/architecture/implementation-roadmap.md`

## Development

Nếu bạn đang phát triển source code của `dh`:

```sh
npm install
npm run check
npm test
cd rust-engine && cargo test --workspace
make release-all
```
