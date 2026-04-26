---
artifact_type: solution_package
version: 1
status: draft
feature_id: POSIX-TARGET-PLATFORM-CLARITY
feature_slug: posix-target-platform-clarity
source_scope_package: docs/scope/2026-04-24-posix-target-platform-clarity.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Posix Target Platform Clarity

## Recommended Path

Use a documentation-first alignment pass over current product, operator, release, install, and user-facing surfaces so the supported platform target is stated as **Linux and macOS** wherever support is described. Make only lightweight script/test wording changes when an existing release/install lifecycle message or existing installer test currently implies Windows parity or generic cross-platform support.

This is enough because the approved scope package (`docs/scope/2026-04-24-posix-target-platform-clarity.md`) is explicitly inspectability-oriented: it preserves runtime behavior, rejects Windows parity/hardening work, and asks for supported-platform truth across docs and release/install wording rather than platform-detection implementation.

## Impacted Surfaces

Primary files to inspect and likely edit:

- `README.md` — current product landing/install surface; already states macOS/Linux in several places, but should add explicit “Windows is not a current target” support boundary near the platform/install sections if absent.
- `docs/user-guide.md` — end-user install guide; should state that the guide targets macOS and Linux and does not cover Windows install support.
- `docs/operations/release-and-install.md` — operator release/install runbook; must change the current Windows support note from “not implemented yet” / “parity remains unsupported” semantics to the approved product truth that Windows is not a target platform for this product scope.
- `.github/release-notes.md` — release-facing install notes; should identify included artifacts as Linux/macOS supported targets and avoid generic platform wording.
- `CHANGELOG.md` — release-facing current change summary; add a concise Unreleased entry for Linux/macOS platform-support clarity if implementation touches user/operator surfaces.

Secondary files to inspect and edit only if their active wording conflicts with the target truth:

- `scripts/install-github-release.sh` — existing lifecycle summary currently appends `Windows runtime installer parity remains unsupported`; if retained, reword to “Windows is not a current target platform; supported release install targets are Linux and macOS” without changing platform behavior.
- `scripts/upgrade-github-release.sh` — inspect for the same lifecycle-summary wording as install and align only if present.
- `scripts/test-installers.sh` — update only existing assertions that expect the old “Windows parity remains unsupported” wording; do not add Windows execution simulation or unsupported-install tests.
- `scripts/resolve-release-binary.sh`, `scripts/install-from-release.sh`, `scripts/upgrade-from-release.sh`, `scripts/install.sh`, `scripts/upgrade.sh`, `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh` — inspect for support-language drift; edit wording only if they imply broader support. Do not change resolver behavior except text that names `darwin, linux`.
- `docs/adr/2026-04-05-phase15-release-packaging-contract.md` — historical accepted ADR can stay as-is if factual, but if active readers may treat it as current support policy, add a short note pointing to current Linux/macOS target wording rather than rewriting history.

Do not edit archived/historical scope packages such as `docs/scope/2026-04-24-windows-unsupported-install-truth.md` unless an active current doc links to them as current policy. They can remain historical evidence of the blocked/cancelled direction.

## Boundaries And Components

- **Product/support boundary**: current supported product targets are Linux and macOS. Windows is not supported, not near-term parity, and not a release-readiness requirement under this feature.
- **Implementation boundary**: this solution permits docs and wording-only script/test assertion changes. It forbids adding Windows installer logic, PowerShell flows, Windows assets, Windows CI, Windows packaging, Windows runtime platform-detection hardening, or Windows unsupported-install behavior.
- **Release/install boundary**: keep the existing release artifact set (`dh-darwin-arm64`, `dh-darwin-amd64`, `dh-linux-amd64`, `dh-linux-arm64`) and existing trust-tier distinctions intact. The change is support-language clarity, not release architecture redesign.
- **Path-model boundary**: preserve the difference between product install/runtime surfaces (`dh`, release scripts, GitHub release notes) and repository-local compatibility/workflow surfaces (`.opencode/`, workflow-state CLI). Do not collapse these into one install story.
- **Historical boundary**: references to the prior Windows-specific hardening work should say it was blocked/cancelled because Windows is not a target platform, not deferred pending implementation.

Responsibilities:

- **FullstackAgent**: perform the narrow wording alignment and adjust any existing text-based assertions that break because old wording changed.
- **Code Reviewer**: first verify scope compliance (no Windows support/hardening implementation), then review wording consistency and path-model preservation.
- **QAAgent**: validate current docs/release/install surfaces show Linux/macOS support clearly and that any retained Windows references explicitly mark Windows as not targeted/out of scope.

