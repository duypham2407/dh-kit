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

## Cần gỡ `dh`

```sh
scripts/uninstall.sh
```

Nếu bạn dùng install dir riêng:

```sh
scripts/uninstall.sh "$HOME/bin"
```
