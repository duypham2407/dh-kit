# Release And Install Runbook

This runbook defines the release packaging and local install flow for `dh`.

## Build release artifacts

From repository root:

```sh
make release-all
```

Artifacts are produced in `dist/releases/`:

- `dh-darwin-arm64`
- `dh-darwin-amd64`
- `dh-linux-amd64`
- `dh-linux-arm64`
- `SHA256SUMS`
- `manifest.json`

## Verify release artifacts

Validate checksums and manifest consistency before install/upgrade:

```sh
scripts/verify-release-artifacts.sh dist/releases
```

## Sign release artifacts (optional)

Sign binaries and SHA256SUMS with GPG:

```sh
scripts/sign-release.sh dist/releases [gpg-key-id]
```

This creates `.sig` files alongside each binary and SHA256SUMS. The verifier
and installer scripts will check signatures automatically when `.sig` files
are present.

## Test installer scripts

Run the automated installer test suite:

```sh
scripts/test-installers.sh dist/releases
```

This validates 8 scenarios: fresh install, upgrade backup, checksum pass/fail,
sidecar SHA, install-from-release, and uninstall.

## Install from release directory (recommended)

Install the host-compatible binary and verify checksum from `SHA256SUMS`:

```sh
scripts/install-from-release.sh dist/releases
```

Optional install directory:

```sh
scripts/install-from-release.sh dist/releases "$HOME/.local/bin"
```

## Upgrade from release directory

Upgrade creates a backup of the existing binary and verifies the new one:

```sh
scripts/upgrade-from-release.sh dist/releases
```

If the upgraded binary fails `--version`, it automatically rolls back to the
backup.

## Install direct binary

You can still install from a specific binary path:

```sh
scripts/install.sh dist/releases/dh-darwin-arm64
```

To enforce explicit checksum:

```sh
scripts/install.sh dist/releases/dh-darwin-arm64 "$HOME/.local/bin" "<sha256>"
```

## Uninstall

```sh
scripts/uninstall.sh
```

Optional install dir:

```sh
scripts/uninstall.sh "$HOME/.local/bin"
```

## Verify install

```sh
dh --help
```

## CI Release Pipeline

The repository includes CI workflows for automated releases:

- **Release workflow** (`.github/workflows/release-and-smoke.yml`): Triggered by
  `v*` tags. Builds, verifies, smokes, and publishes to GitHub Releases.
- **Nightly smoke** (`.github/workflows/nightly-smoke.yml`): Daily build + smoke
  + doctor snapshot. Creates an issue on failure.
- **Embedding quality** (`.github/workflows/embedding-quality.yml`): Weekly
  provider-backed retrieval quality test.