## Interfaces And Data Contracts

- No public CLI flags, environment variables, file formats, release artifact names, or workflow-state schemas should change.
- Existing install/upgrade lifecycle output fields (`surface`, `condition`, `why`, `works`, `limited`, `next`) may have wording updates only where they currently carry platform-support language.
- Existing installer tests may be updated to assert the new Linux/macOS target wording, but they must remain runnable on non-Windows hosts and must not simulate Windows support behavior for this feature.

## Risks And Trade-offs

- **Risk: accidental Windows hardening scope creep.** Mitigation: any code change beyond wording/assertion updates is out of scope unless the implementation discovers an active current surface that cannot be made truthful without changing text generation.
- **Risk: overcorrecting historical artifacts.** Mitigation: leave archived or prior blocked/cancelled work items intact unless they are presented by current docs as active policy.
- **Risk: generic wording remains in release/install output.** Mitigation: inspect active docs and scripts for `Windows`, `cross-platform`, `all platforms`, `platform independent`, and `supported platforms`; constrain or replace ambiguous wording.
- **Risk: validation command depends on generated release artifacts.** Mitigation: docs/text validation does not require generated artifacts; only run `scripts/test-installers.sh dist/releases` if `dist/releases` exists and is suitable in the implementation environment.

## Implementation Slices

### Slice 1: Product and user-facing platform truth

- **Files**: `README.md`, `docs/user-guide.md`, `CHANGELOG.md`
- **Goal**: Make the primary product and user-facing install story say that `dh` serves Linux and macOS, and that Windows is not a current target platform.
- **Details**:
  - Keep existing macOS/Linux architecture lists factual; do not add distro certification, macOS architecture promises beyond existing artifact names, or future platform commitments.
  - Add or adjust a compact support-boundary note near install/platform sections rather than restructuring the full documents.
  - If `CHANGELOG.md` is touched, add a short Unreleased `Changed`/`Documentation`-style bullet focused on Linux/macOS support clarity.
- **Validation hook**: targeted text review plus repository text search for ambiguous platform wording in these files.

### Slice 2: Operator release/install wording alignment

- **Files**: `docs/operations/release-and-install.md`, `.github/release-notes.md`, optionally `docs/adr/2026-04-05-phase15-release-packaging-contract.md` if active ambiguity remains.
- **Goal**: Ensure release/runbook wording presents the shipped artifact set as Linux/macOS support and does not imply Windows readiness, Windows parity, or generic all-platform support.
- **Details**:
  - In `docs/operations/release-and-install.md`, replace “Windows runtime installer is not implemented yet” style wording with the approved product truth: supported release/install targets are Linux and macOS; Windows is not a current target platform and Windows-specific hardening/release assets are out of scope unless a future product decision changes that.
  - In `.github/release-notes.md`, label included artifacts as Linux/macOS supported artifacts.
  - Preserve trust-tier, checksum, manifest, signature, rollback, and doctor-boundary wording.
- **Validation hook**: targeted text review and search for retained Windows/cross-platform/all-platform phrases in operator/release docs.

### Slice 3: Existing release/install lifecycle text and lightweight assertions

- **Files**: inspect `scripts/install-github-release.sh`, `scripts/upgrade-github-release.sh`, `scripts/test-installers.sh`; edit only if old wording is present. Inspect but avoid edits to `scripts/resolve-release-binary.sh`, `scripts/install-from-release.sh`, `scripts/upgrade-from-release.sh`, `scripts/install.sh`, `scripts/upgrade.sh`, `scripts/package-release.sh`, `scripts/verify-release-artifacts.sh` unless they contain conflicting support language.
- **Goal**: Align any existing operator-visible lifecycle wording or tests with Linux/macOS-only product target without adding Windows behavior.
- **Details**:
  - Replace phrases such as `Windows runtime installer parity remains unsupported` with wording that does not frame Windows as parity debt, for example: `supported release install targets are Linux and macOS; Windows is not a current target platform`.
  - Update existing assertions in `scripts/test-installers.sh` that expect the old phrase.
  - Do not add Windows platform simulation, PowerShell references, Windows asset lookup tests, or unsupported Windows install/upgrade handling under this work item.
- **Validation hook**: run script tests only if release artifacts are already available; otherwise document that the assertion path could not be executed because no release directory exists.

## Dependency Graph

- Critical path: Slice 1 -> Slice 2 -> Slice 3 -> Integration Checkpoint.
- Slice 1 and Slice 2 can be drafted independently because they touch separate documentation surfaces, but they should be integrated before Slice 3 so any script/test wording uses the same final phrase.
- Slice 3 depends on the final wording chosen in Slices 1-2 because tests should assert the exact new lifecycle phrase.

