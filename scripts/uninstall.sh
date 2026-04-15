#!/usr/bin/env sh
set -eu

INSTALL_DIR="${1:-$HOME/.local/bin}"
TARGET_PATH="$INSTALL_DIR/dh"

if [ ! -d "$INSTALL_DIR" ]; then
  echo "uninstall readiness: install directory not found ($INSTALL_DIR)"
  exit 0
fi

if [ -f "$TARGET_PATH" ]; then
  rm "$TARGET_PATH"
  if [ -f "$TARGET_PATH" ]; then
    echo "uninstall failed: binary still present at $TARGET_PATH" >&2
    exit 1
  fi
  echo "uninstall completed: removed $TARGET_PATH"
else
  echo "uninstall noop: dh not found at $TARGET_PATH"
fi
