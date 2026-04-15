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

Phase 5 note: `install-from-release.sh` and `upgrade-from-release.sh` now run
artifact verification as part of their lifecycle flow. Keep this explicit verify step
in release automation so failure class stays inspectable early.

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

This validates installer and bootstrap scenarios including: fresh install,
upgrade backup, checksum pass/fail, sidecar SHA, install-from-release,
uninstall, no-Rust-default behavior, and consent-gated Rust dev bootstrap dry-run checks.

It also validates release-readiness guardrails (missing manifest should fail fast)
for both install and upgrade paths.

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

Phase 5 note: uninstall now reports explicit lifecycle outcome (`completed` or `noop`)
and verifies binary removal when deletion is attempted.

## Rust Toolchain Contract And Dev Bootstrap (Slice 2A)

Runtime install remains Rust-free by default. Installing a prebuilt `dh` binary does **not** install:

- `rustup` or Rust toolchains
- Xcode Command Line Tools
- Linux distro packages (`apt`/`dnf`/`pacman`, etc.)
- Visual Studio Build Tools

The checked-in Rust contract for development/source workflows is:

```text
rust-toolchain.toml
```

### Check dev prerequisites (no installation)

```sh
scripts/install-dev-tools.sh --check-only
```

This prints missing prerequisite instructions and never installs system packages.

### Opt-in Rust toolchain bootstrap

```sh
scripts/install-dev-tools.sh --with-rust-tools --yes
```

This path is consent-gated. Without `--yes` (or `DH_INSTALL_RUST_TOOLS_YES=1`), bootstrap exits with a warning.

Dry-run preview:

```sh
scripts/install-dev-tools.sh --with-rust-tools --yes --dry-run
```

### Optional bootstrap from installer flows

Default installer behavior remains unchanged. To opt in explicitly during install/upgrade:

```sh
scripts/install-from-release.sh --with-rust-tools --yes dist/releases
scripts/upgrade-from-release.sh --with-rust-tools --yes dist/releases
```

Equivalent environment flags:

- `DH_INSTALL_RUST_TOOLS=1`
- `DH_INSTALL_RUST_TOOLS_YES=1`
- `DH_RUST_BOOTSTRAP_DRY_RUN=1` (optional preview mode)

### Windows support note

Current release/install scripts in this repository support macOS/Linux prebuilt binaries.
No Windows runtime installer is implemented yet; do not assume Windows release parity.

## Diagnostics lifecycle classification

`dh doctor` now surfaces lifecycle/readiness classes explicitly:

- `install/distribution`
- `runtime/workspace readiness`
- `capability/tooling`

Statuses are one of: `healthy`, `degraded`, `unsupported`, `misconfigured`.
Nightly doctor snapshot checks treat `unsupported` and `misconfigured` lifecycle
states as regressions requiring attention.

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
