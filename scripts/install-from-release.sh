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
VERIFY_SCRIPT="$SCRIPT_DIR/verify-release-artifacts.sh"

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

if [ ! -x "$VERIFY_SCRIPT" ]; then
  echo "[dh] surface: lifecycle install (install-from-release)"
  echo "[dh] condition: blocked"
  echo "[dh] why: required release verifier is unavailable at $VERIFY_SCRIPT"
  echo "[dh] works: no binary install was attempted"
  echo "[dh] limited: release-directory trust cannot be established without the verifier"
  echo "[dh] next: restore scripts/verify-release-artifacts.sh and rerun install"
  exit 1
fi

if ! VERIFICATION_JSON=$("$VERIFY_SCRIPT" --json "$RELEASE_DIR"); then
  echo "[dh] surface: lifecycle install (install-from-release)"
  echo "[dh] condition: blocked"
  echo "[dh] why: release artifact verification failed before install mutation"
  echo "[dh] works: no install change was reported as completed"
  echo "[dh] limited: release directory was not trusted; inspect verifier output for missing metadata or drift"
  echo "[dh] next: repair the release bundle then rerun install-from-release"
  exit 1
fi

VERIFICATION_TIER=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.verificationTier ?? "release-directory-verified"));' "$VERIFICATION_JSON")
SIGNATURE_STATUS=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.signature?.status ?? "absent"));' "$VERIFICATION_JSON")
SIGNATURE_REASON=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.signature?.reason ?? "no signature artifacts found in release bundle"));' "$VERIFICATION_JSON")
VERIFICATION_LIMITATIONS=$(node -e 'const d=JSON.parse(process.argv[1]); const limits=Array.isArray(d.limitations)?d.limitations:[]; process.stdout.write(limits.join("; "));' "$VERIFICATION_JSON")

BIN_PATH=$($SCRIPT_DIR/resolve-release-binary.sh "$RELEASE_DIR")
BIN_NAME=$(basename "$BIN_PATH")
SHA_FILE="$RELEASE_DIR/SHA256SUMS"
EXPECTED_SHA256=$($SCRIPT_DIR/checksum-from-sha256s.sh "$SHA_FILE" "$BIN_NAME")

DH_INSTALL_RUST_TOOLS="$WITH_RUST_TOOLS" \
  DH_CHECK_DEV_PREREQS="$CHECK_DEV_PREREQS" \
  DH_INSTALL_RUST_TOOLS_YES="$RUST_TOOLS_ASSUME_YES" \
  DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_TOOLS_DRY_RUN" \
  DH_SUPPRESS_LIFECYCLE_SUMMARY=1 \
  sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR" "$EXPECTED_SHA256" || {
    echo "[dh] surface: lifecycle install (install-from-release)"
    echo "[dh] condition: failed"
    echo "[dh] why: release metadata was verified, but install mutation failed before lifecycle completion"
    echo "[dh] works: release-directory verification completed; install result is not marked completed"
    echo "[dh] limited: install step failed after verification; runtime/workspace readiness remains unknown"
    echo "[dh] next: inspect install.sh error output, fix host-path/permission issue, and retry install-from-release"
    exit 1
  }

INSTALL_LIMITED="runtime/workspace readiness is not verified by install lifecycle; run 'dh doctor'"
if [ -n "$VERIFICATION_LIMITATIONS" ]; then
  INSTALL_LIMITED="$VERIFICATION_LIMITATIONS; $INSTALL_LIMITED"
fi
INSTALL_LIMITED="$INSTALL_LIMITED; Windows runtime installer parity remains unsupported"

echo "[dh] surface: lifecycle install (install-from-release)"
echo "[dh] condition: completed"
echo "[dh] why: release artifacts verified at tier=$VERIFICATION_TIER (signature=$SIGNATURE_STATUS: $SIGNATURE_REASON) and binary installed to $INSTALL_DIR/dh"
echo "[dh] works: dh binary is installed and executable at $INSTALL_DIR/dh"
echo "[dh] limited: $INSTALL_LIMITED"
echo "[dh] next: run '$INSTALL_DIR/dh doctor' (or 'dh doctor')"
