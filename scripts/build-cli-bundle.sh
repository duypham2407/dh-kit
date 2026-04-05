#!/usr/bin/env sh
set -eu

# Build a self-contained ESM bundle of the TypeScript CLI.
# Output: packages/opencode-core/internal/clibundle/cli-bundle.mjs
#
# Usage: scripts/build-cli-bundle.sh

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/packages/opencode-core/internal/clibundle"

mkdir -p "$OUT_DIR"

npx esbuild "$REPO_ROOT/apps/cli/src/main.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile="$OUT_DIR/cli-bundle.mjs"

echo "Built CLI bundle: $OUT_DIR/cli-bundle.mjs ($(wc -c < "$OUT_DIR/cli-bundle.mjs" | tr -d ' ') bytes)"
