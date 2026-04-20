---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: RELEASE-HARDENING-V2
feature_slug: release-hardening-v2
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Release Hardening V2

RELEASE-HARDENING-V2 hardens the existing release packaging and operator lifecycle surfaces so artifact truth, install/upgrade/uninstall outcomes, backup and rollback behavior, doctor messaging, and release-facing wording tell one bounded, inspectable story from package creation through post-install verification. This work preserves the current Rust/TS product truth and current distribution boundaries; it does not add new core product capability, new package-manager expansion, Windows installer parity, or a promise of zero-friction install in every environment.

## Goal

- Keep release artifact truth inspectable from packaging through operator install and upgrade flows.
- Make install, upgrade, uninstall, and doctor outcomes explicit enough that operators can tell what succeeded, what was verified, what remains limited, and what to do next.
- Eliminate cross-surface truth drift between scripts, release docs, README guidance, and operator-facing lifecycle messaging.

## Target Users

- Release maintainers who package, verify, sign, and publish `dh` binaries.
- Operators who install, upgrade, uninstall, and troubleshoot `dh` through the current documented release paths.
- Reviewers, QA, and support maintainers who need one inspectable contract for release/distribution truth and lifecycle behavior.

## Problem Statement

- The repository already contains release packaging, checksum and manifest verification, optional signature support, local release-directory install and upgrade flows, GitHub-release installer flows, uninstall behavior, and doctor lifecycle classifications.
- Those pieces do not yet read as one bounded product contract across packaging, local install, GitHub install, upgrade, uninstall, and doctor surfaces.
- Today an operator can still be forced to infer important truths that should be explicit:
  - what artifact truth was actually verified in a given path
  - whether success means only `binary copied` versus `binary replaced and post-install checked`
  - whether backup and rollback protection existed and whether rollback actually occurred
  - whether a limitation is non-blocking but still important, such as skipped signature verification or a narrower verification path
  - what remains unsupported in distribution and platform coverage
  - whether `dh doctor` is reporting install/workspace health versus workflow-state or policy status
- This feature closes that bounded release-lifecycle truth gap without broadening into new product capability or new distribution ecosystems.

## In Scope

- Release artifact truth for the current packaged release bundle:
  - platform binaries already shipped by the repository
  - `SHA256SUMS`
  - `manifest.json`
  - optional `.sig` artifacts when present
- Release packaging and artifact-verification expectations for current scripted release flows, including what must be true before artifacts are considered verified.
- Operator-visible lifecycle behavior for current install surfaces already present in the repository:
  - install from local release directory
  - upgrade from local release directory
  - direct binary install/upgrade paths
  - GitHub release install/upgrade script paths
  - uninstall path
- Backup and rollback expectations for flows that replace an existing `dh` binary.
- Wording consistency across touched release/install/upgrade/uninstall/doctor surfaces in:
  - `docs/operations/release-and-install.md`
  - `README.md`
  - `CHANGELOG.md` where touched by this feature
  - lifecycle scripts and verification scripts under `scripts/`
- Honest distribution-boundary messaging for supported versus unsupported runtime install targets.
- Operator-visible failure, blocked, noop, and degraded reporting rules for touched lifecycle surfaces.
- Boundary between lifecycle outcome reporting and `dh doctor` health/readiness reporting.

## Out of Scope

- New core product capability work outside release/install lifecycle hardening.
- Re-architecting the Rust/TS truth boundary or moving product-truth ownership away from current implemented surfaces.
- Windows installer or runtime parity implementation.
- Expanding into new package managers or new distribution channels beyond the currently documented release/install surfaces.
- Promising friction-free install or upgrade in every host environment.
- Changing workflow-stage, approval-gate, or workflow-state behavior as part of this feature.
- Source-build/developer-environment redesign beyond truthful treatment of the existing optional Rust bootstrap path.
- Backup or rollback of workspace data, indexes, config, or user project state; this feature only governs lifecycle behavior around release artifacts and installed binaries.

## Main Flows

- **Flow 1 — Release maintainer packages and verifies artifacts**
  - As a release maintainer, I want packaging and verification to agree on what a valid release bundle contains, so that published artifacts have inspectable truth before distribution.

- **Flow 2 — Operator installs from a verified local release directory**
  - As an operator, I want the release-directory install path to validate host-compatible artifact truth before installation succeeds, so that local release installs do not silently accept drifted or incomplete bundles.

- **Flow 3 — Operator upgrades an existing installation safely**
  - As an operator, I want upgrade behavior to make backup, post-install verification, and rollback outcomes explicit, so that replacing an existing binary is recoverable and inspectable.

