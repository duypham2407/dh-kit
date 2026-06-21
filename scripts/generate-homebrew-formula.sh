#!/usr/bin/env sh
# Generate a Homebrew formula from release artifacts.
#
# Usage:
#   scripts/generate-homebrew-formula.sh <release-dir> [version]
#
# <release-dir> must contain SHA256SUMS with entries for dh-darwin-arm64 and dh-darwin-amd64.
# [version] defaults to the "version" field in manifest.json if present, otherwise "0.1.0".
#
# Outputs the formula to stdout. Redirect to a file:
#   scripts/generate-homebrew-formula.sh dist/releases 0.1.0 > Formula/dh.rb
set -eu

RELEASE_DIR="${1:?Usage: generate-homebrew-formula.sh <release-dir> [version]}"
SHA256_FILE="$RELEASE_DIR/SHA256SUMS"

if [ ! -f "$SHA256_FILE" ]; then
  echo "SHA256SUMS not found in $RELEASE_DIR" >&2
  exit 1
fi

# Determine version: explicit arg > manifest.json > fallback
if [ -n "${2:-}" ]; then
  VERSION="$2"
elif [ -f "$RELEASE_DIR/manifest.json" ]; then
  # Extract version from manifest.json without jq dependency
  VERSION=$(sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$RELEASE_DIR/manifest.json" | head -1)
  if [ -z "$VERSION" ]; then
    VERSION="0.1.0"
  fi
else
  VERSION="0.1.0"
fi

# Extract SHA256 for each macOS tarball. The formula installs the self-contained
# per-platform tarball (binary + ts-worker/ bundle), not the bare binary — the Rust host
# resolves worker.mjs relative to the `dh` binary, so the worker must ship alongside it.
SHA_ARM64=$(awk '$2 == "dh-darwin-arm64.tar.gz" {print $1}' "$SHA256_FILE")
SHA_AMD64=$(awk '$2 == "dh-darwin-amd64.tar.gz" {print $1}' "$SHA256_FILE")

if [ -z "$SHA_ARM64" ] || [ -z "$SHA_AMD64" ]; then
  echo "Could not find SHA256 for macOS tarballs in $SHA256_FILE" >&2
  echo "Expected entries for dh-darwin-arm64.tar.gz and dh-darwin-amd64.tar.gz" >&2
  echo "(run scripts/package-release.sh to produce per-platform tarballs)" >&2
  exit 1
fi

REPO_URL="https://github.com/duypham2407/dh-kit"
DOWNLOAD_BASE="$REPO_URL/releases/download/v$VERSION"

cat <<FORMULA
class Dh < Formula
  desc "Local-first AI coding assistant for macOS and Linux"
  homepage "$REPO_URL"
  version "$VERSION"
  license "MIT"

  # The Rust host spawns a bare \`node\` resolved from PATH and requires Node major >= 22.
  # Use the unversioned, keg-linked node (on PATH); versioned node@NN formulae are keg-only
  # and would not be visible to the host's PATH lookup.
  depends_on "node"

  if OS.mac? && Hardware::CPU.arm?
    url "$DOWNLOAD_BASE/dh-darwin-arm64.tar.gz"
    sha256 "$SHA_ARM64"
  elsif OS.mac? && Hardware::CPU.intel?
    url "$DOWNLOAD_BASE/dh-darwin-amd64.tar.gz"
    sha256 "$SHA_AMD64"
  end

  def install
    # Tarball contains: dh, ts-worker/worker.mjs, ts-worker/manifest.json.
    # Install the worker bundle as a sibling of the binary so current_exe()-relative
    # resolution finds #{bin}/ts-worker/worker.mjs at runtime.
    bin.install "dh"
    (bin/"ts-worker").install "ts-worker/worker.mjs", "ts-worker/manifest.json"
  end

  test do
    assert_match "dh", shell_output("#{bin}/dh --help")
    assert_predicate bin/"ts-worker/worker.mjs", :exist?
    assert_predicate bin/"ts-worker/manifest.json", :exist?
  end
end
FORMULA
