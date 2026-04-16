#!/usr/bin/env sh
set -eu

# Test installer scripts in isolated temp directories.
# Usage: scripts/test-installers.sh <release-dir>

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
RELEASE_DIR="${1:-dist/releases}"
PASS=0
FAIL=0

cleanup_dirs=""
cleanup() {
  for d in $cleanup_dirs; do
    rm -rf "$d" 2>/dev/null || true
  done
}
trap cleanup EXIT

mktemp_dir() {
  d=$(mktemp -d)
  cleanup_dirs="$cleanup_dirs $d"
  printf '%s\n' "$d"
}

pass() {
  PASS=$((PASS + 1))
  echo "  PASS: $1"
}

fail() {
  FAIL=$((FAIL + 1))
  echo "  FAIL: $1" >&2
}

# Resolve binary for current platform
BIN_PATH=$($SCRIPT_DIR/resolve-release-binary.sh "$RELEASE_DIR")
BIN_NAME=$(basename "$BIN_PATH")
SHA_FILE="$RELEASE_DIR/SHA256SUMS"
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)

if [ -f "$REPO_ROOT/rust-toolchain.toml" ]; then
  RUST_TOOLCHAIN_CHANNEL=$(tr -d '"' < "$REPO_ROOT/rust-toolchain.toml" | grep '^channel' | cut -d'=' -f2 | tr -d '[:space:]' || true)
  RUST_TOOLCHAIN_HAS_RUSTFMT=0
  RUST_TOOLCHAIN_HAS_CLIPPY=0
  if grep 'rustfmt' "$REPO_ROOT/rust-toolchain.toml" >/dev/null 2>&1; then
    RUST_TOOLCHAIN_HAS_RUSTFMT=1
  fi
  if grep 'clippy' "$REPO_ROOT/rust-toolchain.toml" >/dev/null 2>&1; then
    RUST_TOOLCHAIN_HAS_CLIPPY=1
  fi
else
  RUST_TOOLCHAIN_CHANNEL=""
  RUST_TOOLCHAIN_HAS_RUSTFMT=0
  RUST_TOOLCHAIN_HAS_CLIPPY=0
fi

echo "=== Test: Fresh install ==="
INSTALL_DIR=$(mktemp_dir)
sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR"
if [ -x "$INSTALL_DIR/dh" ]; then
  pass "binary installed and executable"
else
  fail "binary not found or not executable"
fi

echo "=== Test: Upgrade creates backup ==="
INSTALL_DIR2=$(mktemp_dir)
# First install
sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR2"
# Upgrade (triggers backup)
sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR2"
backup_count=$(ls "$INSTALL_DIR2"/dh.backup.* 2>/dev/null | wc -l | tr -d ' ')
if [ "$backup_count" -ge 1 ]; then
  pass "backup created on upgrade ($backup_count backups)"
else
  fail "no backup created on upgrade"
fi

echo "=== Test: Checksum verification (correct) ==="
INSTALL_DIR3=$(mktemp_dir)
EXPECTED=$($SCRIPT_DIR/checksum-from-sha256s.sh "$SHA_FILE" "$BIN_NAME")
if sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR3" "$EXPECTED" >/dev/null 2>&1; then
  pass "correct checksum accepted"
else
  fail "correct checksum was rejected"
fi

echo "=== Test: Checksum verification (incorrect) ==="
INSTALL_DIR4=$(mktemp_dir)
BAD_SHA="0000000000000000000000000000000000000000000000000000000000000000"
if sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR4" "$BAD_SHA" >/dev/null 2>&1; then
  fail "bad checksum was accepted"
else
  pass "bad checksum correctly rejected"
fi

echo "=== Test: Sidecar .sha256 verification ==="
INSTALL_DIR5=$(mktemp_dir)
STAGING=$(mktemp_dir)
cp "$BIN_PATH" "$STAGING/dh-test"
EXPECTED=$($SCRIPT_DIR/checksum-from-sha256s.sh "$SHA_FILE" "$BIN_NAME")
echo "$EXPECTED" > "$STAGING/dh-test.sha256"
if sh "$SCRIPT_DIR/install.sh" "$STAGING/dh-test" "$INSTALL_DIR5" >/dev/null 2>&1; then
  pass "sidecar .sha256 verification passed"
else
  fail "sidecar .sha256 verification failed"
fi

echo "=== Test: Sidecar .sha256 mismatch ==="
INSTALL_DIR6=$(mktemp_dir)
STAGING2=$(mktemp_dir)
cp "$BIN_PATH" "$STAGING2/dh-test"
echo "$BAD_SHA" > "$STAGING2/dh-test.sha256"
if sh "$SCRIPT_DIR/install.sh" "$STAGING2/dh-test" "$INSTALL_DIR6" >/dev/null 2>&1; then
  fail "bad sidecar .sha256 was accepted"
else
  pass "bad sidecar .sha256 correctly rejected"
fi

echo "=== Test: Install from release directory ==="
INSTALL_DIR7=$(mktemp_dir)
if sh "$SCRIPT_DIR/install-from-release.sh" "$RELEASE_DIR" "$INSTALL_DIR7" >/dev/null 2>&1; then
  if [ -x "$INSTALL_DIR7/dh" ]; then
    pass "install-from-release.sh succeeded"
  else
    fail "install-from-release.sh did not produce executable"
  fi
