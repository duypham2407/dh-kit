---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: GO-TO-RUST-MIGRATION
feature_slug: go-to-rust-runtime-and-distribution-replacement
source_scope_package: docs/scope/2026-04-15-go-to-rust-runtime-and-distribution-replacement.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Go To Rust Runtime And Distribution Replacement

## Chosen Approach
- Replace the remaining active Go-backed product path through a phased Rust + TypeScript cutover that preserves the current operator-visible lifecycle: install, run, doctor, upgrade, uninstall, release packaging, and smoke behavior.
- Use one runtime authority at a time. Do not introduce long-lived dual-runtime support. Keep the current Go path only as a temporary rollback surface until the Rust path proves parity across release, doctor, and installer flows.
- Treat this as a cross-boundary replacement, not a repo-wide cleanup. The implementation goal is to remove Go from active supported workflows, not to rewrite every historical Go reference immediately.

## Impacted Surfaces
- Active Go core: `packages/opencode-core/**`
- Rust target runtime: `rust-engine/**`
- CLI/app entrypoints and TS integration surfaces: `apps/cli/**`, `packages/runtime/**`
- Diagnostics/readiness: `packages/runtime/src/diagnostics/**`, `scripts/check-doctor-snapshot.mjs`
- Build and packaging: `Makefile`, `scripts/build-cli-bundle.sh`, `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh`
- Installer lifecycle: `scripts/install*.sh`, `scripts/upgrade*.sh`, `scripts/uninstall.sh`, `scripts/test-installers.sh`
- CI and release automation: `.github/workflows/ci.yml`, `.github/workflows/release-and-smoke.yml`, `.github/workflows/nightly-smoke.yml`
- Active operator and maintainer docs: `README.md`, `docs/operations/release-and-install.md`, `docs/homebrew.md`, `docs/troubleshooting.md`

## Boundaries And Components
### Active Go surface to replace
- `packages/opencode-core/` is still an active supported surface, not just historical residue.
- `packages/opencode-core/go.mod` confirms a live Go module.
- Current CI, release, and packaging still call into this tree for test/build/release output.
- `scripts/build-cli-bundle.sh` writes the bundled TS CLI into `packages/opencode-core/internal/clibundle/cli-bundle.mjs`, which keeps the current TS product layer coupled to the Go runtime path.

### Rust ownership after cutover
- `rust-engine/` becomes the authoritative native runtime and binary producer for the supported product path.
- TypeScript remains responsible for CLI/app orchestration, workflow surfaces, diagnostics policy, metadata, and shell-facing lifecycle helpers.
- Doctor, release verification, and installer scripts remain TS/shell-owned unless implementation proves a Rust-native replacement is necessary.

### Surfaces that must preserve operator-visible behavior
- Release artifacts under `dist/releases/`
- `manifest.json` and `SHA256SUMS`
- `dh --help`, `dh --version`, doctor entrypoints, and smoke entrypoints
- installer, upgrade, uninstall, and rollback behavior already documented in active runbooks

## Interfaces And Data Contracts
- The release artifact contract must stay stable unless an explicit behavior change is approved:
  - binary naming expected by install and smoke scripts
  - artifact location under `dist/releases/`
  - checksum and manifest sidecars
- Doctor must keep the existing lifecycle classification model:
  - `install/distribution`
  - `runtime/workspace readiness`
  - `capability/tooling`
- The current doctor contract must stop treating the embedded Go binary as a normal supported-path prerequisite and instead validate the Rust-backed runtime artifact path.
- CI and release workflows must preserve their existing role separation: TS checks/tests, release artifact build, artifact verification, installer lifecycle checks, smoke, and publish.

## Risks And Trade-offs
- Hidden Go dependency risk: release or doctor may still rely on Go artifacts indirectly even after obvious workflow changes are removed.
- Contract drift risk: changing binary names, artifact layout, or smoke entrypoints would break installer and release behavior.
- Diagnostic regression risk: removing Go readiness checks before Rust checks replace them would make `doctor` less trustworthy.
- Rewrite drift risk: `packages/opencode-core/` is large; implementation must replace only active supported surfaces and retire residue after parity evidence exists.
- Parallel execution risk is high because runtime, doctor, release, CI, and install all share the same artifact contract.

