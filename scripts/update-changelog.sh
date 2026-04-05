#!/usr/bin/env sh
# Prepend a new version section into CHANGELOG.md.
#
# Usage:
#   scripts/update-changelog.sh <version> [from-ref]
#
# Generates a changelog section for <version> and inserts it after the
# <!-- NEW_RELEASE_ENTRY --> marker in CHANGELOG.md.
set -eu

VERSION="${1:?Usage: update-changelog.sh <version> [from-ref]}"
FROM_REF="${2:-}"

CHANGELOG="CHANGELOG.md"
MARKER="<!-- NEW_RELEASE_ENTRY -->"

if [ ! -f "$CHANGELOG" ]; then
  echo "CHANGELOG.md not found" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENTRY=$("$SCRIPT_DIR/generate-changelog.sh" "$VERSION" ${FROM_REF:+"$FROM_REF"})

# Use Python for reliable multiline injection (POSIX sh + awk have edge cases)
python3 - <<PYEOF
marker = "$MARKER"
entry = """$ENTRY"""
with open("$CHANGELOG", "r") as f:
    content = f.read()
if marker not in content:
    print("ERROR: marker '$MARKER' not found in $CHANGELOG", flush=True)
    raise SystemExit(1)
new_content = content.replace(marker, marker + "\n\n" + entry.rstrip(), 1)
with open("$CHANGELOG", "w") as f:
    f.write(new_content)
print("Updated $CHANGELOG with v$VERSION section")
PYEOF
