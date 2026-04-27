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

## `dh status` báo workspace/index/database chưa sẵn sàng

`dh status` hiện kiểm tra trạng thái workspace, index, và database cục bộ của
project. Nó không phải health-check tổng quát cho install/config/provider.

Nếu status cho thấy chưa có index hoặc dữ liệu index đã cũ, chạy lại:

```sh
dh index
```

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

## `status` báo lỗi database cục bộ

Các vấn đề kiểu này thường nằm ở local state trong `.dh/`.

Bạn có thể reset local state của project hiện tại bằng:

```sh
dh clean --yes
dh status
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
