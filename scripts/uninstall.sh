#!/usr/bin/env sh
set -eu

INSTALL_DIR="${1:-$HOME/.local/bin}"
TARGET_PATH="$INSTALL_DIR/dh"

if [ -f "$TARGET_PATH" ]; then
  rm "$TARGET_PATH"
  echo "removed $TARGET_PATH"
else
  echo "dh not found at $TARGET_PATH"
fi
