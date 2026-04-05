#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
RELEASE_DIR="${1:-$REPO_ROOT/dist/releases}"

"$SCRIPT_DIR/verify-release-artifacts.sh" "$RELEASE_DIR"
BIN_PATH=$($SCRIPT_DIR/resolve-release-binary.sh "$RELEASE_DIR")

echo "[smoke] using binary: $BIN_PATH"
echo "[smoke] running deterministic hook smoke"
"$BIN_PATH" --run-smoke

if [ -n "${OPENAI_API_KEY:-}" ]; then
  echo "[smoke] OPENAI_API_KEY detected; running provider-backed --run smoke"
  "$BIN_PATH" --run "Return exactly: DH_STAGING_SMOKE_OK"
else
  echo "[smoke] OPENAI_API_KEY not set; skipping provider-backed --run smoke"
fi

echo "[smoke] completed"
