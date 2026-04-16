#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF' >&2
usage: scripts/install.sh [options] <binary-path|release-dir> [install-dir] [expected-sha256]

options:
  --with-rust-tools          opt-in: run Rust dev bootstrap after binary install
  --check-dev-prereqs        run dev prerequisite checks after binary install
  --yes                      non-interactive consent for --with-rust-tools
  --dry-run-rust-bootstrap   preview Rust bootstrap without changing toolchains
EOF
}

WITH_RUST_TOOLS="${DH_INSTALL_RUST_TOOLS:-0}"
CHECK_DEV_PREREQS="${DH_CHECK_DEV_PREREQS:-0}"
RUST_TOOLS_ASSUME_YES="${DH_INSTALL_RUST_TOOLS_YES:-0}"
RUST_TOOLS_DRY_RUN="${DH_RUST_BOOTSTRAP_DRY_RUN:-0}"

while [ $# -gt 0 ]; do
  case "$1" in
    --with-rust-tools)
      WITH_RUST_TOOLS=1
      shift
      ;;
    --check-dev-prereqs)
      CHECK_DEV_PREREQS=1
      shift
      ;;
    --yes)
      RUST_TOOLS_ASSUME_YES=1
      shift
      ;;
    --dry-run-rust-bootstrap)
      RUST_TOOLS_DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -*)
      echo "unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      break
      ;;
  esac
done

if [ $# -lt 1 ]; then
  usage
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
  if [ "${SKIP_GPG_VERIFY:-0}" = "1" ]; then
    echo "warning: SKIP_GPG_VERIFY=1; skipping signature verification"
  elif command -v gpg >/dev/null 2>&1; then
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

if [ "$WITH_RUST_TOOLS" = "1" ] || [ "$CHECK_DEV_PREREQS" = "1" ]; then
  DEV_TOOLS_SCRIPT="$SCRIPT_DIR/install-dev-tools.sh"
  if [ ! -f "$DEV_TOOLS_SCRIPT" ]; then
    echo "Rust dev bootstrap script not found: $DEV_TOOLS_SCRIPT" >&2
    exit 1
  fi

  echo "[dh] optional Rust development bootstrap requested"
  if [ "$WITH_RUST_TOOLS" = "1" ]; then
    DH_INSTALL_RUST_TOOLS_YES="$RUST_TOOLS_ASSUME_YES" \
      DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_TOOLS_DRY_RUN" \
      sh "$DEV_TOOLS_SCRIPT" --with-rust-tools
  else
    sh "$DEV_TOOLS_SCRIPT" --check-only
  fi
fi