## Recommended Path
- First freeze the supported contract and inventory all active Go-owned surfaces that still participate in runtime, doctor, CI, packaging, release, or smoke.
- Then define the Rust-owned artifact contract that preserves current operator-visible behavior.
- After that, cut over the doctor/install/distribution path, then CI/release, then active docs, and only then retire active Go ownership.
- The simplest adequate path is a phased cutover with a single integration checkpoint before Go retirement.

## Implementation Slices
### Slice 1: Active Go surface inventory and parity map
- **Goal:** produce the authoritative list of active Go-owned product/runtime/release surfaces that require replacement versus residue that can wait for retirement.
- **Primary files/surfaces:** `packages/opencode-core/**`, `Makefile`, `.github/workflows/*`, `packages/runtime/src/diagnostics/**`, `scripts/*`, active operator/release docs.
- **Details:**
  - Map every active Go dependency to a target Rust or TS owner.
  - Classify `packages/opencode-core/` content into: must-replace active surface, temporary compatibility surface, or historical/deletable-after-cutover.
  - This inventory becomes the implementation contract for FullstackAgent and the parity checklist for review/QA.
- **Validation hook:** repository inspection only; no additional repo-native command is required for this planning slice.

### Slice 2: Rust runtime artifact contract
- **Goal:** make `rust-engine/` the authoritative binary producer without changing supported release/install artifact expectations.
- **Primary files/surfaces:** `rust-engine/**`, `Makefile`, `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh`, `scripts/test-installers.sh`, release workflows.
- **Details:**
  - Preserve artifact naming, `dist/releases/` layout, `SHA256SUMS`, and `manifest.json`.
  - Replace the current Go build output dependency with Rust-generated binaries.
  - Re-route or remove the TS bundle path that currently feeds `packages/opencode-core/internal/clibundle/cli-bundle.mjs` only when the Rust runtime contract is ready to consume the replacement path.
- **Depends on:** Slice 1
- **Validation hook:** `make release-all`, `scripts/verify-release-artifacts.sh dist/releases`, `scripts/test-installers.sh dist/releases`

### Slice 3: Doctor and install/distribution cutover
- **Goal:** remove Go-specific readiness assumptions while keeping diagnostics equally or more informative.
- **Primary files/surfaces:** `packages/runtime/src/diagnostics/doctor.ts`, `packages/runtime/src/diagnostics/doctor.test.ts`, `scripts/check-doctor-snapshot.mjs`, installer scripts if artifact assumptions change.
- **Details:**
  - Replace checks for embedded Go binary presence with checks for the Rust-backed runtime artifact path.
  - Preserve current lifecycle classes and bounded status reporting.
  - Ensure missing Go binaries are no longer reported as normal supported-path degradation.
- **Depends on:** Slice 2
- **Validation hook:** `npm run check`, `npm test`, doctor snapshot capture/check flow, `node scripts/check-doctor-snapshot.mjs dist/diagnostics/doctor-snapshot.json` when a snapshot exists

### Slice 4: CI and release workflow migration
- **Goal:** remove Go as an active required CI dependency and replace it with Rust-native validation/build stages matched to repo reality.
- **Primary files/surfaces:** `.github/workflows/ci.yml`, `.github/workflows/release-and-smoke.yml`, `.github/workflows/nightly-smoke.yml`, `Makefile`, rust build/test entrypoints.
- **Details:**
  - Remove `actions/setup-go`, `go test ./...`, and Go build stages from active workflows.
  - Replace them with the real Rust workspace commands adopted by the repository during implementation.
  - Preserve TS checks/tests, release packaging, installer checks, smoke ordering, and publish behavior.
- **Depends on:** Slices 2-3
- **Validation hook:** workflow execution using real repo commands once adopted; do not invent Rust commands in advance of implementation.

### Slice 5: Release, smoke, and lifecycle parity checkpoint
- **Goal:** prove the Rust-backed path works end-to-end before any active Go retirement.
- **Primary files/surfaces:** release workflows, smoke scripts, install/upgrade/uninstall scripts, release docs.
- **Details:**
  - Produce a release candidate from the Rust path.
  - Verify install, upgrade rollback, uninstall, deterministic smoke, provider-backed smoke, and doctor behavior against the Rust artifacts.
  - Keep operator-visible commands and lifecycle semantics stable.
