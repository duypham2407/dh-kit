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

assert_contains() {
  haystack="$1"
  needle="$2"
  label="$3"
  if printf '%s\n' "$haystack" | grep "$needle" >/dev/null 2>&1; then
    pass "$label"
  else
    fail "$label"
  fi
}

assert_not_contains() {
  haystack="$1"
  needle="$2"
  label="$3"
  if printf '%s\n' "$haystack" | grep "$needle" >/dev/null 2>&1; then
    fail "$label"
  else
    pass "$label"
  fi
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
INSTALL_OUTPUT=$(sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$INSTALL_DIR" 2>&1)
if [ -x "$INSTALL_DIR/dh" ]; then
  pass "binary installed and executable"
else
  fail "binary not found or not executable"
fi
if [ -f "$INSTALL_DIR/ts-worker/worker.mjs" ] && [ -f "$INSTALL_DIR/ts-worker/manifest.json" ]; then
  pass "direct install copied adjacent Rust-hosted worker bundle"
else
  fail "direct install did not copy adjacent Rust-hosted worker bundle"
fi
assert_contains "$INSTALL_OUTPUT" "surface: lifecycle install (install.sh direct-binary)" "install.sh prints lifecycle surface"
assert_contains "$INSTALL_OUTPUT" "condition: completed" "install.sh reports completed condition"
assert_contains "$INSTALL_OUTPUT" "release manifest/file-size verification is not performed in direct-binary install paths" "install.sh reports bounded verification limitation"

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

echo "=== Test: upgrade.sh reports mutation on post-install bootstrap failure ==="
UPGRADE_FAIL_DIR=$(mktemp_dir)
sh "$SCRIPT_DIR/install.sh" "$BIN_PATH" "$UPGRADE_FAIL_DIR" >/dev/null 2>&1
UPGRADE_FAIL_OUTPUT=""
if UPGRADE_FAIL_OUTPUT=$(sh "$SCRIPT_DIR/upgrade.sh" --with-rust-tools "$BIN_PATH" "$UPGRADE_FAIL_DIR" 2>&1); then
  fail "upgrade.sh unexpectedly succeeded without rust bootstrap consent"
else
  pass "upgrade.sh failed when post-install rust bootstrap consent was missing"
fi
assert_contains "$UPGRADE_FAIL_OUTPUT" "condition: failed" "upgrade.sh reports failed when install mutates then optional post-install bootstrap fails"
assert_contains "$UPGRADE_FAIL_OUTPUT" "install stage failed after binary replacement/mutation" "upgrade.sh reports post-mutation install-stage failure class"
assert_contains "$UPGRADE_FAIL_OUTPUT" "upgrade mutation occurred at" "upgrade.sh reports mutation occurred for post-install failure path"
assert_not_contains "$UPGRADE_FAIL_OUTPUT" "existing target remains unchanged when install stage fails before replacement" "upgrade.sh no longer overclaims unchanged target for post-mutation failure"

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
INSTALL_FROM_RELEASE_OUTPUT=""
if INSTALL_FROM_RELEASE_OUTPUT=$(sh "$SCRIPT_DIR/install-from-release.sh" "$RELEASE_DIR" "$INSTALL_DIR7" 2>&1); then
  if [ -x "$INSTALL_DIR7/dh" ]; then
    pass "install-from-release.sh succeeded"
  else
    fail "install-from-release.sh did not produce executable"
  fi
  if [ -f "$INSTALL_DIR7/ts-worker/worker.mjs" ] && [ -f "$INSTALL_DIR7/ts-worker/manifest.json" ]; then
    pass "install-from-release.sh installed Rust-hosted worker bundle"
  else
    fail "install-from-release.sh did not install Rust-hosted worker bundle"
  fi
else
  fail "install-from-release.sh failed"
fi
assert_contains "$INSTALL_FROM_RELEASE_OUTPUT" "surface: lifecycle install (install-from-release)" "install-from-release emits lifecycle surface"
assert_contains "$INSTALL_FROM_RELEASE_OUTPUT" "condition: completed" "install-from-release reports completed"
assert_contains "$INSTALL_FROM_RELEASE_OUTPUT" "tier=release-directory-verified" "install-from-release reports strong verification tier"
assert_contains "$INSTALL_FROM_RELEASE_OUTPUT" "runtime/workspace readiness is not verified by install lifecycle" "install-from-release keeps doctor boundary explicit"

echo "=== Test: verify-release-artifacts structured output ==="
VERIFY_JSON=$(sh "$SCRIPT_DIR/verify-release-artifacts.sh" --json "$RELEASE_DIR")
VERIFY_TIER=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.verificationTier));' "$VERIFY_JSON")
VERIFY_MANIFEST=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.checks?.manifest));' "$VERIFY_JSON")
VERIFY_WORKER_MANIFEST=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.checks?.workerManifest));' "$VERIFY_JSON")
VERIFY_SIGNATURE=$(node -e 'const d=JSON.parse(process.argv[1]); process.stdout.write(String(d.signature?.status));' "$VERIFY_JSON")
if [ "$VERIFY_TIER" = "release-directory-verified" ] && [ "$VERIFY_MANIFEST" = "true" ] && [ "$VERIFY_WORKER_MANIFEST" = "true" ] && [ -n "$VERIFY_SIGNATURE" ]; then
  pass "verify-release-artifacts --json exposes structured verification facts"
