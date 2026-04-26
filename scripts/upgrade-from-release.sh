#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF' >&2
usage: scripts/upgrade-from-release.sh [options] <release-dir> [install-dir]

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

RELEASE_DIR="$1"
INSTALL_DIR="${2:-$HOME/.local/bin}"
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
VERIFY_SCRIPT="$SCRIPT_DIR/verify-release-artifacts.sh"
UPGRADE_RESULT_FILE=$(mktemp 2>/dev/null || mktemp -t dh-upgrade-from-release-result)

cleanup() {
  rm -f "$UPGRADE_RESULT_FILE"
}
trap cleanup EXIT INT TERM

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
  echo "[dh] surface: lifecycle upgrade (upgrade-from-release)"
  echo "[dh] condition: blocked"
  echo "[dh] why: required release verifier is unavailable at $VERIFY_SCRIPT"
  echo "[dh] works: no binary upgrade was attempted"
  echo "[dh] limited: release-directory trust cannot be established without the verifier"
  echo "[dh] next: restore scripts/verify-release-artifacts.sh and rerun upgrade"
  exit 1
fi

if ! VERIFICATION_JSON=$("$VERIFY_SCRIPT" --json "$RELEASE_DIR"); then
  echo "[dh] surface: lifecycle upgrade (upgrade-from-release)"
  echo "[dh] condition: blocked"
  echo "[dh] why: release artifact verification failed before upgrade mutation"
  echo "[dh] works: existing installation remains unchanged"
  echo "[dh] limited: release directory was not trusted; inspect verifier output for missing metadata or drift"
  echo "[dh] next: repair the release bundle then rerun upgrade-from-release"
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
  DH_LIFECYCLE_RESULT_FILE="$UPGRADE_RESULT_FILE" \
  sh "$SCRIPT_DIR/upgrade.sh" "$BIN_PATH" "$INSTALL_DIR" "$EXPECTED_SHA256" || {
    ROLLBACK_RESULT="unknown"
    ROLLBACK_NOTE="upgrade failed before release-wrapper completion"
    if [ -f "$UPGRADE_RESULT_FILE" ]; then
      ROLLBACK_RESULT=$(node -e 'const fs=require("node:fs");const f=process.argv[1];const map={};for(const line of fs.readFileSync(f,"utf8").split(/\r?\n/)){if(!line) continue;const idx=line.indexOf("=");if(idx===-1) continue;map[line.slice(0,idx)]=line.slice(idx+1);}process.stdout.write(String(map.rollback_result ?? "unknown"));' "$UPGRADE_RESULT_FILE")
      ROLLBACK_NOTE=$(node -e 'const fs=require("node:fs");const f=process.argv[1];const map={};for(const line of fs.readFileSync(f,"utf8").split(/\r?\n/)){if(!line) continue;const idx=line.indexOf("=");if(idx===-1) continue;map[line.slice(0,idx)]=line.slice(idx+1);}process.stdout.write(String(map.rollback_note ?? "upgrade failed before release-wrapper completion"));' "$UPGRADE_RESULT_FILE")
    fi

    echo "[dh] surface: lifecycle upgrade (upgrade-from-release)"
    echo "[dh] condition: failed"
    echo "[dh] why: release metadata was verified, but upgrade mutation failed; rollback=$ROLLBACK_RESULT ($ROLLBACK_NOTE)"
    echo "[dh] works: release-directory verification completed; upgrade result is not marked completed"
    echo "[dh] limited: runtime/workspace readiness remains unknown after failed upgrade"
    echo "[dh] next: inspect upgrade.sh error output, ensure rollback state is healthy, then retry upgrade-from-release"
    exit 1
  }

mkdir -p "$INSTALL_DIR/ts-worker"
cp "$RELEASE_DIR/ts-worker/worker.mjs" "$INSTALL_DIR/ts-worker/worker.mjs"
cp "$RELEASE_DIR/ts-worker/manifest.json" "$INSTALL_DIR/ts-worker/manifest.json"

ROLLBACK_RESULT="not_needed"
ROLLBACK_NOTE="post-upgrade verification passed; rollback not required"
if [ -f "$UPGRADE_RESULT_FILE" ]; then
  ROLLBACK_RESULT=$(node -e 'const fs=require("node:fs");const f=process.argv[1];const map={};for(const line of fs.readFileSync(f,"utf8").split(/\r?\n/)){if(!line) continue;const idx=line.indexOf("=");if(idx===-1) continue;map[line.slice(0,idx)]=line.slice(idx+1);}process.stdout.write(String(map.rollback_result ?? "not_needed"));' "$UPGRADE_RESULT_FILE")
  ROLLBACK_NOTE=$(node -e 'const fs=require("node:fs");const f=process.argv[1];const map={};for(const line of fs.readFileSync(f,"utf8").split(/\r?\n/)){if(!line) continue;const idx=line.indexOf("=");if(idx===-1) continue;map[line.slice(0,idx)]=line.slice(idx+1);}process.stdout.write(String(map.rollback_note ?? "post-upgrade verification passed; rollback not required"));' "$UPGRADE_RESULT_FILE")
fi

UPGRADE_LIMITED="runtime/workspace readiness is not verified by upgrade lifecycle; run 'dh doctor'"
if [ -n "$VERIFICATION_LIMITATIONS" ]; then
  UPGRADE_LIMITED="$VERIFICATION_LIMITATIONS; $UPGRADE_LIMITED"
fi
UPGRADE_LIMITED="$UPGRADE_LIMITED; supported release upgrade targets are Linux and macOS; Windows is not a current target platform"

echo "[dh] surface: lifecycle upgrade (upgrade-from-release)"
echo "[dh] condition: completed"
echo "[dh] why: release artifacts verified at tier=$VERIFICATION_TIER (signature=$SIGNATURE_STATUS: $SIGNATURE_REASON), binary upgraded at $INSTALL_DIR/dh, rollback=$ROLLBACK_RESULT ($ROLLBACK_NOTE)"
echo "[dh] works: dh binary is upgraded and rollback safety already checked by upgrade flow; Rust-hosted TypeScript worker bundle is installed at $INSTALL_DIR/ts-worker/worker.mjs"
echo "[dh] limited: $UPGRADE_LIMITED"
echo "[dh] next: run '$INSTALL_DIR/dh --version' then '$INSTALL_DIR/dh doctor'"
