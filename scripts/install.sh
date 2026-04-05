#!/usr/bin/env sh
set -eu

if [ $# -lt 1 ]; then
  echo "usage: scripts/install.sh <binary-path|release-dir> [install-dir] [expected-sha256]" >&2
  exit 1
fi

BINARY_INPUT="$1"
INSTALL_DIR="${2:-$HOME/.local/bin}"
EXPECTED_SHA256="${3:-}"
TARGET_PATH="$INSTALL_DIR/dh"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ -d "$BINARY_INPUT" ]; then
  BINARY_PATH=$($SCRIPT_DIR/resolve-release-binary.sh "$BINARY_INPUT")
else
  BINARY_PATH="$BINARY_INPUT"
fi

if [ ! -f "$BINARY_PATH" ]; then
  echo "binary not found: $BINARY_PATH" >&2
  exit 1
fi

# Verify checksum from explicit argument
if [ -n "$EXPECTED_SHA256" ]; then
  checksum_line=$(shasum -a 256 "$BINARY_PATH")
  set -- $checksum_line
  ACTUAL_SHA256="$1"
  if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "checksum mismatch for $BINARY_PATH" >&2
    echo "expected: $EXPECTED_SHA256" >&2
    echo "actual:   $ACTUAL_SHA256" >&2
    exit 1
  fi
fi

# Verify checksum from sidecar .sha256 file
if [ -f "$BINARY_PATH.sha256" ] && [ -z "$EXPECTED_SHA256" ]; then
  EXPECTED_SHA256=$(tr -d '\n\r[:space:]' < "$BINARY_PATH.sha256")
  checksum_line=$(shasum -a 256 "$BINARY_PATH")
  set -- $checksum_line
  ACTUAL_SHA256="$1"
  if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "checksum mismatch for $BINARY_PATH (from sidecar)" >&2
    echo "expected: $EXPECTED_SHA256" >&2
    echo "actual:   $ACTUAL_SHA256" >&2
    exit 1
  fi
fi

# Verify GPG signature if present
if [ -f "$BINARY_PATH.sig" ]; then
  if command -v gpg >/dev/null 2>&1; then
    if gpg --verify "$BINARY_PATH.sig" "$BINARY_PATH" 2>/dev/null; then
      echo "GPG signature verified for $(basename "$BINARY_PATH")"
    else
      echo "GPG signature verification FAILED for $(basename "$BINARY_PATH")" >&2
      exit 1
    fi
  else
    echo "warning: gpg not found; skipping signature verification" >&2
  fi
fi

mkdir -p "$INSTALL_DIR"

# Atomic swap: write to temp file then move (rename is atomic on same filesystem)
if [ -f "$TARGET_PATH" ]; then
  # Backup existing binary
  BACKUP_PATH="${TARGET_PATH}.backup.$(date +%s)"
  cp "$TARGET_PATH" "$BACKUP_PATH"
  echo "backed up existing dh to $BACKUP_PATH"
fi

TEMP_PATH="${TARGET_PATH}.tmp.$$"
cp "$BINARY_PATH" "$TEMP_PATH"
chmod +x "$TEMP_PATH"

# Atomic rename
mv "$TEMP_PATH" "$TARGET_PATH"

echo "installed dh to $TARGET_PATH"
