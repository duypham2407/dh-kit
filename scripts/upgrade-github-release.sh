#!/usr/bin/env sh
set -eu

REPO="${DH_GITHUB_REPO:-duypham2407/dh-kit}"
VERSION="${1:-latest}"
INSTALL_DIR="${2:-$HOME/.local/bin}"
RUST_BOOTSTRAP="${DH_INSTALL_RUST_TOOLS:-0}"
RUST_ASSUME_YES="${DH_INSTALL_RUST_TOOLS_YES:-0}"
RUST_DRY_RUN="${DH_RUST_BOOTSTRAP_DRY_RUN:-0}"
BASE_URL_OVERRIDE="${DH_RELEASE_BASE_URL:-}"
SUPPRESS_LIFECYCLE_SUMMARY="${DH_SUPPRESS_LIFECYCLE_SUMMARY:-0}"
TMP_DIR=$(mktemp -d 2>/dev/null || mktemp -d -t dh-upgrade)
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

print_summary() {
  if [ "$SUPPRESS_LIFECYCLE_SUMMARY" = "1" ]; then
    return
  fi
  echo "$1"
}

CHECKSUM_STATUS="not_verified"
CHECKSUM_REASON="checksum verification did not run"
SIGNATURE_STATUS="absent"
SIGNATURE_REASON="signature sidecar not fetched"
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

append_limited "manifest/file-size verification is not performed in GitHub release upgrade path"
append_limited "supported release upgrade targets are Linux and macOS; Windows is not a current target platform"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT INT TERM

platform=$(uname -s | tr '[:upper:]' '[:lower:]')
arch=$(uname -m)

case "$arch" in
  aarch64)
    arch="arm64"
    ;;
  x86_64)
    arch="amd64"
    ;;
esac

asset="dh-${platform}-${arch}"

case "$platform" in
  darwin|linux)
    ;;
  *)
    echo "unsupported platform: $platform (supported: darwin, linux)" >&2
    exit 1
    ;;
esac

if [ "$platform" = "darwin" ] && [ "$arch" = "amd64" ]; then
  append_limited "macOS amd64 runtime distribution is bounded to current release artifacts"
fi
if [ "$platform" = "linux" ] && [ "$arch" = "arm64" ]; then
  append_limited "Linux arm64 runtime distribution is bounded to current release artifacts"
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "upgrade dependency missing: curl is required" >&2
  exit 1
fi

if [ "$VERSION" = "latest" ]; then
  if [ -n "$BASE_URL_OVERRIDE" ]; then
    base_url="$BASE_URL_OVERRIDE/latest/download"
  else
    base_url="https://github.com/$REPO/releases/latest/download"
  fi
else
  if [ -n "$BASE_URL_OVERRIDE" ]; then
    base_url="$BASE_URL_OVERRIDE/download/$VERSION"
  else
    base_url="https://github.com/$REPO/releases/download/$VERSION"
  fi
fi

binary_path="$TMP_DIR/$asset"
checksums_path="$TMP_DIR/SHA256SUMS"
sig_path="$TMP_DIR/$asset.sig"
worker_path="$TMP_DIR/worker.mjs"
worker_manifest_path="$TMP_DIR/worker-manifest.json"

echo "[dh] downloading $asset from $REPO ($VERSION)"
curl -fsSL "$base_url/$asset" -o "$binary_path"
curl -fsSL "$base_url/SHA256SUMS" -o "$checksums_path"
curl -fsSL "$base_url/worker.mjs" -o "$worker_path"
curl -fsSL "$base_url/worker-manifest.json" -o "$worker_manifest_path"
if curl -fsSL "$base_url/$asset.sig" -o "$sig_path"; then
  SIGNATURE_STATUS="downloaded_not_verified"
  SIGNATURE_REASON="signature sidecar was downloaded but this path does not verify signatures"
  append_limited "signature sidecar was downloaded but not verified"
else
  rm -f "$sig_path"
  SIGNATURE_STATUS="absent"
  SIGNATURE_REASON="signature sidecar was not available from release download endpoint"
  append_limited "signature verification was not performed (no downloadable signature sidecar)"
fi

