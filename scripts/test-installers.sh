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

echo "=== Test: Fresh install ==="
INSTALL_DIR=$(mktemp_dir)
$SCRIPT_DIR/install.sh "$BIN_PATH" "$INSTALL_DIR"
if [ -x "$INSTALL_DIR/dh" ]; then
  pass "binary installed and executable"
else
  fail "binary not found or not executable"
fi

echo "=== Test: Upgrade creates backup ==="
INSTALL_DIR2=$(mktemp_dir)
# First install
$SCRIPT_DIR/install.sh "$BIN_PATH" "$INSTALL_DIR2"
# Upgrade (triggers backup)
$SCRIPT_DIR/install.sh "$BIN_PATH" "$INSTALL_DIR2"
backup_count=$(ls "$INSTALL_DIR2"/dh.backup.* 2>/dev/null | wc -l | tr -d ' ')
if [ "$backup_count" -ge 1 ]; then
  pass "backup created on upgrade ($backup_count backups)"
else
  fail "no backup created on upgrade"
fi

echo "=== Test: Checksum verification (correct) ==="
INSTALL_DIR3=$(mktemp_dir)
EXPECTED=$($SCRIPT_DIR/checksum-from-sha256s.sh "$SHA_FILE" "$BIN_NAME")
if $SCRIPT_DIR/install.sh "$BIN_PATH" "$INSTALL_DIR3" "$EXPECTED" >/dev/null 2>&1; then
  pass "correct checksum accepted"
else
  fail "correct checksum was rejected"
fi

echo "=== Test: Checksum verification (incorrect) ==="
INSTALL_DIR4=$(mktemp_dir)
BAD_SHA="0000000000000000000000000000000000000000000000000000000000000000"
if $SCRIPT_DIR/install.sh "$BIN_PATH" "$INSTALL_DIR4" "$BAD_SHA" >/dev/null 2>&1; then
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
if $SCRIPT_DIR/install.sh "$STAGING/dh-test" "$INSTALL_DIR5" >/dev/null 2>&1; then
  pass "sidecar .sha256 verification passed"
else
  fail "sidecar .sha256 verification failed"
fi

echo "=== Test: Sidecar .sha256 mismatch ==="
INSTALL_DIR6=$(mktemp_dir)
STAGING2=$(mktemp_dir)
cp "$BIN_PATH" "$STAGING2/dh-test"
echo "$BAD_SHA" > "$STAGING2/dh-test.sha256"
if $SCRIPT_DIR/install.sh "$STAGING2/dh-test" "$INSTALL_DIR6" >/dev/null 2>&1; then
  fail "bad sidecar .sha256 was accepted"
else
  pass "bad sidecar .sha256 correctly rejected"
fi

echo "=== Test: Install from release directory ==="
INSTALL_DIR7=$(mktemp_dir)
if $SCRIPT_DIR/install-from-release.sh "$RELEASE_DIR" "$INSTALL_DIR7" >/dev/null 2>&1; then
  if [ -x "$INSTALL_DIR7/dh" ]; then
    pass "install-from-release.sh succeeded"
  else
    fail "install-from-release.sh did not produce executable"
  fi
else
  fail "install-from-release.sh failed"
fi

echo "=== Test: Uninstall ==="
INSTALL_DIR8=$(mktemp_dir)
$SCRIPT_DIR/install.sh "$BIN_PATH" "$INSTALL_DIR8"
$SCRIPT_DIR/uninstall.sh "$INSTALL_DIR8"
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
