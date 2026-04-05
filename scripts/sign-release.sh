#!/usr/bin/env sh
set -eu

# Sign release artifacts with GPG.
# Usage: scripts/sign-release.sh <release-dir> [gpg-key-id]
# Produces .sig files alongside each binary and signs SHA256SUMS.

if [ $# -lt 1 ]; then
  echo "usage: scripts/sign-release.sh <release-dir> [gpg-key-id]" >&2
  exit 1
fi

RELEASE_DIR="$1"
GPG_KEY_ID="${2:-}"

if ! command -v gpg >/dev/null 2>&1; then
  echo "gpg not found; cannot sign artifacts" >&2
  exit 1
fi

if [ ! -d "$RELEASE_DIR" ]; then
  echo "release directory not found: $RELEASE_DIR" >&2
  exit 1
fi

GPG_ARGS=""
if [ -n "$GPG_KEY_ID" ]; then
  GPG_ARGS="--default-key $GPG_KEY_ID"
fi

# Sign each binary
for file in "$RELEASE_DIR"/dh-*; do
  if [ -f "$file" ] && [ "${file%.sig}" = "$file" ]; then
    echo "signing $(basename "$file")"
    gpg --batch --yes $GPG_ARGS --detach-sign --output "${file}.sig" "$file"
  fi
done

# Sign SHA256SUMS
SHA_FILE="$RELEASE_DIR/SHA256SUMS"
if [ -f "$SHA_FILE" ]; then
  echo "signing SHA256SUMS"
  gpg --batch --yes $GPG_ARGS --detach-sign --output "${SHA_FILE}.sig" "$SHA_FILE"
fi

echo "signed release artifacts in $RELEASE_DIR"