expected=$(grep "  $asset$" "$checksums_path" | cut -d' ' -f1 | tr -d '\n\r[:space:]')
if [ -z "$expected" ]; then
  echo "failed to find checksum for $asset" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$binary_path" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$binary_path" | cut -d' ' -f1)
else
  echo "missing checksum tool: need shasum or sha256sum" >&2
  exit 1
fi

if [ "$actual" != "$expected" ]; then
  echo "checksum mismatch for $asset" >&2
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 1
fi

expected_worker=$(grep "  ts-worker/worker.mjs$" "$checksums_path" | cut -d' ' -f1 | tr -d '\n\r[:space:]')
if [ -z "$expected_worker" ]; then
  echo "failed to find checksum for ts-worker/worker.mjs" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  worker_actual=$(shasum -a 256 "$worker_path" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
  worker_actual=$(sha256sum "$worker_path" | cut -d' ' -f1)
else
  echo "missing checksum tool: need shasum or sha256sum" >&2
  exit 1
fi
if [ "$worker_actual" != "$expected_worker" ]; then
  echo "checksum mismatch for ts-worker/worker.mjs" >&2
  echo "expected: $expected_worker" >&2
  echo "actual:   $worker_actual" >&2
  exit 1
fi

expected_worker_manifest=$(grep "  worker-manifest.json$" "$checksums_path" | cut -d' ' -f1 | tr -d '\n\r[:space:]')
if [ -z "$expected_worker_manifest" ]; then
  echo "failed to find checksum for worker-manifest.json" >&2
  exit 1
fi

if command -v shasum >/dev/null 2>&1; then
  worker_manifest_actual=$(shasum -a 256 "$worker_manifest_path" | cut -d' ' -f1)
elif command -v sha256sum >/dev/null 2>&1; then
  worker_manifest_actual=$(sha256sum "$worker_manifest_path" | cut -d' ' -f1)
else
  echo "missing checksum tool: need shasum or sha256sum" >&2
  exit 1
fi
if [ "$worker_manifest_actual" != "$expected_worker_manifest" ]; then
  echo "checksum mismatch for worker-manifest.json" >&2
  echo "expected: $expected_worker_manifest" >&2
  echo "actual:   $worker_manifest_actual" >&2
  exit 1
fi

node -e '
const fs = require("node:fs");
const crypto = require("node:crypto");
const [workerPath, manifestPath] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
if (manifest.entryPath !== "worker.mjs") throw new Error("worker manifest entryPath must be worker.mjs");
if (manifest.protocolVersion !== "1") throw new Error("worker manifest protocolVersion must be 1");
if (manifest.requiredNodeMajor !== 22) throw new Error("worker manifest requiredNodeMajor must be 22");
if (!Array.isArray(manifest.supportedPlatforms) || !manifest.supportedPlatforms.includes("linux") || !manifest.supportedPlatforms.includes("macos") || manifest.supportedPlatforms.includes("windows")) {
  throw new Error("worker manifest must preserve Linux/macOS only platform truth");
}
const checksum = crypto.createHash("sha256").update(fs.readFileSync(workerPath)).digest("hex");
if (manifest.checksumSha256 !== checksum) throw new Error("worker manifest checksumSha256 mismatch");
' "$worker_path" "$worker_manifest_path"
CHECKSUM_STATUS="verified_sha256s"
CHECKSUM_REASON="downloaded binary and Rust-hosted worker bundle checksums matched SHA256SUMS entries"

target="$INSTALL_DIR/dh"
mkdir -p "$INSTALL_DIR"

backup=""
if [ -f "$target" ]; then
  backup="$target.backup.$(date +%s)"
  cp "$target" "$backup"
  print_summary "[dh] backed up existing binary to $backup"
fi

cp "$binary_path" "$target"
chmod +x "$target"
mkdir -p "$INSTALL_DIR/ts-worker"
cp "$worker_path" "$INSTALL_DIR/ts-worker/worker.mjs"
cp "$worker_manifest_path" "$INSTALL_DIR/ts-worker/manifest.json"

if "$target" --version >/dev/null 2>&1; then
  if [ -n "$backup" ]; then
    BACKUP_NOTE="backup protection created at $backup"
  else
    BACKUP_NOTE="no previous binary existed at target path, so rollback backup protection was not applicable"
  fi

  append_limited "runtime/workspace readiness is not verified by upgrade lifecycle; run 'dh doctor'"
  print_summary "[dh] surface: lifecycle upgrade (upgrade-github-release)"
  print_summary "[dh] condition: completed"
  print_summary "[dh] why: downloaded GitHub asset $asset and verified checksum (status=$CHECKSUM_STATUS: $CHECKSUM_REASON); signature=$SIGNATURE_STATUS ($SIGNATURE_REASON); upgraded binary at $target; $BACKUP_NOTE"
  print_summary "[dh] works: upgraded dh binary is active at $target; Rust-hosted TypeScript worker bundle is installed at $INSTALL_DIR/ts-worker/worker.mjs"
  print_summary "[dh] limited: $LIMITED"
  print_summary "[dh] next: run '$target --version' then '$target doctor' (or 'dh doctor')"
else
  ROLLBACK_RESULT="unavailable"
  ROLLBACK_NOTE="post-upgrade verification failed and no backup was available"

  if [ -n "$backup" ] && [ -f "$backup" ]; then
    if mv "$backup" "$target" && chmod +x "$target"; then
      ROLLBACK_RESULT="succeeded"
      ROLLBACK_NOTE="post-upgrade verification failed; rollback succeeded via $backup"
    else
      ROLLBACK_RESULT="failed"
      ROLLBACK_NOTE="post-upgrade verification failed; rollback attempt failed for $backup"
    fi
  fi

  append_limited "runtime/workspace readiness is not verified by upgrade lifecycle; run 'dh doctor'"
  print_summary "[dh] surface: lifecycle upgrade (upgrade-github-release)"
  print_summary "[dh] condition: failed"
  print_summary "[dh] why: binary replacement completed but post-upgrade verification (--version) failed; rollback=$ROLLBACK_RESULT ($ROLLBACK_NOTE)"

  if [ "$ROLLBACK_RESULT" = "succeeded" ]; then
    print_summary "[dh] works: previous binary was restored at $target"
    print_summary "[dh] limited: $LIMITED"
    print_summary "[dh] next: inspect release integrity and retry upgrade or use local release-directory upgrade for stronger verification"
  elif [ "$ROLLBACK_RESULT" = "failed" ]; then
    print_summary "[dh] works: rollback failed and target state requires manual repair"
    print_summary "[dh] limited: $LIMITED"
    print_summary "[dh] next: restore a known-good binary manually, then run '$target --version' and '$target doctor'"
  else
    print_summary "[dh] works: no rollback could run because no prior backup existed"
    print_summary "[dh] limited: $LIMITED"
    print_summary "[dh] next: install a known-good binary and verify with '$target --version' and '$target doctor'"
  fi

  exit 1
fi

if [ -x "$SCRIPT_DIR/verify-release-artifacts.sh" ]; then
  print_summary "[dh] lifecycle note: stronger release-directory verification (manifest+checksum+size) is available via scripts/upgrade-from-release.sh"
fi

if [ "$RUST_BOOTSTRAP" = "1" ]; then
  script_url="https://raw.githubusercontent.com/$REPO/main/scripts/install-dev-tools.sh"
  toolchain_url="https://raw.githubusercontent.com/$REPO/main/rust-toolchain.toml"
  echo "[dh] Rust dev bootstrap opt-in detected (DH_INSTALL_RUST_TOOLS=1)"
  echo "[dh] downloading helper: $script_url"
  helper="$TMP_DIR/install-dev-tools.sh"
  toolchain_file="$TMP_DIR/rust-toolchain.toml"
  curl -fsSL "$script_url" -o "$helper"
  echo "[dh] downloading toolchain contract: $toolchain_url"
  curl -fsSL "$toolchain_url" -o "$toolchain_file"
  chmod +x "$helper"
  DH_INSTALL_RUST_TOOLS_YES="$RUST_ASSUME_YES" \
    DH_RUST_BOOTSTRAP_DRY_RUN="$RUST_DRY_RUN" \
    DH_RUST_TOOLCHAIN_FILE="$toolchain_file" \
    sh "$helper" --with-rust-tools
fi
