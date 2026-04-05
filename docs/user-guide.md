# User Guide

Hướng dẫn này dành cho người dùng cuối muốn cài và dùng `dh` trên macOS hoặc Linux.

## `dh` là gì?

`dh` là một local-first AI coding assistant chạy trên terminal.

Bạn dùng nó để:

- hỏi về codebase hiện tại
- giải thích file, symbol, module
- trace flow qua nhiều file
- chạy workflow có cấu trúc cho task kỹ thuật

## Bạn có cần clone source code không?

Không, nếu bạn đã có binary release.

Bạn chỉ cần:

1. cài binary `dh`
2. mở terminal trong repo bạn muốn phân tích
3. chạy `dh doctor`
4. chạy `dh index`
5. dùng `dh ask`, `dh explain`, `dh trace`

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

### `dh doctor`

Kiểm tra local runtime, DB, config, semantic readiness.

### `dh index`

Build index để `dh` hiểu codebase tốt hơn.

### `dh ask`

Hỏi một câu tự nhiên về codebase.

Nếu chưa có index hoặc chưa có enough data, command sẽ gợi ý bước tiếp theo như `dh index` hoặc `dh doctor`.

### `dh explain`

Giải thích một symbol hoặc file cụ thể.

### `dh trace`

Trace luồng xử lý hoặc dependency flow.

### `dh quick`

Chạy một workflow nhanh cho task nhỏ.

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
4. dùng `ask`, `explain`, `trace`

## Lệnh mẫu

```sh
dh ask "where is session state stored?"
dh explain "runIndexWorkflow"
dh trace "authentication flow"
dh quick "fix a failing doctor message"
```

## Xem thêm

- `README.md`
- `docs/troubleshooting.md`
- `docs/privacy-and-local-data.md`