- **Depends on:** Slices 2-4
- **Validation hook:** `make release-all VERSION=<version>`, `scripts/verify-release-artifacts.sh dist/releases`, `scripts/test-installers.sh dist/releases`, existing smoke workflow logic

### Slice 6: Documentation alignment and Go retirement
- **Goal:** align active docs to the Rust + TypeScript supported architecture and retire active Go ownership only after parity is proven.
- **Primary files/surfaces:** `README.md`, `docs/operations/release-and-install.md`, `docs/homebrew.md`, `docs/troubleshooting.md`, Go-specific active references.
- **Details:**
  - Remove or restate active docs that imply Go is required for the supported product path.
  - Keep historical or archive-only Go references out of scope unless they are still misleading for active usage.
  - Retire `packages/opencode-core` active ownership only after the parity checkpoint passes.
- **Depends on:** Slice 5
- **Validation hook:** doc review against approved scope and active runtime behavior; no invented validation command

## Dependency Graph
- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- Rust artifact contract is the dependency anchor for doctor, CI, release, and install work.
- Documentation cleanup must follow validated cutover, not lead it.
- Go retirement is last; it must not occur before the Rust-backed release/install/doctor/smoke checkpoint is proven.

## Parallelization Assessment
- parallel_mode: `none`
- why: runtime, release, doctor, install, and CI all share the same artifact contract and are too collision-prone to bless parallel implementation honestly at solution time.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- integration_checkpoint: Build one Rust-backed release candidate and verify installer lifecycle, doctor/readiness, and smoke before retiring the active Go path.
- max_active_execution_tracks: 1

## Validation Matrix
- **Active architecture no longer requires Go** -> inspect active docs, CI, release, doctor, and install path after cutover
- **Operator install/run/doctor/upgrade/uninstall remain available** -> `scripts/test-installers.sh dist/releases`, installer scripts, `dh --help`, `dh --version`, doctor flows
- **Release lifecycle no longer depends on Go** -> `make release-all`, release workflow review, `scripts/verify-release-artifacts.sh dist/releases`
- **Smoke lifecycle remains usable** -> deterministic smoke and provider-backed smoke in existing workflow paths
- **Doctor no longer reports missing Go as supported-path requirement** -> `npm run check`, `npm test`, doctor snapshot capture/check flow
- **No hidden active Go dependency remains** -> review all active workflow/build/docs surfaces identified in Slice 1

## Integration Checkpoint
- Required checkpoint before any active Go retirement:
  1. Rust-generated release artifacts exist under the supported release layout.
  2. Artifact verification passes.
  3. Installer lifecycle checks pass.
  4. Doctor/readiness points at the Rust-backed path and remains informative.
  5. Smoke passes on the Rust-backed release candidate.
  6. Active CI/release workflows no longer require Go.

## Rollback Notes
- Keep the current Go path available only as a temporary rollback surface until the integration checkpoint passes.
- Roll back as a single compatibility unit if the Rust cutover breaks release, doctor, installer lifecycle, or smoke behavior.
- Do not perform partial rollback where CI/docs stop requiring Go but the actual release/runtime path still depends on it.
- Triggers for rollback: broken release artifact contract, degraded doctor fidelity, failed installer lifecycle, failed smoke, or hidden Go dependency discovered late.

## Reviewer Focus Points
- Verify the implementation removes Go from active supported workflows, not just from documentation.
- Confirm release artifact naming/layout remains compatible with installer and smoke expectations.
- Confirm `doctor` preserves lifecycle classification quality while removing Go-specific supported-path checks.
- Confirm CI/release workflows no longer depend on `actions/setup-go`, `go test`, or Go build steps.
- Block any broad cleanup or redesign that is not required for parity-preserving cutover.

## Non-Goals
- Rewriting every historical or archive-only Go reference immediately
- Broad CLI/TUI/workflow UX redesign
- Net-new operator features unrelated to Go removal
- Performance or platform expansions beyond current documented behavior
- Indefinite dual-runtime support
