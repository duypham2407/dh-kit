#!/usr/bin/env sh
set -eu

SOURCE_DIR="${1:-dist/rust-engine/releases}"
OUTPUT_DIR="${2:-dist/releases}"
VERSION="${3:-dev}"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "source release directory not found: $SOURCE_DIR" >&2
  exit 1
fi

mkdir -p "$OUTPUT_DIR"

found=0
for file in "$SOURCE_DIR"/dh-*; do
  if [ -f "$file" ]; then
    cp "$file" "$OUTPUT_DIR"/
    found=1
  fi
done

if [ "$found" -ne 1 ]; then
  echo "no release binaries found in: $SOURCE_DIR" >&2
  exit 1
fi

(
  cd "$OUTPUT_DIR"

  rm -f SHA256SUMS
  for file in dh-*; do
    if [ -f "$file" ]; then
      shasum -a 256 "$file" >> SHA256SUMS
    fi
  done

  manifest_tmp="manifest.json.tmp"
  generated_at=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  printf '{\n  "version": "%s",\n  "generatedAt": "%s",\n  "files": [\n' "$VERSION" "$generated_at" > "$manifest_tmp"

  first=1
  for file in dh-*; do
    if [ ! -f "$file" ]; then
      continue
    fi

    checksum_line=$(shasum -a 256 "$file")
    set -- $checksum_line
    checksum="$1"
    size_bytes=$(wc -c < "$file" | tr -d ' ')

    if [ "$first" -eq 0 ]; then
      printf ',\n' >> "$manifest_tmp"
    fi
    first=0

    printf '    {"name": "%s", "sha256": "%s", "sizeBytes": %s}' "$file" "$checksum" "$size_bytes" >> "$manifest_tmp"
  done

  printf '\n  ]\n}\n' >> "$manifest_tmp"
  mv "$manifest_tmp" manifest.json
)

echo "packaged release artifacts in $OUTPUT_DIR"