- **Flow 4 — Operator uses a narrower direct-binary or GitHub-release path**
  - As an operator, I want each distribution path to tell me exactly what was verified in that path, so that checksum-only or otherwise bounded verification is not mistaken for stronger artifact truth.

- **Flow 5 — Operator uninstalls `dh`**
  - As an operator, I want uninstall to distinguish `completed` versus `noop`, so that I know whether removal happened at the requested path and what to check next.

- **Flow 6 — Operator runs `dh doctor` after lifecycle actions**
  - As an operator, I want `dh doctor` to report install/distribution and runtime/workspace health without pretending to report workflow-state progress, so that post-install readiness stays honest and inspectable.

- **Flow 7 — Operator hits an unsupported or degraded distribution condition**
  - As an operator, I want unsupported platform claims, skipped verification, and bounded release coverage to be stated directly, so that I do not assume parity or guarantees the repository does not currently provide.

## Business Rules

### Release artifact truth and verification rules

- A release bundle is only considered artifact-complete when it includes:
  - at least one shipped `dh-*` binary for current supported targets
  - `SHA256SUMS`
  - `manifest.json`
- For bundled release-directory verification, `manifest.json` and `SHA256SUMS` must agree with each other and with the actual files on disk for name, checksum, and size.
- A release-verification surface must fail if any required release metadata is missing, a listed file is missing, a checksum mismatches, a manifest entry is malformed, or manifest/file-size truth drifts.
- Signature artifacts remain optional in the current bounded contract.
- If signature files are present and the verification path can validate them, the surface should report that signature verification occurred.
- If signature files are present but signature verification is skipped, unavailable, or explicitly bypassed, the surface must say that signatures were not validated and must not imply full signature-backed verification.
- Each install or upgrade surface must state only the verification truth that path actually performed.
- A path that verifies checksum only must not claim manifest verification or signature verification.
- A path that installs from a raw binary without release metadata may remain a bounded manual path, but it must not be presented as equivalent to a verified release-directory install when the stronger metadata checks were not performed.

### Lifecycle outcome rules

- Install, upgrade, uninstall, artifact verification, and doctor are separate operator surfaces and must not imply each other’s success.
- Successful install means the binary was installed to the target path for that command’s scope; it does not, by itself, prove runtime/workspace readiness.
- Successful upgrade means the target binary was replaced and the upgrade path’s declared post-install verification passed.
- Successful uninstall means removal was attempted at the requested install path and the removal result was checked.
- `noop` is valid only for lifecycle actions where no change was needed or nothing existed at the requested target path.
- A lifecycle command must not report `completed` if the required verification or required preconditions for that path failed before safe completion.
- Post-lifecycle next-step guidance must remain explicit, especially when the operator should run `dh --version`, `dh doctor`, or `which dh` next.

### Backup and rollback rules

- Any lifecycle path that replaces an existing `dh` binary at the target path must create binary-level backup protection before replacement.
- Fresh install on an empty target path must not claim backup or rollback protection that did not exist.
- Upgrade or replacement flows that promise post-install verification must verify the newly active binary before reporting success.
- If post-install verification fails and a backup exists, the flow must attempt rollback before exiting.
- Operator-visible output must state whether rollback succeeded, failed, or was unavailable because no backup existed.
- Backup and rollback scope in this feature is limited to the installed `dh` binary at the target path. It does not cover OpenCode home state, workspace state, indexes, or user project data.

### Doctor and wording-boundary rules

- `dh doctor` remains a product/install/workspace health surface.
- `dh doctor` must keep the lifecycle/readiness classes explicit:
  - `install/distribution`
  - `runtime/workspace readiness`
  - `capability/tooling`
- `dh doctor` health output must not imply workflow-state, approval-gate, policy, or evidence-progress status.
- Touched lifecycle and release-facing surfaces must keep an inspectable operator contract that communicates:
  - what surface this output represents
  - current condition or outcome
  - why that condition/outcome applies
  - what still works versus what is limited
  - next recommended action
- Doctor may use health/readiness vocabulary (`healthy`, `degraded`, `unsupported`, `misconfigured`) while lifecycle commands may use outcome vocabulary such as `completed` and `noop`; however, the wording across touched surfaces must not contradict repository reality.
- Non-blocking limitations must remain visible. A command must not claim `limited: none` or equivalent full-health language when verification or support was meaningfully narrowed.

### Supported, unsupported, and bounded distribution rules

