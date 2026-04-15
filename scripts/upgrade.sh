#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF' >&2
usage: scripts/upgrade.sh [options] <binary-path|release-dir> [install-dir] [expected-sha256]

options:
  --with-rust-tools          opt-in: run Rust dev bootstrap after binary upgrade
  --check-dev-prereqs        run dev prerequisite checks after binary upgrade
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

INSTALL_DIR="${2:-$HOME/.local/bin}"
TARGET_PATH="$INSTALL_DIR/dh"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# Run install (which handles atomic swap + backup)
DH_INSTALL_RUST_TOOLS="$WITH_RUST_TOOLS" \
  DH_CHECK_DEV_PREREQS="$CHECK_DEV_PREREQS" \
  DH_INSTALL_RUST_TOOLS_YES="$RUST_TOOLS_ASSUME_YES" \
  DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_TOOLS_DRY_RUN" \
  sh "$SCRIPT_DIR/install.sh" "$@"

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
