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

# Extract SHA256 for each macOS binary
SHA_ARM64=$(grep 'dh-darwin-arm64' "$SHA256_FILE" | awk '{print $1}')
SHA_AMD64=$(grep 'dh-darwin-amd64' "$SHA256_FILE" | awk '{print $1}')

if [ -z "$SHA_ARM64" ] || [ -z "$SHA_AMD64" ]; then
  echo "Could not find SHA256 for macOS binaries in $SHA256_FILE" >&2
  echo "Expected entries for dh-darwin-arm64 and dh-darwin-amd64" >&2
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

  depends_on "node@22"

  if OS.mac? && Hardware::CPU.arm?
    url "$DOWNLOAD_BASE/dh-darwin-arm64"
    sha256 "$SHA_ARM64"
  elsif OS.mac? && Hardware::CPU.intel?
    url "$DOWNLOAD_BASE/dh-darwin-amd64"
    sha256 "$SHA_AMD64"
  end

  def install
    binary_name = Dir["dh-*"].first || "dh"
    bin.install binary_name => "dh"
  end

  test do
    assert_match "dh", shell_output("#{bin}/dh --help")
  end
end
FORMULA
