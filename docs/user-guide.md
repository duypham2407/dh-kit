# User Guide

Hướng dẫn này dành cho người dùng cuối muốn cài và dùng `dh` trên macOS hoặc Linux.
Linux và macOS là các target platform hiện được hỗ trợ; hướng dẫn này không bao
gồm Windows install support.

## `dh` là gì?

`dh` là một local-first AI coding assistant chạy trên terminal.

Bạn dùng nó để:

- hỏi về codebase hiện tại
- giải thích file, symbol, module
- trace flow qua nhiều file khi trace-flow được hỗ trợ trong contract/lane tương lai (bounded contract hiện tại trả `unsupported`)
- chạy workflow có cấu trúc cho task kỹ thuật

## Rust-host lifecycle boundary for knowledge commands

Supported first-wave knowledge commands (`dh ask`, `dh explain`, `dh trace`) are
Rust-hosted on the lifecycle path: Rust starts and supervises the TypeScript
worker bundle and owns startup, readiness, health, timeout, recovery, shutdown,
cleanup, and final exit classification for that local process tree.

Important boundaries:

- TypeScript is the worker for workflow/output behavior on this path, not the
  lifecycle host.
- Bounded broad-understanding `dh ask` requests with a finite static subject can
  use Rust-authored `query.buildEvidence` packet truth. Legacy retrieval packets
  and TypeScript-hosted bridge diagnostics are not canonical for that touched
  Rust-hosted flow.
- Build evidence is not universal repository reasoning. Narrow ask/explain
  requests continue to use search, definition, or relationship methods when
  those are the truthful surface.
- Remaining TypeScript-hosted workflow, maintainer, or bridge paths are
  legacy/compatibility-only until separately migrated.
- `dh trace` can still return an `unsupported` command result even though its
  process lifecycle is Rust-hosted; this is not runtime tracing support.
- Linux and macOS are the supported target platforms. This does not add Windows
  platform support, daemon mode, remote/local socket control plane behavior,
  worker-pool behavior, shell or worktree orchestration redesign, or full
  workflow-lane parity.

## Bạn có cần clone source code không?

Không, nếu bạn đã có binary release.

Bạn chỉ cần:

1. cài binary `dh`
2. mở terminal trong repo bạn muốn phân tích
3. chạy `dh --help`
4. chạy `dh status`
5. chạy `dh index`
6. dùng `dh ask`, `dh explain` (và `dh trace` hiện đang trả `unsupported` trong bounded contract hiện tại)

Bạn chỉ cần clone source nếu bạn là developer của chính `dh`.

## Cài đặt trên macOS/Linux

### Cài trực tiếp từ GitHub Releases

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/install-github-release.sh | sh
```

Nếu muốn cài vào thư mục khác:

```sh
curl -fsSL https://raw.githubusercontent.com/duypham2407/dh-kit/main/scripts/install-github-release.sh | sh -s -- latest "$HOME/bin"
```

### Cách khuyến nghị

Nếu bạn có thư mục release:

```sh
scripts/install-from-release.sh dist/releases
```

### Homebrew (planned macOS distribution path)

Homebrew là hướng phân phối macOS được khuyến nghị tiếp theo cho `dh`.

Trạng thái hiện tại: chưa publish tap chính thức, nhưng policy và skeleton đã có trong:

```text
docs/homebrew.md
```

### Nếu muốn cài vào thư mục riêng

```sh
scripts/install-from-release.sh dist/releases "$HOME/bin"
```

### Kiểm tra sau khi cài

```sh
which dh
dh --help
```

## Cấu hình PATH

Nếu bạn cài vào `$HOME/.local/bin`, hãy đảm bảo shell nhìn thấy thư mục này.

### zsh

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

### bash

```sh
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

## Bắt đầu dùng trên một project

Ví dụ:

```sh
cd ~/Code/my-project
dh --help
dh status
dh index
dh ask "how does auth work?"
```

## Ý nghĩa các lệnh cơ bản

### `dh --version`

In ra version hiện tại của binary `dh`.

### `dh status`

