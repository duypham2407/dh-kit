#!/usr/bin/env sh
set -eu

if [ $# -lt 1 ]; then
  echo "usage: scripts/upgrade.sh <binary-path|release-dir> [install-dir] [expected-sha256]" >&2
  exit 1
fi

INSTALL_DIR="${2:-$HOME/.local/bin}"
TARGET_PATH="$INSTALL_DIR/dh"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Run install (which handles atomic swap + backup)
"$SCRIPT_DIR/install.sh" "$@"

# Verify the upgrade works
if [ -x "$TARGET_PATH" ]; then
  if "$TARGET_PATH" --version >/dev/null 2>&1; then
    echo "upgrade verified: $("$TARGET_PATH" --version)"
  else
    # Rollback: find the most recent backup
    LATEST_BACKUP=$(ls -t "${TARGET_PATH}.backup."* 2>/dev/null | head -1 || true)
    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
      echo "upgrade verification failed; rolling back to $LATEST_BACKUP" >&2
      mv "$LATEST_BACKUP" "$TARGET_PATH"
      chmod +x "$TARGET_PATH"
      exit 1
    else
      echo "upgrade verification failed and no backup found for rollback" >&2
      exit 1
    fi
  fi
fi
