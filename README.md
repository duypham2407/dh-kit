# dh

`dh` là một local-first AI coding assistant cho macOS và Linux.

Nó giúp bạn:

- hiểu codebase bằng `ask`, `explain`, `trace`
- index project để có structural + semantic retrieval
- chạy workflow theo 3 lane: `quick`, `delivery`, `migration`
- kiểm tra health/config bằng `doctor`

`dh` được tối ưu để chạy như một binary local trên:

- macOS Apple Silicon
- macOS Intel
- Linux x86_64
- Linux ARM64

## Who This Is For

`dh` phù hợp nếu bạn muốn:

- hỏi về codebase local của mình
- trace flow qua nhiều file
- hiểu symbol/module/dependency nhanh hơn grep đơn thuần
- dùng một AI workflow tool chạy local-first trên terminal

Bạn không cần đọc source code của `dh` để bắt đầu dùng.

## Install

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

Lệnh này sẽ:

- tự chọn binary đúng với hệ điều hành và CPU
- verify checksum từ `SHA256SUMS`
- cài `dh` vào `$HOME/.local/bin/dh`

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

Bạn không cần:

- Node.js
- npm
- Go

Optional:

- `OPENAI_API_KEY` nếu muốn semantic retrieval dùng provider thật

### For Developers

Nếu bạn muốn build/test từ source:

- Node.js
- npm
- Go
- make

## First-Time Setup

Sau khi cài `dh`, cách bắt đầu đúng là:

1. mở terminal trong project bạn muốn phân tích
2. chạy `dh doctor`
3. chạy `dh index`
4. bắt đầu dùng `dh ask`, `dh explain`, `dh trace`

### Step 1: Go to your project

Ví dụ:

```sh
cd ~/Code/my-project
```

`dh` luôn làm việc theo thư mục hiện tại.

### Step 2: Check runtime health

```sh
dh doctor
```

Nếu muốn output JSON:

```sh
dh doctor --json
```

Nếu muốn dump thêm debug info ra file:

```sh
dh doctor --debug-dump
```

`doctor` sẽ giúp bạn biết:

- local state đã sẵn sàng chưa
- SQLite có ổn không
- semantic config đã set chưa
- embedding key có thiếu không
- repo đã có index chưa

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
dh trace "login flow"
```

## Most Important Commands

Nếu bạn là user mới, hãy nhớ 6 lệnh này trước:

```sh
dh doctor
dh index
dh ask "..."
dh explain "..."
dh trace "..."
dh quick "..."
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
dh explain "packages/runtime/src/diagnostics/doctor.ts"
```

### Trace a flow

```sh
dh trace "request lifecycle"
dh trace "semantic search path"
```

### Use workflow lanes

Task nhỏ, hẹp:

```sh
dh quick "fix a doctor output bug"
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

### `doctor` báo thiếu embedding key

Điều này không phải lúc nào cũng là lỗi blocker.

Nếu bạn chỉ muốn dùng local flow cơ bản, có thể vẫn tiếp tục.

Nếu muốn semantic provider-backed behavior thật:

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

## Upgrade

Nếu bạn đã cài `dh` và có release mới:

```sh
scripts/upgrade-from-release.sh dist/releases
```

Script upgrade sẽ:

- chọn đúng binary cho máy
- verify checksum
- backup binary cũ
- rollback nếu binary mới lỗi khi verify

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

# 4. Check health
dh doctor

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
cd packages/opencode-core && go test ./...
make release-all
```