else
  fail "verify-release-artifacts --json missing required verification fields"
fi

echo "=== Test: Upgrade from release directory ==="
INSTALL_DIR_UPGRADE=$(mktemp_dir)
sh "$SCRIPT_DIR/install-from-release.sh" "$RELEASE_DIR" "$INSTALL_DIR_UPGRADE" >/dev/null 2>&1
UPGRADE_FROM_RELEASE_OUTPUT=""
if UPGRADE_FROM_RELEASE_OUTPUT=$(sh "$SCRIPT_DIR/upgrade-from-release.sh" "$RELEASE_DIR" "$INSTALL_DIR_UPGRADE" 2>&1); then
  pass "upgrade-from-release.sh succeeded"
else
  fail "upgrade-from-release.sh failed"
fi
assert_contains "$UPGRADE_FROM_RELEASE_OUTPUT" "surface: lifecycle upgrade (upgrade-from-release)" "upgrade-from-release emits lifecycle surface"
assert_contains "$UPGRADE_FROM_RELEASE_OUTPUT" "condition: completed" "upgrade-from-release reports completed"
assert_contains "$UPGRADE_FROM_RELEASE_OUTPUT" "rollback=" "upgrade-from-release reports rollback outcome"
assert_contains "$UPGRADE_FROM_RELEASE_OUTPUT" "runtime/workspace readiness is not verified by upgrade lifecycle" "upgrade-from-release keeps doctor boundary explicit"

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

echo "=== Test: GitHub install fixture seam ==="
GITHUB_FIXTURE=$(mktemp_dir)
mkdir -p "$GITHUB_FIXTURE/latest/download"
cp "$BIN_PATH" "$GITHUB_FIXTURE/latest/download/$BIN_NAME"
cp "$RELEASE_DIR/worker.mjs" "$GITHUB_FIXTURE/latest/download/worker.mjs"
cp "$RELEASE_DIR/worker-manifest.json" "$GITHUB_FIXTURE/latest/download/worker-manifest.json"
(
  cd "$GITHUB_FIXTURE/latest/download"
  shasum -a 256 "$BIN_NAME" > SHA256SUMS
  worker_sha=$(shasum -a 256 worker.mjs | cut -d' ' -f1)
  printf '%s  ts-worker/worker.mjs\n' "$worker_sha" >> SHA256SUMS
  shasum -a 256 worker-manifest.json >> SHA256SUMS
)
GITHUB_INSTALL_DIR=$(mktemp_dir)
GITHUB_INSTALL_OUTPUT=""
if GITHUB_INSTALL_OUTPUT=$(DH_RELEASE_BASE_URL="file://$GITHUB_FIXTURE" sh "$SCRIPT_DIR/install-github-release.sh" latest "$GITHUB_INSTALL_DIR" 2>&1); then
  if [ -x "$GITHUB_INSTALL_DIR/dh" ]; then
    pass "install-github-release.sh succeeded with fixture seam"
  else
    fail "install-github-release.sh did not produce executable"
  fi
  if [ -f "$GITHUB_INSTALL_DIR/ts-worker/worker.mjs" ] && [ -f "$GITHUB_INSTALL_DIR/ts-worker/manifest.json" ]; then
    pass "install-github-release.sh installed Rust-hosted worker bundle"
  else
    fail "install-github-release.sh did not install Rust-hosted worker bundle"
  fi
else
  fail "install-github-release.sh failed with fixture seam"
