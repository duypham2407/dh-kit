#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF' >&2
usage: scripts/install-dev-tools.sh [--check-only|--with-rust-tools] [--yes] [--dry-run] [--toolchain-file <path>]

Modes:
  --check-only       detect prerequisites and print instructions only
  --with-rust-tools  opt-in Rust toolchain bootstrap (requires consent)

Flags:
  --yes              non-interactive consent for Rust toolchain bootstrap
  --dry-run          preview rustup toolchain actions without installing
  --toolchain-file   explicit rust-toolchain.toml path (for temp helper usage)

Environment:
  DH_INSTALL_RUST_TOOLS=1       same as --with-rust-tools
  DH_INSTALL_RUST_TOOLS_YES=1   same as --yes
  DH_RUST_BOOTSTRAP_DRY_RUN=1   same as --dry-run
  DH_RUST_TOOLCHAIN_FILE=...    same as --toolchain-file
EOF
}

MODE="check"
ASSUME_YES="${DH_INSTALL_RUST_TOOLS_YES:-0}"
DRY_RUN="${DH_RUST_BOOTSTRAP_DRY_RUN:-0}"
TOOLCHAIN_FILE_OVERRIDE="${DH_RUST_TOOLCHAIN_FILE:-}"

if [ "${DH_INSTALL_RUST_TOOLS:-0}" = "1" ]; then
  MODE="install"
fi

while [ $# -gt 0 ]; do
  case "$1" in
    --check-only)
      MODE="check"
      shift
      ;;
    --with-rust-tools)
      MODE="install"
      shift
      ;;
    --yes)
      ASSUME_YES=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --toolchain-file)
      if [ "$#" -lt 2 ]; then
        echo "missing value for --toolchain-file" >&2
        usage
        exit 1
      fi
      TOOLCHAIN_FILE_OVERRIDE="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
if [ -n "$TOOLCHAIN_FILE_OVERRIDE" ]; then
  RUST_TOOLCHAIN_FILE="$TOOLCHAIN_FILE_OVERRIDE"
else
  RUST_TOOLCHAIN_FILE="$REPO_ROOT/rust-toolchain.toml"
fi

log() {
  printf '[dh-dev-tools] %s\n' "$1"
}

warn() {
  printf '[dh-dev-tools] warning: %s\n' "$1" >&2
}

need() {
  if command -v "$1" >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

print_linux_hints() {
  log "Linux native build prerequisites are missing. Install them manually first."
  log "Debian/Ubuntu: sudo apt update && sudo apt install -y build-essential pkg-config ca-certificates curl"
  log "Fedora/RHEL:   sudo dnf install -y gcc gcc-c++ make pkgconf-pkg-config ca-certificates curl"
  log "Arch:           sudo pacman -S --needed base-devel pkgconf ca-certificates curl"
}

check_build_toolchain() {
  platform=$(uname -s | tr '[:upper:]' '[:lower:]')

  case "$platform" in
    darwin)
      if xcode-select -p >/dev/null 2>&1; then
        log "Xcode Command Line Tools detected"
        return 0
      else
        warn "Xcode Command Line Tools not detected"
        log "Run: xcode-select --install"
        return 1
      fi
      ;;
    linux)
      missing_tools=""
      for tool in cc c++ make; do
        if ! need "$tool"; then
          missing_tools="$missing_tools $tool"
        fi
      done
      if [ -n "$missing_tools" ]; then
        warn "Missing Linux native build tools:$missing_tools"
        print_linux_hints
        return 1
      else
        log "Linux native build toolchain detected (cc/c++/make)"
        return 0
      fi
      ;;
    *)
      warn "Unsupported OS for POSIX dev bootstrap: $platform"
      warn "Windows runtime installer is not implemented in this repository."
      warn "Use a dedicated PowerShell bootstrap path once it is added."
      return 1
      ;;
  esac
}

check_rustup_presence() {
  if need rustup; then
    log "rustup detected"
    return 0
  fi

  warn "rustup not found"
  log "Install rustup manually (consent required): https://rustup.rs"
  return 1
}

run_rustup_install() {
  if [ ! -f "$RUST_TOOLCHAIN_FILE" ]; then
    warn "Missing required toolchain contract: $RUST_TOOLCHAIN_FILE"
    return 1
  fi

  toolchain_channel=$(tr -d '"' < "$RUST_TOOLCHAIN_FILE" | grep '^channel' | cut -d'=' -f2 | tr -d '[:space:]' || true)
  if [ -z "$toolchain_channel" ]; then
    warn "Could not parse toolchain channel from $RUST_TOOLCHAIN_FILE"
    return 1
  fi

  if [ "$DRY_RUN" = "1" ]; then
    log "dry-run: would run rustup toolchain install using $RUST_TOOLCHAIN_FILE"
    log "dry-run: rustup toolchain install --profile minimal --component rustfmt --component clippy $toolchain_channel"
    return 0
  fi

  log "Installing/updating Rust toolchain from $RUST_TOOLCHAIN_FILE"
  rustup toolchain install --profile minimal --component rustfmt --component clippy "$toolchain_channel"
}

check_only() {
  log "Running prerequisite checks only (no installation)."
  if [ -f "$RUST_TOOLCHAIN_FILE" ]; then
    log "Found Rust toolchain contract: $RUST_TOOLCHAIN_FILE"
  else
    warn "Rust toolchain contract missing: $RUST_TOOLCHAIN_FILE"
  fi

  if ! check_build_toolchain; then
    log "Prerequisite check reported missing or unsupported native toolchain."
  fi
  if check_rustup_presence; then
    if need cargo; then
      log "cargo detected"
      if cargo --version >/dev/null 2>&1; then
        log "cargo version: $(cargo --version)"
      fi
    else
      warn "cargo not found (expected once rustup toolchain is installed)"
    fi
  fi

  log "No system-level packages were installed."
}

install_mode() {
  log "Rust bootstrap mode requested (opt-in)."

  if [ "$ASSUME_YES" != "1" ]; then
    warn "Refusing to install Rust toolchain without explicit consent (--yes or DH_INSTALL_RUST_TOOLS_YES=1)."
    log "Tip: run 'scripts/install-dev-tools.sh --check-only' to see prerequisites."
    exit 1
  fi

  if ! check_build_toolchain; then
    if [ "$DRY_RUN" = "1" ]; then
      warn "dry-run: system prerequisites are missing; continuing with preview only"
    else
      warn "Cannot bootstrap Rust toolchain until required system prerequisites are installed."
      exit 1
    fi
  fi

  if [ "$DRY_RUN" != "1" ]; then
    if ! check_rustup_presence; then
      warn "Cannot continue Rust toolchain bootstrap without rustup."
      exit 1
    fi
  else
    if check_rustup_presence; then
      log "dry-run: rustup is present on this host"
    else
      warn "dry-run: rustup is missing; install rustup manually before non-dry-run bootstrap"
    fi
  fi

  run_rustup_install

  if need cargo; then
    log "cargo ready: $(cargo --version 2>/dev/null || echo 'unknown version')"
  fi
}

case "$MODE" in
  check)
    check_only
    ;;
  install)
    install_mode
    ;;
  *)
    warn "unknown mode: $MODE"
    exit 1
    ;;
esac
