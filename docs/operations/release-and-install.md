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

Validate checksum + manifest + file-size consistency before install/upgrade:

```sh
scripts/verify-release-artifacts.sh dist/releases
```

Structured verification output for caller scripts:

```sh
scripts/verify-release-artifacts.sh --json dist/releases
```

Phase 5 note: `install-from-release.sh` and `upgrade-from-release.sh` now run
artifact verification as part of their lifecycle flow. Keep this explicit verify step
in release automation so failure class stays inspectable early.

## Sign release artifacts (optional)

Sign binaries and SHA256SUMS with GPG:

```sh
scripts/sign-release.sh dist/releases [gpg-key-id]
```

This creates `.sig` files alongside each binary and SHA256SUMS. Signature
verification remains optional-by-availability: touched lifecycle commands now
report whether signatures were `verified`, `skipped`, `unavailable`, or
`absent`.

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

Install the host-compatible binary from the strongest trust path (local
release-directory verification):

```sh
scripts/install-from-release.sh dist/releases
```

Verification floor in this path:

- release bundle completeness (`dh-*` binary + `SHA256SUMS` + `manifest.json`)
- checksum verification from `SHA256SUMS`
- manifest consistency + file-size verification
- explicit signature status (`verified` / `skipped` / `unavailable` / `absent`)

Expected lifecycle output contract:

- `surface: lifecycle install (install-from-release)`
- `condition: completed` on success
- `why` / `works` / `limited` / `next` guidance so operators know exactly what verification ran and what remains limited

Optional install directory:

```sh
scripts/install-from-release.sh dist/releases "$HOME/.local/bin"
```

## Upgrade from release directory

Upgrade from release-directory trust path creates backup protection before
replacement and verifies the new binary:

```sh
scripts/upgrade-from-release.sh dist/releases
```

Expected lifecycle output contract:

- `surface: lifecycle upgrade (upgrade-from-release)`
- `condition: completed` on success
- explicit rollback fact in `why` (`rollback=...`)
- explicit `next` guidance to run `dh --version` and `dh doctor`

If the upgraded binary fails `--version`, it automatically rolls back to the
backup.

## Install direct binary

You can still install from a specific binary path (bounded manual trust path):

```sh
scripts/install.sh dist/releases/dh-darwin-arm64
```

To enforce explicit checksum:

```sh
scripts/install.sh dist/releases/dh-darwin-arm64 "$HOME/.local/bin" "<sha256>"
```

Direct-binary/install.sh output now explicitly reports:

- whether checksum was verified (explicit SHA, sidecar `.sha256`, or not provided)
- whether signature verification ran
- that manifest/file-size verification is not part of this path

## Upgrade direct binary

```sh
scripts/upgrade.sh dist/releases/dh-darwin-arm64
```

`upgrade.sh` now reports explicit backup/rollback truth for `completed`,
`blocked`, and `failed` outcomes.

## Install/upgrade directly from GitHub Releases (narrower path)

```sh
scripts/install-github-release.sh
scripts/upgrade-github-release.sh
```

GitHub release path verification remains intentionally narrower than local
release-directory install/upgrade:

- checksum is verified against downloaded `SHA256SUMS`
- manifest/file-size verification is not performed on this path
- signatures may be downloaded by the upgrader but are not verified in this path
- lifecycle output now states these limitations directly

For stronger verification, prefer:

```sh
scripts/install-from-release.sh dist/releases
scripts/upgrade-from-release.sh dist/releases
```

## Uninstall

```sh
scripts/uninstall.sh
```

Optional install dir:

```sh
scripts/uninstall.sh "$HOME/.local/bin"
```

Expected lifecycle output contract:

- `surface: lifecycle uninstall`
- `condition: completed` when removal occurred, `condition: noop` when nothing existed at the target path
- explicit `next` guidance to verify path state (`which dh`)

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

Doctor boundary reminder:

- `dh doctor` reports product/install/workspace health.
- For workflow-state, evidence, or policy status, use:
  `node .opencode/workflow-state.js status|show|show-policy-status|show-invocations|check-stage-readiness|resume-summary`.

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