- This feature preserves the current runtime install truth for prebuilt binaries on macOS and Linux only.
- Current bounded release targets remain the platform/architecture combinations already produced and documented by the repository.
- Windows runtime installer parity remains unsupported and must be described that way when touched by release/install messaging.
- Runtime install remains Rust-free by default.
- Rust toolchain setup, Xcode Command Line Tools, or Linux native build prerequisites remain part of source/development workflows or the explicit opt-in dev bootstrap path, not the default runtime install claim.
- Successful binary install must not imply that all operational commands work without existing runtime prerequisites already documented by the product, including Node.js for normal `dh` operations.
- This feature may clarify existing documented distribution surfaces, but it must not expand the package-manager ecosystem or imply broader release-channel parity than the repository currently supports.

## Acceptance Criteria Matrix

- **AC1 — Release bundle truth**
  - **Given** a release directory is treated as a packaged release bundle,
  - **when** artifact verification runs against it,
  - **then** verification passes only if the bundle contains at least one shipped `dh-*` binary, `SHA256SUMS`, and `manifest.json`, and the manifest/checksum/file-size truth matches the actual files.

- **AC2 — Verification drift blocks release-directory trust**
  - **Given** a release directory is missing required metadata or contains checksum, manifest, or file-size drift,
  - **when** a release-verification or release-directory install/upgrade path checks it,
  - **then** the path fails before claiming verified release truth or lifecycle completion.

- **AC3 — Signature truth stays explicit**
  - **Given** signature files are present for a touched release or install path,
  - **when** signature verification runs, is skipped, or is unavailable,
  - **then** the operator-visible output states which of those cases occurred and does not claim signature verification succeeded when it did not.

- **AC4 — Local release-directory install is verification-gated**
  - **Given** `install-from-release` or `upgrade-from-release` is invoked,
  - **when** host-compatible artifact resolution or required release verification fails,
  - **then** the command exits before printing a completed lifecycle success summary for that path.

- **AC5 — Narrower paths do not overclaim**
  - **Given** a direct-binary or GitHub-release install/upgrade path performs a narrower verification set than the release-directory path,
  - **when** the operator reads the result,
  - **then** the surface states the narrower verification truth and does not present that path as equivalent to a manifest-verified release-directory install unless it actually performed that stronger verification.

- **AC6 — Install success stays bounded**
  - **Given** an install path completes successfully,
  - **when** the operator reads the lifecycle output,
  - **then** the output identifies the installed target path, reports the install outcome, and directs the operator to the next post-install check without claiming runtime/workspace health was already verified.

- **AC7 — Replacement creates backup protection**
  - **Given** an install or upgrade path replaces an existing `dh` binary at the target path,
  - **when** replacement begins,
  - **then** binary-level backup protection is created before the active binary is swapped.

- **AC8 — Upgrade rollback is inspectable**
  - **Given** an upgrade or replacement path performs post-install verification and that verification fails,
  - **when** a backup exists,
  - **then** the command attempts rollback, exits non-zero, and reports whether rollback succeeded.

- **AC9 — No false rollback claim**
  - **Given** no previous binary existed at the target path,
  - **when** a lifecycle action fails,
  - **then** the output does not claim rollback protection or rollback success unless a real backup was created.

- **AC10 — Uninstall outcomes are explicit**
  - **Given** uninstall is invoked,
  - **when** the target binary is removed,
  - **then** the surface reports `completed` and the next step points the operator to path verification;
  - **and when** nothing exists at the requested path,
  - **then** the surface reports `noop` and does not imply deletion occurred.

- **AC11 — Doctor stays in its lane**
  - **Given** an operator runs `dh doctor` after install or upgrade,
  - **when** the output is rendered,
  - **then** it reports install/distribution, runtime/workspace readiness, and capability/tooling health without claiming workflow-state, approval-gate, or policy status.

- **AC12 — Unsupported distribution bounds remain explicit**
  - **Given** an operator reads touched release/install docs or hits a platform/distribution condition outside the current bounded contract,
  - **when** that surface describes support,
  - **then** it explicitly states the supported macOS/Linux bounded path and the unsupported Windows parity boundary without implying broader cross-platform coverage.

- **AC13 — Runtime install does not imply dev bootstrap**
  - **Given** an operator completes a normal runtime install or upgrade without explicitly requesting development bootstrap,
  - **when** they inspect the lifecycle wording,
  - **then** the product does not imply Rust toolchains, Xcode, or Linux native build prerequisites were installed or required for that default runtime install path.

- **AC14 — Install success does not hide runtime prerequisites**
  - **Given** a lifecycle command reports a successful install or upgrade,
  - **when** the operator reads the touched output or docs,
  - **then** that success does not imply all normal `dh` operational commands are ready without the already documented runtime prerequisites.

- **AC15 — Non-blocking degradation stays visible**
  - **Given** a touched lifecycle or verification path completes with a meaningful limitation such as skipped signature verification, unavailable verification tooling, or a narrower verification path,
  - **when** the operator reads the result,
  - **then** the output states what was verified, what was not, what still works, and what remains limited instead of presenting the result as fully verified with no limitation.

