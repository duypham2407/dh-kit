#!/usr/bin/env sh
# Generate a changelog section for a release.
#
# Usage:
#   scripts/generate-changelog.sh <version> [from-ref]
#
# <version>  : the version being released, e.g. 0.1.0
# [from-ref] : git ref to start from (exclusive). Defaults to the previous
#              tag. If no previous tag exists, uses the first commit.
#
# Output is a markdown block that can be prepended to CHANGELOG.md or used
# directly as GitHub Release notes.
#
# Commit classification is based on conventional-commit prefixes:
#   feat / feature      -> Features
#   fix / bug           -> Bug Fixes
#   perf                -> Performance
#   docs                -> Documentation
#   test / tests        -> Tests
#   ci / build          -> CI / Build
#   chore / refactor    -> Chores
#   (anything else)     -> Other
set -eu

VERSION="${1:?Usage: generate-changelog.sh <version> [from-ref]}"
REPO_URL="https://github.com/duypham2407/dh-kit"

# Determine range start
if [ -n "${2:-}" ]; then
  FROM_REF="$2"
else
  # Find the previous tag (the tag before the one we're releasing)
  PREV_TAG=$(git tag --sort=-version:refname | grep -E '^v[0-9]' | sed -n '2p' || true)
  if [ -n "$PREV_TAG" ]; then
    FROM_REF="$PREV_TAG"
  else
    # No previous tag: use the root commit
    FROM_REF=$(git rev-list --max-parents=0 HEAD)
  fi
fi

# Determine range end: if the release tag exists use it, else use HEAD
if git rev-parse "v$VERSION" >/dev/null 2>&1; then
  TO_REF="v$VERSION"
else
  TO_REF="HEAD"
fi

DATE=$(date -u +"%Y-%m-%d")

# Collect commits in the range (exclude merge commits)
COMMITS=$(git log "${FROM_REF}..${TO_REF}" --no-merges --pretty=format:"%H %s" 2>/dev/null || true)

if [ -z "$COMMITS" ]; then
  COMMITS=$(git log "${FROM_REF}..${TO_REF}" --pretty=format:"%H %s" 2>/dev/null || true)
fi

# Classify each commit into buckets
FEAT="" FIX="" PERF="" DOCS="" TEST="" CI="" CHORE="" OTHER=""

while IFS= read -r line; do
  [ -z "$line" ] && continue
  HASH=$(printf '%s' "$line" | cut -d' ' -f1)
  MSG=$(printf '%s' "$line" | cut -d' ' -f2-)
  SHORT="${HASH%"${HASH#???????}"}"  # 7-char short hash
  ENTRY="- ${MSG} ([${SHORT}](${REPO_URL}/commit/${HASH}))"

  # Strip conventional prefix for display
  BODY=$(printf '%s' "$MSG" | sed 's/^[a-zA-Z]*([^)]*): //' | sed 's/^[a-zA-Z]*: //')
  ENTRY="- ${BODY} ([${SHORT}](${REPO_URL}/commit/${HASH}))"

  case "$MSG" in
    feat:*|feat\(*|feature:*|feature\(*)  FEAT=$(printf '%s\n%s' "$FEAT" "$ENTRY") ;;
    fix:*|fix\(*|bug:*|bug\(*)            FIX=$(printf '%s\n%s' "$FIX" "$ENTRY") ;;
    perf:*|perf\(*)                        PERF=$(printf '%s\n%s' "$PERF" "$ENTRY") ;;
    docs:*|docs\(*)                        DOCS=$(printf '%s\n%s' "$DOCS" "$ENTRY") ;;
    test:*|test\(*|tests:*|tests\(*)       TEST=$(printf '%s\n%s' "$TEST" "$ENTRY") ;;
    ci:*|ci\(*|build:*|build\(*)           CI=$(printf '%s\n%s' "$CI" "$ENTRY") ;;
    chore:*|chore\(*|refactor:*|refactor\(*) CHORE=$(printf '%s\n%s' "$CHORE" "$ENTRY") ;;
    *)                                     OTHER=$(printf '%s\n%s' "$OTHER" "$ENTRY") ;;
  esac
done <<EOF
$COMMITS
EOF

# Emit markdown
printf '## [%s](%s/releases/tag/v%s) — %s\n\n' "$VERSION" "$REPO_URL" "$VERSION" "$DATE"

emit_section() {
  TITLE="$1"; ITEMS="$2"
  if [ -n "$(printf '%s' "$ITEMS" | tr -d '[:space:]')" ]; then
    printf '### %s\n\n' "$TITLE"
    printf '%s\n' "$ITEMS" | grep -v '^$' | sort
    printf '\n'
  fi
}

emit_section "Features" "$FEAT"
emit_section "Bug Fixes" "$FIX"
emit_section "Performance" "$PERF"
emit_section "Documentation" "$DOCS"
emit_section "Tests" "$TEST"
emit_section "CI / Build" "$CI"
emit_section "Chores" "$CHORE"
emit_section "Other Changes" "$OTHER"

printf '%s\n\n' '---'