else
  fail "install-from-release.sh failed"
fi

echo "=== Test: install-from-release fails without manifest ==="
BAD_RELEASE_DIR=$(mktemp_dir)
cp "$BIN_PATH" "$BAD_RELEASE_DIR/$BIN_NAME"
cp "$SHA_FILE" "$BAD_RELEASE_DIR/SHA256SUMS"
if sh "$SCRIPT_DIR/install-from-release.sh" "$BAD_RELEASE_DIR" "$(mktemp_dir)" >/dev/null 2>&1; then
  fail "install-from-release.sh accepted release dir without manifest"
else
  pass "install-from-release.sh rejected release dir without manifest"
fi

echo "=== Test: upgrade-from-release fails without manifest ==="
BAD_RELEASE_DIR2=$(mktemp_dir)
cp "$BIN_PATH" "$BAD_RELEASE_DIR2/$BIN_NAME"
cp "$SHA_FILE" "$BAD_RELEASE_DIR2/SHA256SUMS"
if sh "$SCRIPT_DIR/upgrade-from-release.sh" "$BAD_RELEASE_DIR2" "$(mktemp_dir)" >/dev/null 2>&1; then
  fail "upgrade-from-release.sh accepted release dir without manifest"
else
  pass "upgrade-from-release.sh rejected release dir without manifest"
fi

echo "=== Test: Check dev prerequisites (no Rust install default) ==="
if DH_INSTALL_RUST_TOOLS=0 DH_CHECK_DEV_PREREQS=1 \
  sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$(mktemp_dir)" >/dev/null 2>&1; then
  pass "check-dev-prereqs path completed without auto-install"
else
  fail "check-dev-prereqs path failed"
fi

echo "=== Test: install-dev-tools check-only ==="
if sh "$SCRIPT_DIR/install-dev-tools.sh" --check-only >/dev/null 2>&1; then
  pass "install-dev-tools check-only succeeded"
else
  fail "install-dev-tools check-only failed"
fi

echo "=== Test: install-dev-tools requires explicit consent ==="
if DH_INSTALL_RUST_TOOLS=1 DH_INSTALL_RUST_TOOLS_YES=0 DH_RUST_BOOTSTRAP_DRY_RUN=1 \
  sh "$SCRIPT_DIR/install-dev-tools.sh" --with-rust-tools >/dev/null 2>&1; then
  fail "install-dev-tools allowed Rust bootstrap without consent"
else
  pass "install-dev-tools blocked bootstrap without explicit consent"
fi

echo "=== Test: install-dev-tools dry-run with consent ==="
if DH_INSTALL_RUST_TOOLS=1 DH_INSTALL_RUST_TOOLS_YES=1 DH_RUST_BOOTSTRAP_DRY_RUN=1 \
  sh "$SCRIPT_DIR/install-dev-tools.sh" --with-rust-tools >/dev/null 2>&1; then
  pass "install-dev-tools dry-run succeeded with explicit consent"
else
  fail "install-dev-tools dry-run failed"
fi

echo "=== Test: GitHub-style temp helper dry-run bootstrap ==="
GITHUB_TMP=$(mktemp_dir)
cp "$SCRIPT_DIR/install-dev-tools.sh" "$GITHUB_TMP/install-dev-tools.sh"
cp "$REPO_ROOT/rust-toolchain.toml" "$GITHUB_TMP/rust-toolchain.toml"
chmod +x "$GITHUB_TMP/install-dev-tools.sh"
if DH_INSTALL_RUST_TOOLS=1 DH_INSTALL_RUST_TOOLS_YES=1 DH_RUST_BOOTSTRAP_DRY_RUN=1 \
  DH_RUST_TOOLCHAIN_FILE="$GITHUB_TMP/rust-toolchain.toml" \
  sh "$GITHUB_TMP/install-dev-tools.sh" --with-rust-tools >/dev/null 2>&1; then
  pass "temp helper dry-run succeeded with explicit toolchain path"
else
  fail "temp helper dry-run failed with explicit toolchain path"
fi

echo "=== Test: rust-toolchain contract exists ==="
if [ -f "$REPO_ROOT/rust-toolchain.toml" ]; then
  pass "rust-toolchain.toml is present"
else
  fail "rust-toolchain.toml missing"
fi

echo "=== Test: rust-toolchain contract content ==="
if [ "$RUST_TOOLCHAIN_CHANNEL" = "1.94.1" ] && [ "$RUST_TOOLCHAIN_HAS_RUSTFMT" = "1" ] && [ "$RUST_TOOLCHAIN_HAS_CLIPPY" = "1" ]; then
  pass "rust-toolchain.toml pins channel and required components"
else
  fail "rust-toolchain.toml content mismatch (channel/components)"
fi

echo "=== Test: Uninstall ==="
INSTALL_DIR8=$(mktemp_dir)
sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR8"
sh "$SCRIPT_DIR/uninstall.sh" "$INSTALL_DIR8"
if [ ! -f "$INSTALL_DIR8/dh" ]; then
  pass "uninstall removed binary"
else
  fail "uninstall did not remove binary"
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
