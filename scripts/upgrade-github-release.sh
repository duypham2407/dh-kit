#!/usr/bin/env sh
set -eu

REPO="${DH_GITHUB_REPO:-duypham2407/dh-kit}"
VERSION="${1:-latest}"
INSTALL_DIR="${2:-$HOME/.local/bin}"
TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t dh-upgrade)

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
    echo "unsupported platform: $platform" >&2
    exit 1
    ;;
esac

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

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
"$SCRIPT_DIR/upgrade.sh" "$binary_path" "$INSTALL_DIR" "$expected"

target="$INSTALL_DIR/dh"
echo "[dh] upgraded to $target"
echo "[dh] verify with: $target --version"
