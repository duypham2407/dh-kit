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
SUPPRESS_LIFECYCLE_SUMMARY="${DH_SUPPRESS_LIFECYCLE_SUMMARY:-0}"
RESULT_FILE="${DH_LIFECYCLE_RESULT_FILE:-}"
INSTALL_RESULT_FILE=$(mktemp 2>/dev/null || mktemp -t dh-upgrade-install-result)

cleanup() {
  rm -f "$INSTALL_RESULT_FILE"
}

trap cleanup EXIT INT TERM

print_summary() {
  if [ "$SUPPRESS_LIFECYCLE_SUMMARY" = "1" ]; then
    return
  fi
  echo "$1"
}

write_result() {
  condition="$1"
  rollback_result="$2"
  rollback_note="$3"
  backup_path="$4"
  target_mutated="$5"
  install_failure_stage="$6"

  if [ -z "$RESULT_FILE" ]; then
    return
  fi

  {
    printf 'surface=%s\n' 'lifecycle upgrade (upgrade.sh direct-binary)'
    printf 'condition=%s\n' "$condition"
    printf 'rollback_result=%s\n' "$rollback_result"
    printf 'rollback_note=%s\n' "$rollback_note"
    printf 'backup_path=%s\n' "$backup_path"
    printf 'target_path=%s\n' "$TARGET_PATH"
    printf 'target_preexisted=%s\n' "$TARGET_PREEXISTED"
    printf 'backup_created=%s\n' "$BACKUP_CREATED"
    printf 'target_mutated=%s\n' "$target_mutated"
    printf 'install_failure_stage=%s\n' "$install_failure_stage"
  } > "$RESULT_FILE"
}

read_install_result_value() {
  key="$1"
  default_value="$2"

  if [ ! -f "$INSTALL_RESULT_FILE" ]; then
    printf '%s\n' "$default_value"
    return
  fi

  value=$(awk -F= -v key="$key" '$1 == key { print substr($0, index($0, "=") + 1); found=1 } END { if (!found) exit 1 }' "$INSTALL_RESULT_FILE" 2>/dev/null || true)
  if [ -n "$value" ]; then
    printf '%s\n' "$value"
  else
    printf '%s\n' "$default_value"
  fi
}

count_backups() {
  target="$1"
  count=0
  for file in "${target}.backup."*; do
    if [ -f "$file" ]; then
      count=$((count + 1))
    fi
  done
  printf '%s\n' "$count"
}

