# Homebrew Distribution

Mục tiêu của tài liệu này là chuẩn hóa hướng phân phối `dh` qua Homebrew cho macOS.

## Trạng thái hiện tại

`dh` hiện đã có:

- GitHub Releases với binary cho macOS/Linux
- one-line install script cho GitHub Releases
- release notes template

## Hướng phát hành Homebrew

Khuyến nghị dùng tap riêng:

```text
duypham2407/homebrew-dh
```

Formula đề xuất:

```text
Formula/dh.rb
```

## Install UX mong muốn

Người dùng macOS sẽ cài kiểu:

```sh
brew tap duytham2407/dh
brew install dh
```

Hoặc:

```sh
brew install duytham2407/dh/dh
```

## Formula skeleton

```ruby
class Dh < Formula
  desc "Local-first AI coding assistant for macOS and Linux"
  homepage "https://github.com/duypham2407/dh-kit"
  version "0.1.0"

  if OS.mac? && Hardware::CPU.arm?
    url "https://github.com/duypham2407/dh-kit/releases/download/v0.1.0/dh-darwin-arm64"
    sha256 "<sha256>"
  elsif OS.mac? && Hardware::CPU.intel?
    url "https://github.com/duypham2407/dh-kit/releases/download/v0.1.0/dh-darwin-amd64"
    sha256 "<sha256>"
  end

  def install
    bin.install Dir["dh-*"][0] => "dh"
  end

  test do
    assert_match "dh", shell_output("#{bin}/dh --help")
  end
end
```

## Maintainer flow

Mỗi lần release:

1. tạo tag mới
2. publish GitHub Release
3. lấy SHA256 từ `SHA256SUMS`
4. cập nhật formula trong tap repo
5. push formula update

## Ghi chú

- Homebrew chủ yếu quan trọng cho macOS
- Linux vẫn nên ưu tiên GitHub Releases + install script
- bước tiếp theo nên là tự động generate formula content từ release manifest
