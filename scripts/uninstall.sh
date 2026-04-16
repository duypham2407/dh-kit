#!/usr/bin/env sh
set -eu

INSTALL_DIR="${1:-$HOME/.local/bin}"
TARGET_PATH="$INSTALL_DIR/dh"

if [ ! -d "$INSTALL_DIR" ]; then
  echo "surface: lifecycle uninstall"
  echo "condition: noop"
  echo "why: install directory not found ($INSTALL_DIR)"
  echo "works: current environment unchanged"
  echo "limited: dh may still exist in another install directory on PATH"
  echo "next: run 'which dh' to confirm active binary path"
  exit 0
fi

if [ -f "$TARGET_PATH" ]; then
  rm "$TARGET_PATH"
  if [ -f "$TARGET_PATH" ]; then
    echo "uninstall failed: binary still present at $TARGET_PATH" >&2
    exit 1
  fi
  echo "surface: lifecycle uninstall"
  echo "condition: completed"
  echo "why: removed binary at $TARGET_PATH"
  echo "works: uninstall from target path succeeded"
  echo "limited: shell hash/PATH caching may still reference old location until shell refresh"
  echo "next: run 'which dh' and start a new shell if needed"
else
  echo "surface: lifecycle uninstall"
  echo "condition: noop"
  echo "why: dh not found at $TARGET_PATH"
  echo "works: no deletion needed at the requested install directory"
  echo "limited: dh may still exist in another install directory on PATH"
  echo "next: run 'which dh' to locate any remaining installation"
fi