## Parallelization Assessment

- parallel_mode: `none`
- why: The work is small and wording consistency is the main quality risk. Parallel edits would increase the chance of divergent phrasing across docs/scripts without meaningful speed benefit.
- safe_parallel_zones: []
- sequential_constraints: [`SLICE-1 -> SLICE-2 -> SLICE-3 -> INTEGRATION-CHECK`]
- integration_checkpoint: after all slices, inspect the full changed-file set for one consistent platform truth and no Windows support/hardening implementation.
- max_active_execution_tracks: 1

## Validation Matrix

| Acceptance target | Validation path tied to repository reality |
|---|---|
| AC-1: Docs that mention supported platforms identify Linux and macOS. | Inspect changed `README.md`, `docs/user-guide.md`, `docs/operations/release-and-install.md`, `.github/release-notes.md`, and any other touched active docs. Use repository text search for `supported platforms`, `supported platform`, `macOS`, and `Linux` in touched surfaces. |
| AC-2: Release/install wording avoids Windows parity/readiness/all-platform support. | Search active docs/scripts for `Windows`, `windows`, `cross-platform`, `all platforms`, `platform independent`, `parity`, and review retained matches. Historical scope/archive references may remain if clearly historical. |
| AC-3: Prior Windows hardening context, if referenced, is accurate. | Any new/edited reference must say the prior Windows-specific hardening work was blocked/cancelled because Windows is not a target platform. Do not describe it as deferred required work. |
| AC-4: No Windows implementation work introduced. | Review final diff: no PowerShell installer, Windows asset names, Windows CI packaging, Windows platform-detection hardening, unsupported Windows install/upgrade behavior, or release asset generation changes. |
| AC-5: Operator/runtime path model preserved. | Review changed docs to ensure product install/runtime (`dh`, release scripts, GitHub release notes) stays distinct from repository-local workflow/compatibility surfaces (`.opencode/`, workflow-state CLI). |
| AC-6: Lightweight checks, if changed, are docs/metadata/text only and Windows-host independent. | If `scripts/test-installers.sh` is edited, confirm it only updates existing string assertions and still runs from a POSIX shell without requiring Windows. |
| AC-7: Final handoff can list all touched surfaces and explain Linux/macOS support. | Fullstack and QA reports should list each touched file and state how it now reflects Linux/macOS target support. |

Repository-real commands available for this work:

- `scripts/test-installers.sh dist/releases` — run only if `dist/releases` exists with usable release artifacts in the implementation environment. This is the existing installer lifecycle test surface and may validate updated script assertions.
- `node .opencode/workflow-state.js validate` — workflow-state validation only; useful as a general repository runtime sanity check if implementation touches workflow artifacts, but it does not prove platform wording acceptance.

No repo-wide build, lint, or general test command is currently defined for application code in `context/core/project-config.md`. Do not invent `npm test`, `cargo test`, or `make release-all` as required validation for this documentation/wording feature, even though historical docs mention some of those commands.

## Integration Checkpoint

Before handing to Code Reviewer, Fullstack must provide:

1. Final touched-file inventory grouped by docs, release notes, scripts, and tests.
2. Search/review summary for retained `Windows`, `cross-platform`, `all platforms`, `platform independent`, `supported platforms`, and `parity` wording, with each retained match classified as either current Linux/macOS support truth or historical/out-of-scope context.
3. Confirmation that no Windows support/hardening implementation, assets, PowerShell paths, CI packaging, or platform-detection behavior were added.
4. Validation output from `scripts/test-installers.sh dist/releases` if runnable; otherwise an explicit note that release artifacts were unavailable or unsuitable and validation was limited to text/diff review.

## Rollback Notes

- Rollback is documentation/test-text only: revert changed docs and any assertion wording updates.
- No data migration, install-state mutation, release artifact mutation, or workflow-state mutation is expected.
- If implementation accidentally changes runtime behavior, revert those behavior changes rather than expanding this solution package.

## Reviewer Focus Points

- Scope compliance first: reject any Windows installer, Windows asset, PowerShell, Windows CI, platform detection, or unsupported Windows hardening implementation.
- Check that Linux and macOS are named directly wherever current support is discussed.
- Check that Windows wording does not imply parity debt, near-term readiness, or deferred required work.
- Check that script/test edits, if any, are limited to existing lifecycle wording/assertions and do not add Windows execution requirements.
- Check that active docs preserve release trust-tier distinctions and product-runtime vs workflow-state boundary wording.
