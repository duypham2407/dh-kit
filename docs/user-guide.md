# User Guide

Hướng dẫn này dành cho người dùng cuối muốn cài và dùng `dh` trên macOS hoặc Linux.

## `dh` là gì?

`dh` là một local-first AI coding assistant chạy trên terminal.

Bạn dùng nó để:

- hỏi về codebase hiện tại
- giải thích file, symbol, module
- trace flow qua nhiều file khi trace-flow được hỗ trợ trong contract/lane tương lai (bounded contract hiện tại trả `unsupported`)
- chạy workflow có cấu trúc cho task kỹ thuật

## Bạn có cần clone source code không?

Không, nếu bạn đã có binary release.

Bạn chỉ cần:

1. cài binary `dh`
2. mở terminal trong repo bạn muốn phân tích
3. chạy `dh doctor`
4. chạy `dh index`
5. dùng `dh ask`, `dh explain` (và `dh trace` hiện đang trả `unsupported` trong bounded contract hiện tại)

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
dh doctor
dh index
dh ask "how does auth work?"
```

## Ý nghĩa các lệnh cơ bản

### `dh --version`

In ra version hiện tại của binary `dh`.

### `dh doctor`

Kiểm tra local runtime, DB, config, semantic readiness.

### `dh index`

Build index để `dh` hiểu codebase tốt hơn.

### `dh ask`

Hỏi một câu tự nhiên về codebase.

Nếu chưa có index hoặc chưa có enough data, command sẽ gợi ý bước tiếp theo như `dh index` hoặc `dh doctor`.

Catalog query classes currently routed by `dh ask` (bounded, first-class):

- search-aware file/path discovery
- graph-aware definition lookup
- graph-aware one-hop reference/usage lookup
- graph-aware one-hop dependency lookup
- graph-aware one-hop dependent/importer lookup

Requests outside those bounded ask classes return `unsupported` instead of falling back to a hidden class.

Result states are explicit and consistent:

- `grounded`: directly supported by surfaced evidence
- `partial`: some grounded evidence exists but coverage/depth is incomplete
- `insufficient`: class is valid but not enough evidence was found
- `unsupported`: request/class/depth is outside bounded support

Internal retrieval/signal blending may still happen under the hood for supported ask classes, but it is not a separate first-class ask-class contract.

When diagnostics mention keyword/structural/semantic signals, treat those as implementation diagnostics only, not as additional user-routed ask classes.

Lifecycle/process diagnostics are currently surfaced via `dh doctor` and internal diagnostics surfaces, not as a stable ask/explain/trace result envelope in this bounded contract.

### `dh explain`

Giải thích một symbol hoặc file cụ thể.

`dh explain` is mapped to the definition-oriented query class through the same Rust bridge envelope (`answerState`, `evidence`, `languageCapabilitySummary`) used by hardened query paths.

### `dh trace`

Trace luồng xử lý hoặc dependency flow.

Trong bounded contract hiện tại của QUERY-EVIDENCE-HARDENING, `dh trace` được giữ ở trạng thái `unsupported`.

Nghĩa là output phải nói rõ unsupported (không overclaim parser-backed trace proof, không fallback ngầm thành grounded).

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
2. chạy `dh doctor` nếu lâu rồi chưa dùng
3. chạy `dh index` sau khi repo thay đổi nhiều
4. dùng `ask`, `explain`; với bounded contract hiện tại, `trace` trả `unsupported`

## Lệnh mẫu

```sh
dh ask "where is session state stored?"
dh explain "runIndexWorkflow"
dh trace "authentication flow"  # expected: unsupported in bounded mode
dh quick "fix a failing doctor message"
```

## Xem thêm

- `README.md`
- `docs/troubleshooting.md`
- `docs/privacy-and-local-data.md`
