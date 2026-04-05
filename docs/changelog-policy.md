# Changelog And Version Policy

## Version policy

`dh` uses semantic versioning:

- `MAJOR`: breaking CLI/runtime/install behavior
- `MINOR`: new backward-compatible feature
- `PATCH`: bug fix, docs fix, packaging fix

## Commit message conventions

Use conventional-commit prefixes so the changelog generator categorises commits automatically:

| Prefix | Category in changelog |
|---|---|
| `feat:` / `feature:` | Features |
| `fix:` / `bug:` | Bug Fixes |
| `perf:` | Performance |
| `docs:` | Documentation |
| `test:` / `tests:` | Tests |
| `ci:` / `build:` | CI / Build |
| `chore:` / `refactor:` | Chores |
| (anything else) | Other Changes |

## Maintainer release flow

1. Write commits with conventional prefixes throughout the cycle
2. Run `scripts/update-changelog.sh <version>` to insert the new section into `CHANGELOG.md`
3. Review and edit the generated section if needed (e.g. clarify wording)
4. Commit: `git add CHANGELOG.md && git commit -m "chore: update changelog for v<version>"`
5. Tag and push: `git tag v<version> && git push && git push --tags`
6. CI builds, tests, and publishes the GitHub Release automatically
7. Release notes are generated from `scripts/generate-changelog.sh` + `.github/release-notes.md` (install instructions)
8. The Homebrew tap formula is updated automatically if `HOMEBREW_TAP_TOKEN` secret is set

## What every release should include

- version tag `vX.Y.Z`
- GitHub Release with binaries for macOS/Linux
- `SHA256SUMS` and `manifest.json`
- auto-generated release notes: changelog section + install + first-run steps
- updated `CHANGELOG.md` committed to main

