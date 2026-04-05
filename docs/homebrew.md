# Homebrew Distribution

This document describes how `dh` is distributed via Homebrew for macOS.

## Current State

`dh` has:

- GitHub Releases with platform binaries (macOS arm64/amd64, Linux amd64/arm64)
- SHA256SUMS and manifest.json in each release
- A one-line install script for GitHub Releases
- A formula generation script (`scripts/generate-homebrew-formula.sh`)

## Homebrew Tap

Recommended tap repository:

```text
duypham2407/homebrew-dh
```

Formula location within the tap:

```text
Formula/dh.rb
```

## Install UX

macOS users install with:

```sh
brew tap duypham2407/dh
brew install dh
```

Or in one line:

```sh
brew install duypham2407/dh/dh
```

## Generating the Formula

After building release artifacts (`make release-all VERSION=x.y.z`), generate the formula:

```sh
scripts/generate-homebrew-formula.sh dist/releases > Formula/dh.rb
```

The script reads `SHA256SUMS` and `manifest.json` from the release directory and produces a complete Homebrew formula with the correct checksums.

You can also pass the version explicitly:

```sh
scripts/generate-homebrew-formula.sh dist/releases 0.2.0 > Formula/dh.rb
```

## Maintainer Release Flow

Each release:

1. Bump version in `package.json` and `apps/cli/src/version.ts`
2. Tag: `git tag v0.1.0 && git push --tags`
3. CI builds, tests, and publishes the GitHub Release
4. Download artifacts or use local `dist/releases/`
5. Generate formula: `scripts/generate-homebrew-formula.sh dist/releases > Formula/dh.rb`
6. Copy formula to the tap repo and push

## CI Automation (Future)

The release workflow can be extended to:

1. Generate the formula automatically after publishing the GitHub Release
2. Open a PR or push directly to the `homebrew-dh` tap repository

## Notes

- Homebrew is primarily important for macOS
- Linux users should prefer GitHub Releases + the one-line install script
- The formula downloads pre-built binaries (no compilation during install)