Kiểm tra trạng thái workspace/index/database cục bộ để biết repo đã sẵn sàng cho các lệnh knowledge chưa.

`dh --help` vẫn là nơi authoritative để khám phá command set hiện có của binary
đã cài; `dh status` là bước kiểm tra workspace/index/database cục bộ, không phải
health-check tổng quát cho install/config/provider.

### `dh index`

Build index để `dh` hiểu codebase tốt hơn.

### `dh ask`

Hỏi một câu tự nhiên về codebase.

On the supported product path, `dh ask` is a Rust-hosted first-wave knowledge
command. Rust owns lifecycle authority; TypeScript returns workflow/output
evidence as the worker.

Bounded broad-understanding requests such as `how does auth work?` can use the
Rust `query.buildEvidence` method when the request has a finite static subject.
The returned Rust packet is the canonical evidence truth for that flow; legacy
retrieval-local packet helpers remain diagnostics/compatibility only.

Nếu chưa có index hoặc chưa có enough data, command sẽ gợi ý bước tiếp theo như `dh index` hoặc `dh status`.

Catalog query classes currently routed by `dh ask` (bounded, first-class):

- search-aware file/path discovery
- graph-aware definition lookup
- graph-aware one-hop reference/usage lookup
- graph-aware one-hop dependency lookup
- graph-aware one-hop dependent/importer lookup
- bounded broad-understanding via Rust-authored `query.buildEvidence` for finite
  static subjects

Requests outside those bounded ask classes return `unsupported` instead of falling back to a hidden class.

Result states are explicit and consistent:

- `grounded`: directly supported by surfaced evidence
- `partial`: some grounded evidence exists but coverage/depth is incomplete
- `insufficient`: class is valid but not enough evidence was found
- `unsupported`: request/class/depth is outside bounded support

Internal retrieval/signal blending may still happen under the hood for supported ask classes, but it is not a separate first-class ask-class contract.

When diagnostics mention keyword/structural/semantic signals, treat those as implementation diagnostics only, not as additional user-routed ask classes.

Lifecycle/process diagnostics are currently surfaced through status and internal diagnostics surfaces, not as a stable ask/explain/trace result envelope in this bounded contract.

### `dh explain`

Giải thích một symbol hoặc file cụ thể.

`dh explain` is mapped to the definition-oriented query class. On the supported
product path it runs inside the same Rust-host lifecycle authority boundary as
`dh ask`: Rust is host/supervisor and TypeScript is worker/output shaper.

### `dh trace`

Trace luồng xử lý hoặc dependency flow.

Trong bounded contract hiện tại của QUERY-EVIDENCE-HARDENING, `dh trace` được giữ ở trạng thái `unsupported`.

Nghĩa là output phải nói rõ unsupported (không overclaim parser-backed trace proof, không fallback ngầm thành grounded).

The lifecycle for this command is still Rust-hosted on the supported first-wave
path; only the trace-flow command result remains bounded/unsupported.

### `dh quick`

Chạy một workflow nhanh cho task nhỏ.

### `dh clean --yes`

Xóa local runtime state `.dh/` của project hiện tại để reset index/cache/DB.

## Khi nào cần `OPENAI_API_KEY`

Chỉ cần khi bạn muốn semantic retrieval dùng provider thật.

```sh
export OPENAI_API_KEY="sk-..."
```

Không có key thì app vẫn dùng được, nhưng semantic provider-backed behavior sẽ hạn chế hơn.

## Khuyến nghị sử dụng hằng ngày

1. vào đúng repo
2. chạy `dh status` nếu lâu rồi chưa dùng
3. chạy `dh index` sau khi repo thay đổi nhiều
4. dùng `dh ask`, `dh explain`; với bounded contract hiện tại, `dh trace` trả `unsupported`

## Lệnh mẫu

```sh
dh ask "where is session state stored?"
dh explain "runIndexWorkflow"
dh trace "authentication flow"  # expected: unsupported in bounded mode
dh quick "fix a failing status message"
```

## Xem thêm

- `README.md`
- `docs/troubleshooting.md`
- `docs/privacy-and-local-data.md`