latest_backup_for_target() {
  target="$1"
  latest=""
  for file in "${target}.backup."*; do
    if [ -f "$file" ]; then
      latest="$file"
    fi
  done
  printf '%s\n' "$latest"
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

INSTALL_DIR="${2:-$HOME/.local/bin}"
TARGET_PATH="$INSTALL_DIR/dh"

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

TARGET_PREEXISTED=0
if [ -f "$TARGET_PATH" ]; then
  TARGET_PREEXISTED=1
fi

BACKUPS_BEFORE=$(count_backups "$TARGET_PATH")
BACKUP_CREATED=0
LATEST_BACKUP=""

# Run install (which handles atomic swap + backup)
if ! DH_INSTALL_RUST_TOOLS="$WITH_RUST_TOOLS" \
  DH_CHECK_DEV_PREREQS="$CHECK_DEV_PREREQS" \
  DH_INSTALL_RUST_TOOLS_YES="$RUST_TOOLS_ASSUME_YES" \
  DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_TOOLS_DRY_RUN" \
  DH_SUPPRESS_LIFECYCLE_SUMMARY=1 \
  DH_LIFECYCLE_RESULT_FILE="$INSTALL_RESULT_FILE" \
  sh "$SCRIPT_DIR/install.sh" "$@"
then
  INSTALL_FAILURE_STAGE=$(read_install_result_value "failure_stage" "unknown")
  INSTALL_TARGET_MUTATED=$(read_install_result_value "target_mutated" "0")
  INSTALL_BACKUP_CREATED=$(read_install_result_value "backup_created" "0")
  INSTALL_BACKUP_PATH=$(read_install_result_value "backup_path" "")

  if [ "$INSTALL_TARGET_MUTATED" = "1" ]; then
    if [ "$INSTALL_BACKUP_CREATED" = "1" ] && [ -n "$INSTALL_BACKUP_PATH" ]; then
      ROLLBACK_CONTEXT="backup exists at $INSTALL_BACKUP_PATH, but rollback was not attempted during install-stage failure"
    elif [ "$TARGET_PREEXISTED" = "1" ]; then
      ROLLBACK_CONTEXT="target preexisted but no backup evidence was captured for rollback"
    else
      ROLLBACK_CONTEXT="no previous binary existed at target path, so rollback backup was unavailable"
    fi

    print_summary "[dh] surface: lifecycle upgrade (upgrade.sh direct-binary)"
    print_summary "[dh] condition: failed"
    print_summary "[dh] why: install stage failed after binary replacement/mutation (failure_stage=$INSTALL_FAILURE_STAGE); post-install upgrade verification (--version) did not run; $ROLLBACK_CONTEXT"
    print_summary "[dh] works: upgrade mutation occurred at $TARGET_PATH, but upgrade cannot be reported as completed"
    print_summary "[dh] limited: direct-binary upgrade path may have skipped checksum/signature metadata; release manifest/file-size verification is not performed in direct-binary upgrade paths; supported direct-binary upgrade targets are Linux and macOS; Windows is not a current target platform"
    if [ "$INSTALL_BACKUP_CREATED" = "1" ] && [ -n "$INSTALL_BACKUP_PATH" ]; then
      print_summary "[dh] next: restore '$INSTALL_BACKUP_PATH' manually if needed, then run '$TARGET_PATH --version', '$TARGET_PATH --help', and '$TARGET_PATH status'"
    else
      print_summary "[dh] next: install a known-good binary (prefer release-directory path) and verify with '$TARGET_PATH --version', '$TARGET_PATH --help', and '$TARGET_PATH status'"
    fi

    write_result "failed" "unavailable" "install stage failed after target mutation (failure_stage=$INSTALL_FAILURE_STAGE); rollback not attempted by install stage" "$INSTALL_BACKUP_PATH" "$INSTALL_TARGET_MUTATED" "$INSTALL_FAILURE_STAGE"
  else
    print_summary "[dh] surface: lifecycle upgrade (upgrade.sh direct-binary)"
    print_summary "[dh] condition: blocked"
    print_summary "[dh] why: install stage failed before target replacement (failure_stage=$INSTALL_FAILURE_STAGE)"
    print_summary "[dh] works: existing target remains unchanged when install stage fails before replacement"
    print_summary "[dh] limited: direct-binary upgrade path may have skipped checksum/signature metadata; inspect preceding error output"
    print_summary "[dh] next: fix the install-stage failure and retry upgrade"
    write_result "blocked" "unavailable" "install stage failed before target mutation (failure_stage=$INSTALL_FAILURE_STAGE)" "" "$INSTALL_TARGET_MUTATED" "$INSTALL_FAILURE_STAGE"
  fi

  exit 1
fi

INSTALL_TARGET_PREEXISTED=$(read_install_result_value "target_preexisted" "$TARGET_PREEXISTED")
INSTALL_BACKUP_CREATED=$(read_install_result_value "backup_created" "$BACKUP_CREATED")
INSTALL_BACKUP_PATH=$(read_install_result_value "backup_path" "")

BACKUPS_AFTER=$(count_backups "$TARGET_PATH")
BACKUP_CREATED=0
if [ "$BACKUPS_AFTER" -gt "$BACKUPS_BEFORE" ]; then
  BACKUP_CREATED=1
fi
LATEST_BACKUP=$(latest_backup_for_target "$TARGET_PATH")

if [ "$BACKUP_CREATED" -eq 0 ] && [ "$INSTALL_BACKUP_CREATED" = "1" ]; then
  BACKUP_CREATED=1
fi

if [ -z "$LATEST_BACKUP" ] && [ -n "$INSTALL_BACKUP_PATH" ]; then
  LATEST_BACKUP="$INSTALL_BACKUP_PATH"
fi

if [ "$INSTALL_TARGET_PREEXISTED" = "1" ]; then
  TARGET_PREEXISTED=1
fi

# Verify the upgrade works
if [ -x "$TARGET_PATH" ]; then
  if "$TARGET_PATH" --version >/dev/null 2>&1; then
    if [ "$TARGET_PREEXISTED" -eq 1 ] && [ "$BACKUP_CREATED" -eq 1 ] && [ -n "$LATEST_BACKUP" ]; then
      BACKUP_NOTE="backup protection created at $LATEST_BACKUP"
    elif [ "$TARGET_PREEXISTED" -eq 1 ]; then
      BACKUP_NOTE="target existed before upgrade, but backup evidence was not detected"
    else
      BACKUP_NOTE="no previous binary existed at target path, so rollback backup protection was not applicable"
    fi

    print_summary "[dh] surface: lifecycle upgrade (upgrade.sh direct-binary)"
    print_summary "[dh] condition: completed"
    print_summary "[dh] why: binary replaced at $TARGET_PATH, post-install verification (--version) passed, $BACKUP_NOTE"
    print_summary "[dh] works: upgraded dh binary is active at $TARGET_PATH"
    print_summary "[dh] limited: release manifest/file-size verification is not performed in direct-binary upgrade paths; runtime/workspace readiness should be checked with '$TARGET_PATH --help' and '$TARGET_PATH status'; supported direct-binary upgrade targets are Linux and macOS; Windows is not a current target platform"
    print_summary "[dh] next: run '$TARGET_PATH --version', '$TARGET_PATH --help', then '$TARGET_PATH status'"
    write_result "completed" "not_needed" "post-install verification passed; rollback not required" "$LATEST_BACKUP" "1" "none"
  else
    ROLLBACK_RESULT="unavailable"
    ROLLBACK_NOTE="post-install verification failed and no backup was available"

    if [ -n "$LATEST_BACKUP" ] && [ -f "$LATEST_BACKUP" ]; then
      if mv "$LATEST_BACKUP" "$TARGET_PATH" && chmod +x "$TARGET_PATH"; then
        ROLLBACK_RESULT="succeeded"
        ROLLBACK_NOTE="post-install verification failed; rollback succeeded via $LATEST_BACKUP"
      else
        ROLLBACK_RESULT="failed"
        ROLLBACK_NOTE="post-install verification failed; rollback attempt failed for $LATEST_BACKUP"
      fi
    fi

    print_summary "[dh] surface: lifecycle upgrade (upgrade.sh direct-binary)"
    print_summary "[dh] condition: failed"
    print_summary "[dh] why: binary replacement completed but post-install verification (--version) failed; rollback=$ROLLBACK_RESULT ($ROLLBACK_NOTE)"

    if [ "$ROLLBACK_RESULT" = "succeeded" ]; then
      print_summary "[dh] works: previous dh binary was restored at $TARGET_PATH"
      print_summary "[dh] limited: upgrade failed and was rolled back; direct-binary path remains manifest-unverified; supported direct-binary upgrade targets are Linux and macOS; Windows is not a current target platform"
      print_summary "[dh] next: inspect release artifact trust path and retry via install-from-release/upgrade-from-release when available"
    elif [ "$ROLLBACK_RESULT" = "failed" ]; then
      print_summary "[dh] works: rollback did not complete; target binary state requires manual inspection"
      print_summary "[dh] limited: upgrade failed and rollback failed; direct-binary path remains manifest-unverified; supported direct-binary upgrade targets are Linux and macOS; Windows is not a current target platform"
      print_summary "[dh] next: restore a known-good binary manually, then run '$TARGET_PATH --version', '$TARGET_PATH --help', and '$TARGET_PATH status'"
    else
      print_summary "[dh] works: no rollback could run because no backup existed for this target"
      print_summary "[dh] limited: upgrade failed without rollback protection (fresh target or missing backup); direct-binary path remains manifest-unverified; supported direct-binary upgrade targets are Linux and macOS; Windows is not a current target platform"
      print_summary "[dh] next: install a known-good binary and run '$TARGET_PATH --version', '$TARGET_PATH --help', and '$TARGET_PATH status'"
    fi

    write_result "failed" "$ROLLBACK_RESULT" "$ROLLBACK_NOTE" "$LATEST_BACKUP" "1" "post_install_verification"

    exit 1
  fi
else
  print_summary "[dh] surface: lifecycle upgrade (upgrade.sh direct-binary)"
  print_summary "[dh] condition: failed"
  print_summary "[dh] why: install stage completed but target binary is not executable at $TARGET_PATH"
  print_summary "[dh] works: upgrade result is not trustworthy without executable target verification"
  print_summary "[dh] limited: direct-binary path does not provide release manifest/file-size verification; supported direct-binary upgrade targets are Linux and macOS; Windows is not a current target platform"
  print_summary "[dh] next: reinstall a known-good binary and verify with '$TARGET_PATH --version'"
  write_result "failed" "unavailable" "target binary not executable after install stage" "$LATEST_BACKUP" "1" "post_install_verification"
  exit 1
fi
