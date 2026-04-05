#!/usr/bin/env sh
set -eu

if [ $# -lt 2 ]; then
  echo "usage: scripts/checksum-from-sha256s.sh <sha256s-path> <binary-name>" >&2
  exit 1
fi

SHA_FILE="$1"
BINARY_NAME="$2"

if [ ! -f "$SHA_FILE" ]; then
  echo "SHA256SUMS file not found: $SHA_FILE" >&2
  exit 1
fi

line=$(grep "  $BINARY_NAME$" "$SHA_FILE" || true)
if [ -z "$line" ]; then
  echo "checksum not found for $BINARY_NAME in $SHA_FILE" >&2
  exit 1
fi

set -- $line
printf '%s\n' "$1"
