#!/usr/bin/env sh
set -eu

REPO="${DH_GITHUB_REPO:-duypham2407/dh-kit}"
VERSION="${1:-latest}"
INSTALL_DIR="${2:-$HOME/.local/bin}"
RUST_BOOTSTRAP="${DH_INSTALL_RUST_TOOLS:-0}"
RUST_ASSUME_YES="${DH_INSTALL_RUST_TOOLS_YES:-0}"
RUST_DRY_RUN="${DH_RUST_BOOTSTRAP_DRY_RUN:-0}"
TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t dh-upgrade)
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

platform=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)

case "$arch" in
  aarch64)
    arch="arm64"
    ;;
  x86_64)
    arch="amd64"
    ;;
esac

asset="dh-${platform}-${arch}"

case "$platform" in
  darwin|linux)
    ;;
  *)
    echo "unsupported platform: $platform (supported: darwin, linux)" >&2
    exit 1
    ;;
esac

if ! command -v curl >/dev/null 2>&1; then
  echo "upgrade dependency missing: curl is required" >&2
  exit 1
fi

if [ "$VERSION" = "latest" ]; then
  base_url="https://github.com/$REPO/releases/latest/download"
else
  base_url="https://github.com/$REPO/releases/download/$VERSION"
fi

binary_path="$TMP_DIR/$asset"
checksums_path="$TMP_DIR/SHA256SUMS"
sig_path="$TMP_DIR/$asset.sig"

echo "[dh] downloading $asset from $REPO ($VERSION)"
curl -fsSL "$base_url/$asset" -o "$binary_path"
curl -fsSL "$base_url/SHA256SUMS" -o "$checksums_path"
if curl -fsSL "$base_url/$asset.sig" -o "$sig_path"; then
  :
else
  rm -f "$sig_path"
fi

expected=$(grep "  $asset$" "$checksums_path" | cut -d' ' -f1 | tr -d '\n\r[:space:]')
if [ -z "$expected" ]; then
  echo "failed to find checksum for $asset" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$binary_path" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$binary_path" | cut -d' ' -f1)
else
  echo "missing checksum tool: need shasum or sha256sum" >&2
  exit 1
fi

if [ "$actual" != "$expected" ]; then
  echo "checksum mismatch for $asset" >&2
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 1
fi

target="$INSTALL_DIR/dh"
mkdir -p "$INSTALL_DIR"

backup=""
if [ -f "$target" ]; then
  backup="$target.backup.$(date +%s)"
  cp "$target" "$backup"
  echo "[dh] backed up existing binary to $backup"
fi

cp "$binary_path" "$target"
chmod +x "$target"
echo "[dh] installed to $target"

if "$target" --version >/dev/null 2>&1; then
  echo "upgrade verified: $($target --version)"
else
  if [ -n "$backup" ] && [ -f "$backup" ]; then
    echo "upgrade verification failed; rolling back to $backup" >&2
    mv "$backup" "$target"
    chmod +x "$target"
  fi
  exit 1
fi

echo "[dh] upgraded to $target"
echo "[dh] verify with: $target --version"

if [ -x "$SCRIPT_DIR/verify-release-artifacts.sh" ]; then
  echo "[dh] lifecycle note: artifact-level verification is available for local release dirs via scripts/verify-release-artifacts.sh"
fi

if [ "$RUST_BOOTSTRAP" = "1" ]; then
  script_url="https://raw.githubusercontent.com/$REPO/main/scripts/install-dev-tools.sh"
  toolchain_url="https://raw.githubusercontent.com/$REPO/main/rust-toolchain.toml"
  echo "[dh] Rust dev bootstrap opt-in detected (DH_INSTALL_RUST_TOOLS=1)"
  echo "[dh] downloading helper: $script_url"
  helper="$TMP_DIR/install-dev-tools.sh"
  toolchain_file="$TMP_DIR/rust-toolchain.toml"
  curl -fsSL "$script_url" -o "$helper"
  echo "[dh] downloading toolchain contract: $toolchain_url"
  curl -fsSL "$toolchain_url" -o "$toolchain_file"
  chmod +x "$helper"
  DH_INSTALL_RUST_TOOLS_YES="$RUST_ASSUME_YES" \
    DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_DRY_RUN" \
    DH_RUST_TOOLCHAIN_FILE="$toolchain_file" \
    sh "$helper" --with-rust-tools
fi
