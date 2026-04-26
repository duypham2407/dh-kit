#!/usr/bin/env sh
set -eu

# Build the TypeScript worker bundle launched by the Rust host.
# Outputs:
#   dist/ts-worker/worker.mjs
#   dist/ts-worker/manifest.json
#
# Usage:
#   scripts/build-worker-bundle.sh [--out-dir dist/ts-worker] [--worker-version <version>]

REPO_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
OUT_DIR="$REPO_ROOT/dist/ts-worker"
WORKER_VERSION=""
PROTOCOL_VERSION="1"
REQUIRED_NODE_MAJOR="22"

usage() {
  printf '%s\n' "usage: scripts/build-worker-bundle.sh [--out-dir <dir>] [--worker-version <version>]" >&2
}

while [ $# -gt 0 ]; do
  case "$1" in
    --out-dir)
      if [ $# -lt 2 ]; then
        usage
        exit 1
      fi
      OUT_DIR="$2"
      shift 2
      ;;
    --worker-version)
      if [ $# -lt 2 ]; then
        usage
        exit 1
      fi
      WORKER_VERSION="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf '%s\n' "unknown argument: $1" >&2
      usage
      exit 1
      ;;
  esac
done

if [ -z "$WORKER_VERSION" ]; then
  WORKER_VERSION=$(node -e 'const fs=require("node:fs"); const path=require("node:path"); const root=process.argv[1]; const pkg=JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")); process.stdout.write(String(pkg.version ?? "dev"));' "$REPO_ROOT")
fi

mkdir -p "$OUT_DIR"

npx esbuild "$REPO_ROOT/packages/opencode-app/src/worker/worker-main.ts" \
  --bundle \
  --platform=node \
  --target=node22 \
  --format=esm \
  --outfile="$OUT_DIR/worker.mjs"

node -e '
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const [outDir, workerVersion, protocolVersion, requiredNodeMajorRaw] = process.argv.slice(1);
const workerPath = path.join(outDir, "worker.mjs");
const workerBytes = fs.readFileSync(workerPath);
const manifest = {
  workerVersion,
  protocolVersion,
  entryPath: "worker.mjs",
  checksumSha256: crypto.createHash("sha256").update(workerBytes).digest("hex"),
  requiredNodeMajor: Number(requiredNodeMajorRaw),
  supportedPlatforms: ["linux", "macos"],
};

fs.writeFileSync(path.join(outDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
' "$OUT_DIR" "$WORKER_VERSION" "$PROTOCOL_VERSION" "$REQUIRED_NODE_MAJOR"

node -e '
const fs = require("node:fs");
const path = require("node:path");
const outDir = process.argv[1];
const workerPath = path.join(outDir, "worker.mjs");
const manifestPath = path.join(outDir, "manifest.json");
process.stdout.write(`Built TypeScript worker bundle: ${workerPath} (${fs.statSync(workerPath).size} bytes)\n`);
process.stdout.write(`Built TypeScript worker manifest: ${manifestPath}\n`);
' "$OUT_DIR"
