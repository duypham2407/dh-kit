# Troubleshooting

## `dh: command not found`

Kiểm tra:

```sh
which dh
echo "$PATH"
```

Nếu chưa cài:

```sh
scripts/install-from-release.sh dist/releases
```

## `which dh` không ra gì

Thường là do `$HOME/.local/bin` chưa có trong `PATH`.

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

## `dh doctor` báo thiếu embedding key

Nếu bạn muốn semantic provider-backed behavior thật:

```sh
export OPENAI_API_KEY="sk-..."
```

Nếu không, bạn vẫn có thể dùng nhiều local flow cơ bản.

## `dh doctor` báo `degraded` / `unsupported` / `misconfigured`

Từ Phase 5, `doctor` phân loại lỗi theo 3 nhóm lifecycle:

- `install/distribution`
- `runtime/workspace readiness`
- `capability/tooling`

Cách đọc nhanh:

- `degraded`: chạy được nhưng có rủi ro/thiếu readiness
- `misconfigured`: cấu hình hoặc state đang sai, cần sửa trước
- `unsupported`: capability đó hiện không thuộc supported contract

Luôn ưu tiên đọc phần `Recommended actions` trong output của `dh doctor`.

## Kết quả trả lời yếu hoặc không đúng ý

Thường do chưa index hoặc index cũ.

```sh
dh index
```

## Repo đã đổi nhiều sau lần dùng trước

Chạy lại:

```sh
dh index
```

## `doctor` báo lỗi SQLite hoặc DB integrity

Đọc action guidance từ `dh doctor` trước.

Các vấn đề kiểu này thường nằm ở local state trong `.dh/`.

Bạn có thể reset local state của project hiện tại bằng:

```sh
dh clean --yes
dh doctor
dh index
```

## Cần gỡ `dh`

```sh
scripts/uninstall.sh
```

Nếu bạn dùng install dir riêng:

```sh
scripts/uninstall.sh "$HOME/bin"
```
