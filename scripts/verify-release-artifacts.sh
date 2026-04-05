#!/usr/bin/env sh
set -eu

RELEASE_DIR="${1:-dist/releases}"
SHA_FILE="$RELEASE_DIR/SHA256SUMS"
MANIFEST_FILE="$RELEASE_DIR/manifest.json"

if [ ! -d "$RELEASE_DIR" ]; then
  echo "release directory not found: $RELEASE_DIR" >&2
  exit 1
fi

if [ ! -f "$SHA_FILE" ]; then
  echo "missing SHA256SUMS: $SHA_FILE" >&2
  exit 1
fi

if [ ! -f "$MANIFEST_FILE" ]; then
  echo "missing manifest.json: $MANIFEST_FILE" >&2
  exit 1
fi

found=0
for file in "$RELEASE_DIR"/dh-*; do
  if [ -f "$file" ]; then
    found=1
    break
  fi
done

if [ "$found" -ne 1 ]; then
  echo "no release binaries found in $RELEASE_DIR" >&2
  exit 1
fi

while IFS= read -r line; do
  [ -z "$line" ] && continue

  set -- $line
  expected="$1"
  name="$2"
  file="$RELEASE_DIR/$name"

  if [ ! -f "$file" ]; then
    echo "binary listed in SHA256SUMS is missing: $name" >&2
    exit 1
  fi

  actual_line=$(shasum -a 256 "$file")
  set -- $actual_line
  actual="$1"

  if [ "$actual" != "$expected" ]; then
    echo "checksum mismatch for $name" >&2
    echo "expected: $expected" >&2
    echo "actual:   $actual" >&2
    exit 1
  fi
done < "$SHA_FILE"

node -e '
const fs = require("node:fs");
const path = require("node:path");

const releaseDir = process.argv[1];
const shaFile = path.join(releaseDir, "SHA256SUMS");
const manifestFile = path.join(releaseDir, "manifest.json");

const shaMap = new Map();
for (const raw of fs.readFileSync(shaFile, "utf8").split(/\r?\n/)) {
  const line = raw.trim();
  if (!line) continue;
  const [sha, name] = line.split(/\s+/);
  shaMap.set(name, sha);
}

const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
if (!manifest || !Array.isArray(manifest.files)) {
  throw new Error("manifest.json has invalid shape: expected files[]");
}

for (const entry of manifest.files) {
  if (!entry || typeof entry.name !== "string" || typeof entry.sha256 !== "string" || typeof entry.sizeBytes !== "number") {
    throw new Error("manifest entry has invalid shape");
  }

  const expectedSha = shaMap.get(entry.name);
  if (!expectedSha) {
    throw new Error(`manifest entry not present in SHA256SUMS: ${entry.name}`);
  }
  if (expectedSha !== entry.sha256) {
    throw new Error(`manifest checksum mismatch for ${entry.name}`);
  }

  const filePath = path.join(releaseDir, entry.name);
  if (!fs.existsSync(filePath)) {
    throw new Error(`manifest references missing file: ${entry.name}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size !== entry.sizeBytes) {
    throw new Error(`manifest size mismatch for ${entry.name}: expected ${entry.sizeBytes}, got ${stat.size}`);
  }
}

for (const name of shaMap.keys()) {
  const inManifest = manifest.files.some((entry) => entry.name === name);
  if (!inManifest) {
    throw new Error(`SHA256SUMS entry missing from manifest: ${name}`);
  }
}
' "$RELEASE_DIR"

# Verify GPG signatures if present
sig_found=0
for file in "$RELEASE_DIR"/dh-*.sig; do
  if [ -f "$file" ]; then
    sig_found=1
    break
  fi
done

if [ "$sig_found" -eq 1 ]; then
  if command -v gpg >/dev/null 2>&1; then
    for sigfile in "$RELEASE_DIR"/dh-*.sig; do
      if [ ! -f "$sigfile" ]; then
        continue
      fi
      target="${sigfile%.sig}"
      if [ ! -f "$target" ]; then
        echo "signature exists but target missing: $(basename "$sigfile")" >&2
        exit 1
      fi
      if ! gpg --verify "$sigfile" "$target" 2>/dev/null; then
        echo "GPG signature verification FAILED: $(basename "$target")" >&2
        exit 1
      fi
      echo "GPG signature verified: $(basename "$target")"
    done

    sha_sig="$RELEASE_DIR/SHA256SUMS.sig"
    if [ -f "$sha_sig" ]; then
      if ! gpg --verify "$sha_sig" "$SHA_FILE" 2>/dev/null; then
        echo "GPG signature verification FAILED: SHA256SUMS" >&2
        exit 1
      fi
      echo "GPG signature verified: SHA256SUMS"
    fi
  else
    echo "warning: gpg not found; skipping signature verification"
  fi
fi

echo "release artifacts verified: $RELEASE_DIR"