fi
assert_contains "$GITHUB_INSTALL_OUTPUT" "surface: lifecycle install (install-github-release)" "install-github-release emits lifecycle surface"
assert_contains "$GITHUB_INSTALL_OUTPUT" "condition: completed" "install-github-release reports completed"
assert_contains "$GITHUB_INSTALL_OUTPUT" "manifest/file-size verification is not performed in GitHub release install path" "install-github-release reports bounded verification limitation"
assert_contains "$GITHUB_INSTALL_OUTPUT" "signature verification is not performed in GitHub release install path" "install-github-release reports signature limitation"
assert_contains "$GITHUB_INSTALL_OUTPUT" "supported release install targets are Linux and macOS; Windows is not a current target platform" "install-github-release reports Linux/macOS target platform boundary"

echo "=== Test: GitHub upgrade fixture seam ==="
GITHUB_UPGRADE_OUTPUT=""
if GITHUB_UPGRADE_OUTPUT=$(DH_RELEASE_BASE_URL="file://$GITHUB_FIXTURE" sh "$SCRIPT_DIR/upgrade-github-release.sh" latest "$GITHUB_INSTALL_DIR" 2>&1); then
  pass "upgrade-github-release.sh succeeded with fixture seam"
  if [ -f "$GITHUB_INSTALL_DIR/ts-worker/worker.mjs" ] && [ -f "$GITHUB_INSTALL_DIR/ts-worker/manifest.json" ]; then
    pass "upgrade-github-release.sh installed Rust-hosted worker bundle"
  else
    fail "upgrade-github-release.sh did not install Rust-hosted worker bundle"
  fi
else
  fail "upgrade-github-release.sh failed with fixture seam"
fi
assert_contains "$GITHUB_UPGRADE_OUTPUT" "surface: lifecycle upgrade (upgrade-github-release)" "upgrade-github-release emits lifecycle surface"
assert_contains "$GITHUB_UPGRADE_OUTPUT" "condition: completed" "upgrade-github-release reports completed"
assert_contains "$GITHUB_UPGRADE_OUTPUT" "manifest/file-size verification is not performed in GitHub release upgrade path" "upgrade-github-release reports bounded verification limitation"
assert_contains "$GITHUB_UPGRADE_OUTPUT" "supported release upgrade targets are Linux and macOS; Windows is not a current target platform" "upgrade-github-release reports Linux/macOS target platform boundary"

echo "=== Test: GitHub install rejects checksum drift ==="
GITHUB_BAD_FIXTURE=$(mktemp_dir)
mkdir -p "$GITHUB_BAD_FIXTURE/latest/download"
cp "$BIN_PATH" "$GITHUB_BAD_FIXTURE/latest/download/$BIN_NAME"
cp "$RELEASE_DIR/worker.mjs" "$GITHUB_BAD_FIXTURE/latest/download/worker.mjs"
cp "$RELEASE_DIR/worker-manifest.json" "$GITHUB_BAD_FIXTURE/latest/download/worker-manifest.json"
printf '0000000000000000000000000000000000000000000000000000000000000000  %s\n' "$BIN_NAME" > "$GITHUB_BAD_FIXTURE/latest/download/SHA256SUMS"
(
  cd "$GITHUB_BAD_FIXTURE/latest/download"
  worker_sha=$(shasum -a 256 worker.mjs | cut -d' ' -f1)
  printf '%s  ts-worker/worker.mjs\n' "$worker_sha" >> SHA256SUMS
  shasum -a 256 worker-manifest.json >> SHA256SUMS
)
if DH_RELEASE_BASE_URL="file://$GITHUB_BAD_FIXTURE" sh "$SCRIPT_DIR/install-github-release.sh" latest "$(mktemp_dir)" >/dev/null 2>&1; then
  fail "install-github-release.sh accepted checksum drift"
else
  pass "install-github-release.sh rejected checksum drift"
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
UNINSTALL_OUTPUT=$(sh "$SCRIPT_DIR/uninstall.sh" "$INSTALL_DIR8" 2>&1)
if [ ! -f "$INSTALL_DIR8/dh" ]; then
  pass "uninstall removed binary"
else
  fail "uninstall did not remove binary"
fi
assert_contains "$UNINSTALL_OUTPUT" "condition: completed" "uninstall reports completed when deletion occurs"

echo "=== Test: Uninstall noop ==="
UNINSTALL_NOOP_OUTPUT=$(sh "$SCRIPT_DIR/uninstall.sh" "$INSTALL_DIR8" 2>&1)
assert_contains "$UNINSTALL_NOOP_OUTPUT" "condition: noop" "uninstall reports noop when target is absent"

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
