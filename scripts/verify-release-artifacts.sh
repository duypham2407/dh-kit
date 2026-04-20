#!/usr/bin/env sh
set -eu

usage() {
  cat <<'EOF' >&2
usage: scripts/verify-release-artifacts.sh [--json] [release-dir]

options:
  --json      emit structured verification result as JSON
EOF
}

OUTPUT_JSON=0
RELEASE_DIR="dist/releases"

while [ $# -gt 0 ]; do
  case "$1" in
    --json)
      OUTPUT_JSON=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    --)
      shift
      break
      ;;
    -* )
      echo "unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      RELEASE_DIR="$1"
      shift
      break
      ;;
  esac
done

if [ $# -gt 0 ]; then
  echo "unexpected argument: $1" >&2
  usage
  exit 1
fi

SHA_FILE="$RELEASE_DIR/SHA256SUMS"
MANIFEST_FILE="$RELEASE_DIR/manifest.json"

SIGNATURE_STATUS="absent"
SIGNATURE_REASON="no signature artifacts found in release bundle"
SIGNATURE_LIMITATIONS=""

append_signature_limitation() {
  if [ -z "$SIGNATURE_LIMITATIONS" ]; then
    SIGNATURE_LIMITATIONS="$1"
  else
    SIGNATURE_LIMITATIONS="$SIGNATURE_LIMITATIONS||$1"
  fi
}

print_info() {
  if [ "$OUTPUT_JSON" -ne 1 ]; then
    echo "$1"
  fi
}

print_warning() {
  if [ "$OUTPUT_JSON" -ne 1 ]; then
    echo "$1" >&2
  fi
}

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
  if [ "$#" -lt 2 ]; then
    echo "malformed SHA256SUMS entry: $line" >&2
    exit 1
  fi
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

if [ "$sig_found" -eq 0 ] && [ -f "$RELEASE_DIR/SHA256SUMS.sig" ]; then
  sig_found=1
fi

if [ "$sig_found" -eq 1 ]; then
  if [ "${SKIP_GPG_VERIFY:-0}" = "1" ]; then
    SIGNATURE_STATUS="skipped"
    SIGNATURE_REASON="signature artifacts are present but verification was skipped via SKIP_GPG_VERIFY=1"
    append_signature_limitation "signature artifacts were present but verification was explicitly skipped"
    print_warning "warning: SKIP_GPG_VERIFY=1; skipping signature verification"
  elif command -v gpg >/dev/null 2>&1; then
    SIGNATURE_STATUS="verified"
    SIGNATURE_REASON="signature artifacts are present and were verified with gpg"

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
      print_info "GPG signature verified: $(basename "$target")"
    done

    sha_sig="$RELEASE_DIR/SHA256SUMS.sig"
    if [ -f "$sha_sig" ]; then
      if ! gpg --verify "$sha_sig" "$SHA_FILE" 2>/dev/null; then
        echo "GPG signature verification FAILED: SHA256SUMS" >&2
        exit 1
      fi
      print_info "GPG signature verified: SHA256SUMS"
    fi
  else
    SIGNATURE_STATUS="unavailable"
    SIGNATURE_REASON="signature artifacts are present but gpg is unavailable on this host"
    append_signature_limitation "signature artifacts were present but gpg was not available"
    print_warning "warning: gpg not found; skipping signature verification"
  fi
fi

if [ "$OUTPUT_JSON" -eq 1 ]; then
  node -e '
const [releaseDir, signatureStatus, signatureReason, limitationsArg] = process.argv.slice(1);
const limitations = limitationsArg
  ? limitationsArg.split("||").filter(Boolean)
  : [];

const payload = {
  surface: "release-artifact-verification",
  condition: "completed",
  verificationTier: "release-directory-verified",
  releaseDir,
  checks: {
    requiredMetadata: true,
    checksums: true,
    manifest: true,
    fileSizes: true,
  },
  signature: {
    status: signatureStatus,
    reason: signatureReason,
  },
  limitations,
};

process.stdout.write(JSON.stringify(payload));
' "$RELEASE_DIR" "$SIGNATURE_STATUS" "$SIGNATURE_REASON" "$SIGNATURE_LIMITATIONS"
  exit 0
fi

echo "release artifacts verified: $RELEASE_DIR"
echo "signature verification status: $SIGNATURE_STATUS"