- **AC16 — Solution-ready handoff**
  - **Given** this scope package,
  - **when** Solution Lead begins design,
  - **then** they can define touched surfaces, verification-level behavior, backup/rollback behavior, bounded support wording, and failure/degraded reporting without inventing new product behavior.

## Edge Cases

- A release directory contains valid binaries and `SHA256SUMS` but is missing `manifest.json`.
- `manifest.json` exists but omits a file listed in `SHA256SUMS`, uses a mismatched checksum, or reports the wrong size.
- Signature files exist but `gpg` is unavailable or verification is explicitly skipped.
- A direct-binary install is attempted with no checksum argument and no sidecar checksum/signature metadata.
- A GitHub-release install path verifies checksum but does not have the same metadata surface as a local release-directory verification path.
- An install path targets an empty directory, while an upgrade path targets an existing `dh` binary.
- An upgrade creates a backup but the new binary fails post-install verification.
- Uninstall removes the requested target path successfully, but another `dh` binary still exists elsewhere on `PATH`.
- Install succeeds at binary-copy level, but `dh doctor` later reports degraded or misconfigured runtime/workspace readiness.
- An operator is on Windows or another unsupported runtime install target and reaches a touched release/install surface.

## Error And Failure Cases

- The feature fails if any touched surface claims verified release truth without the underlying path actually performing that level of verification.
- The feature fails if a narrower install or upgrade path still reads as equivalent to a stronger verified release-directory path.
- The feature fails if `completed` success output hides a meaningful verification limitation or skipped check.
- The feature fails if backup or rollback claims imply protection for workspace/config/project state rather than only the installed binary path.
- The feature fails if upgrade failure cannot be distinguished from successful upgrade with rollback protection.
- The feature fails if uninstall reports `completed` when deletion did not occur, or reports `noop` when deletion did occur.
- The feature fails if `dh doctor` or touched docs blur install/workspace health with workflow-state or policy status.
- The feature fails if touched release/install messaging implies Windows parity, broad package-manager parity, or universal zero-friction install.
- The feature fails if a successful install is described as proving all normal runtime commands are ready when documented runtime prerequisites are still missing.
- The feature fails if the work broadens into new distribution ecosystems or unrelated core capability work instead of bounded lifecycle hardening.

## Open Questions

- Non-blocking solution choice: should the GitHub-release installer and upgrader be brought up to manifest-aware/signature-aware verification parity with local release-directory flows, or remain checksum-bounded with explicit limited wording?
- Non-blocking solution choice: should raw direct-binary install without checksum metadata remain available as a bounded manual path, or should the operator be forced through stronger explicit acknowledgement/output when that path is used?

## Success Signal

- Maintainers can package and verify a release bundle and know exactly what artifact truth was proven before distribution.
- Operators can tell, from touched lifecycle output alone, whether an install or upgrade completed, what was verified, whether backup/rollback protection existed, and what command to run next.
- Operators can tell, from uninstall output, whether deletion occurred at the requested path or whether the result was a `noop`.
- Operators can tell, from `dh doctor`, whether install/distribution and runtime/workspace health are healthy, degraded, unsupported, or misconfigured without mistaking that for workflow-state progress.
- Touched docs and lifecycle surfaces no longer contradict each other about supported release targets, verification strength, or lifecycle outcomes.
- Unsupported or bounded release/distribution surfaces remain honest, especially for Windows parity, optional signature verification, and non-default development bootstrap behavior.

## Handoff Notes For Solution Lead

- Preserve the bounded nature of this feature: harden the existing release lifecycle; do not use it to add new package-manager ecosystems, new runtime platforms, or new core product capability.
- Keep the current product-truth boundary intact. This is about making release/install truth inspectable and consistent, not moving ownership between Rust and TypeScript.
- Inventory every touched release-lifecycle surface already present in the repo, at minimum:
  - `scripts/package-release.sh`
  - `scripts/verify-release-artifacts.sh`
  - `scripts/install.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
  - `scripts/uninstall.sh`
  - `scripts/check-doctor-snapshot.mjs`
  - `docs/operations/release-and-install.md`
  - `README.md`
- Decide per path whether to strengthen verification to a higher common floor or to keep the path intentionally narrower with explicit operator-visible limitation. Do not leave the verification level ambiguous.
- Keep backup and rollback scoped to binary replacement only.
- Preserve the boundary between lifecycle outcome surfaces and `dh doctor` health/readiness surfaces.
- If touched Homebrew or other existing documented distribution wording is adjusted, keep it inside the current bounded distribution truth and do not imply new ecosystem expansion.
