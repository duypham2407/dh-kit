#!/usr/bin/env sh
set -eu

if [ $# -lt 1 ]; then
  echo "usage: scripts/upgrade-from-release.sh <release-dir> [install-dir]" >&2
  exit 1
fi

RELEASE_DIR="$1"
INSTALL_DIR="${2:-$HOME/.local/bin}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

BIN_PATH=$($SCRIPT_DIR/resolve-release-binary.sh "$RELEASE_DIR")
BIN_NAME=$(basename "$BIN_PATH")
SHA_FILE="$RELEASE_DIR/SHA256SUMS"
EXPECTED_SHA256=$($SCRIPT_DIR/checksum-from-sha256s.sh "$SHA_FILE" "$BIN_NAME")

$SCRIPT_DIR/upgrade.sh "$BIN_PATH" "$INSTALL_DIR" "$EXPECTED_SHA256"
