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
SUPPRESS_LIFECYCLE_SUMMARY="${DH_SUPPRESS_LIFECYCLE_SUMMARY:-0}"
RESULT_FILE="${DH_LIFECYCLE_RESULT_FILE:-}"

LIMITED=""
append_limited() {
  if [ -z "$1" ]; then
    return
  fi
  if [ -z "$LIMITED" ]; then
    LIMITED="$1"
  else
    LIMITED="$LIMITED; $1"
  fi
}

print_info() {
  if [ "$SUPPRESS_LIFECYCLE_SUMMARY" != "1" ]; then
    echo "$1"
  fi
}

write_result() {
  condition="$1"
  failure_stage="$2"

  if [ -z "$RESULT_FILE" ]; then
    return
  fi

  {
    printf 'surface=%s\n' 'lifecycle install (install.sh direct-binary)'
    printf 'condition=%s\n' "$condition"
    printf 'failure_stage=%s\n' "$failure_stage"
    printf 'target_path=%s\n' "$TARGET_PATH"
    printf 'target_preexisted=%s\n' "$TARGET_PREEXISTED"
    printf 'backup_created=%s\n' "$BACKUP_CREATED"
    printf 'backup_path=%s\n' "$BACKUP_PATH"
    printf 'target_mutated=%s\n' "$TARGET_MUTATED"
    printf 'checksum_status=%s\n' "$CHECKSUM_STATUS"
    printf 'signature_status=%s\n' "$SIGNATURE_STATUS"
  } > "$RESULT_FILE"
}

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

CHECKSUM_STATUS="not_provided"
CHECKSUM_REASON="no checksum was provided for this direct-binary install path"
SIGNATURE_STATUS="absent"
SIGNATURE_REASON="no signature sidecar was present for this direct-binary install path"
EXISTING_TARGET=0
TARGET_PREEXISTED=0
BACKUP_CREATED=0
TARGET_MUTATED=0
BACKUP_PATH=""

append_limited "release manifest/file-size verification is not performed in direct-binary install paths"

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
  CHECKSUM_STATUS="verified_explicit"
  CHECKSUM_REASON="checksum matched the explicit sha256 argument"
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
  CHECKSUM_STATUS="verified_sidecar"
  CHECKSUM_REASON="checksum matched sidecar .sha256 metadata"
elif [ -z "$EXPECTED_SHA256" ]; then
  append_limited "checksum verification was not performed (no explicit sha256 or sidecar .sha256 provided)"
fi

# Verify GPG signature if present
if [ -f "$BINARY_PATH.sig" ]; then
  if [ "${SKIP_GPG_VERIFY:-0}" = "1" ]; then
    SIGNATURE_STATUS="skipped"
    SIGNATURE_REASON="signature sidecar is present but verification was skipped via SKIP_GPG_VERIFY=1"
    append_limited "signature sidecar was present but verification was explicitly skipped"
    echo "warning: SKIP_GPG_VERIFY=1; skipping signature verification" >&2
  elif command -v gpg >/dev/null 2>&1; then
    if gpg --verify "$BINARY_PATH.sig" "$BINARY_PATH" 2>/dev/null; then
      SIGNATURE_STATUS="verified"
      SIGNATURE_REASON="signature sidecar is present and gpg verification passed"
      print_info "GPG signature verified for $(basename "$BINARY_PATH")"
    else
      echo "GPG signature verification FAILED for $(basename "$BINARY_PATH")" >&2
      exit 1
    fi
  else
    SIGNATURE_STATUS="unavailable"
    SIGNATURE_REASON="signature sidecar is present but gpg is unavailable on this host"
    append_limited "signature sidecar was present but gpg was unavailable"
    echo "warning: gpg not found; skipping signature verification" >&2
  fi
else
  append_limited "signature verification was not performed (no .sig sidecar provided)"
fi

mkdir -p "$INSTALL_DIR"

# Atomic swap: write to temp file then move (rename is atomic on same filesystem)
if [ -f "$TARGET_PATH" ]; then
  EXISTING_TARGET=1
  TARGET_PREEXISTED=1
  # Backup existing binary
  BACKUP_PATH="${TARGET_PATH}.backup.$(date +%s)"
  cp "$TARGET_PATH" "$BACKUP_PATH"
  BACKUP_CREATED=1
  print_info "backed up existing dh to $BACKUP_PATH"
fi

TEMP_PATH="${TARGET_PATH}.tmp.$$"
cp "$BINARY_PATH" "$TEMP_PATH"
chmod +x "$TEMP_PATH"

# Atomic rename
mv "$TEMP_PATH" "$TARGET_PATH"
TARGET_MUTATED=1

print_info "installed dh to $TARGET_PATH"

if [ "$WITH_RUST_TOOLS" = "1" ] || [ "$CHECK_DEV_PREREQS" = "1" ]; then
  DEV_TOOLS_SCRIPT="$SCRIPT_DIR/install-dev-tools.sh"
  if [ ! -f "$DEV_TOOLS_SCRIPT" ]; then
    write_result "failed" "post_install"
    echo "Rust dev bootstrap script not found: $DEV_TOOLS_SCRIPT" >&2
    exit 1
  fi

  print_info "[dh] optional Rust development bootstrap requested"
  if [ "$WITH_RUST_TOOLS" = "1" ]; then
    if ! DH_INSTALL_RUST_TOOLS_YES="$RUST_TOOLS_ASSUME_YES" \
      DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_TOOLS_DRY_RUN" \
      sh "$DEV_TOOLS_SCRIPT" --with-rust-tools
    then
      write_result "failed" "post_install"
      echo "Rust dev bootstrap failed after binary install mutation" >&2
      exit 1
    fi
  else
    if ! sh "$DEV_TOOLS_SCRIPT" --check-only; then
      write_result "failed" "post_install"
      echo "Rust dev prerequisite checks failed after binary install mutation" >&2
      exit 1
    fi
  fi
fi

append_limited "runtime/workspace readiness is not verified by install lifecycle; run 'dh doctor'"
append_limited "Windows runtime installer parity remains unsupported"

if [ "$SUPPRESS_LIFECYCLE_SUMMARY" != "1" ]; then
  if [ "$EXISTING_TARGET" -eq 1 ]; then
    REPLACEMENT_NOTE="replaced an existing binary and created backup at $BACKUP_PATH"
  else
    REPLACEMENT_NOTE="performed a fresh install on an empty target path"
  fi

  if [ -z "$LIMITED" ]; then
    LIMITED="runtime/workspace readiness is not verified by install lifecycle; run 'dh doctor'"
  fi

  echo "[dh] surface: lifecycle install (install.sh direct-binary)"
  echo "[dh] condition: completed"
  echo "[dh] why: installed binary at $TARGET_PATH; checksum=$CHECKSUM_STATUS ($CHECKSUM_REASON); signature=$SIGNATURE_STATUS ($SIGNATURE_REASON); $REPLACEMENT_NOTE"
  echo "[dh] works: dh binary is installed and executable at $TARGET_PATH"
  echo "[dh] limited: $LIMITED"
  echo "[dh] next: run '$TARGET_PATH --version' then '$TARGET_PATH doctor' (or 'dh doctor')"
fi

write_result "completed" "none"
