#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF' >&2
usage: scripts/install-from-release.sh [options] <release-dir> [install-dir]

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

RELEASE_DIR="$1"
INSTALL_DIR="${2:-$HOME/.local/bin}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [ ! -d "$RELEASE_DIR" ]; then
  echo "release directory not found: $RELEASE_DIR" >&2
  exit 1
fi

if [ ! -f "$RELEASE_DIR/SHA256SUMS" ]; then
  echo "release readiness failed: missing SHA256SUMS in $RELEASE_DIR" >&2
  exit 1
fi

if [ ! -f "$RELEASE_DIR/manifest.json" ]; then
  echo "release readiness failed: missing manifest.json in $RELEASE_DIR" >&2
  exit 1
fi

if [ -x "$SCRIPT_DIR/verify-release-artifacts.sh" ]; then
  "$SCRIPT_DIR/verify-release-artifacts.sh" "$RELEASE_DIR"
fi

BIN_PATH=$($SCRIPT_DIR/resolve-release-binary.sh "$RELEASE_DIR")
BIN_NAME=$(basename "$BIN_PATH")
SHA_FILE="$RELEASE_DIR/SHA256SUMS"
EXPECTED_SHA256=$($SCRIPT_DIR/checksum-from-sha256s.sh "$SHA_FILE" "$BIN_NAME")

DH_INSTALL_RUST_TOOLS="$WITH_RUST_TOOLS" \
  DH_CHECK_DEV_PREREQS="$CHECK_DEV_PREREQS" \
  DH_INSTALL_RUST_TOOLS_YES="$RUST_TOOLS_ASSUME_YES" \
  DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_TOOLS_DRY_RUN" \
  sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR" "$EXPECTED_SHA256"

echo "[dh] surface: lifecycle install (install-from-release)"
echo "[dh] condition: completed"
echo "[dh] why: release artifacts verified and binary installed to $INSTALL_DIR/dh"
echo "[dh] works: dh binary is installed and executable at $INSTALL_DIR/dh"
echo "[dh] limited: none detected by this lifecycle command; run doctor for workspace/runtime health"
echo "[dh] next: run '$INSTALL_DIR/dh doctor' (or 'dh doctor')"
