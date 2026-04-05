#!/usr/bin/env sh
set -eu

if [ $# -lt 1 ]; then
  echo "usage: scripts/resolve-release-binary.sh <release-dir> [platform] [arch]" >&2
  exit 1
fi

RELEASE_DIR="$1"
PLATFORM="${2:-}"
ARCH="${3:-}"

if [ -z "$PLATFORM" ]; then
  PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')
fi

if [ -z "$ARCH" ]; then
  ARCH=$(uname -m)
fi

case "$ARCH" in
  aarch64)
    ARCH="arm64"
    ;;
  x86_64)
    ARCH="amd64"
    ;;
esac

BIN_PATH="$RELEASE_DIR/dh-${PLATFORM}-${ARCH}"
if [ ! -f "$BIN_PATH" ]; then
  echo "release binary not found for ${PLATFORM}/${ARCH}: $BIN_PATH" >&2
  exit 1
fi

printf '%s\n' "$BIN_PATH"
