---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: WINDOWS-UNSUPPORTED-INSTALL-TRUTH
feature_slug: windows-unsupported-install-truth
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Windows Unsupported Install Truth

WINDOWS-UNSUPPORTED-INSTALL-TRUTH hardens the current release/install lifecycle so Windows runtime install and upgrade attempts are rejected with explicit unsupported messaging until real Windows release assets and a PowerShell installer exist. The feature is intentionally bounded to truth alignment across install, upgrade, release docs, and tests; it must not implement Windows runtime parity or claim Windows support.

## Goal

- Make Windows runtime install and upgrade truth explicit, consistent, and inspectable across touched operator surfaces.
- Prevent Windows users from receiving ambiguous POSIX-only failures, missing-asset errors, or wording that implies Windows release parity.
- Preserve the current supported runtime install boundary: macOS/Linux prebuilt release paths only, with Windows unsupported until `dh-windows-*.exe` artifacts and a PowerShell installer exist.

## Target Users

- Windows operators who attempt to install or upgrade the prebuilt `dh` runtime and need a clear unsupported answer.
- Release maintainers who must avoid publishing or documenting unsupported platform claims.
- QA/reviewers who need tests and docs to make unsupported Windows behavior inspectable.

## Problem Statement

- Existing migration and release-hardening artifacts establish that Windows runtime packaging is not implemented: release assets currently cover macOS/Linux, no Windows runtime installer exists, and Windows should fail clearly as unsupported until `dh-windows-*.exe` artifacts and a PowerShell installer exist.
- The release/install runbook currently says no Windows runtime installer is implemented, but operator-facing install and upgrade paths can still drift if unsupported Windows checks, GitHub release messaging, release docs, and installer tests do not all state the same truth.
- This creates support risk: Windows users may infer a broken installer or missing asset problem instead of an intentionally unsupported runtime install path.
- This feature closes that truth gap without adding Windows binaries, a PowerShell installer, or Windows runtime support.

## In Scope

- Windows unsupported messaging for current runtime install and upgrade surfaces that are already present in the repository, including release-directory, direct-binary, and GitHub-release install/upgrade paths where applicable.
- Release documentation updates needed to keep support boundaries consistent, especially `docs/operations/release-and-install.md` and any directly touched README/changelog/help text.
- Release artifact truth wording that keeps current shipped targets bounded to macOS/Linux and states that Windows runtime assets are absent.
- Tests or scripted assertions needed to prove Windows unsupported behavior and messaging stay consistent across touched install/upgrade paths.
- Operator-visible output rules for unsupported Windows runtime install/upgrade attempts, including clear condition, reason, and next-step guidance.
- Preservation of existing release-hardening behavior for non-Windows install/upgrade paths.

## Out of Scope

- Implementing Windows runtime parity.
- Creating or publishing `dh-windows-*.exe` release artifacts.
- Creating a PowerShell runtime installer or upgrader.
- Adding Windows CI release packaging or smoke coverage that would imply runtime support.
- Adding package-manager support for Windows ecosystems such as `winget`, Chocolatey, or Scoop.
- Changing Rust development/source bootstrap behavior except where docs need to distinguish development/source setup from runtime install support.
- Reworking unrelated release lifecycle behavior, backup/rollback behavior, artifact signing, manifest verification, or doctor semantics beyond what is necessary to keep Windows unsupported truth consistent.
- Changing workflow state, approval gates, or lane behavior.

## Main Flows

- **Flow 1 — Windows operator attempts runtime install**
  - As a Windows operator, I want the installer path to fail with explicit unsupported messaging, so that I know Windows runtime install is not available rather than misdiagnosing a missing asset or shell error.
- **Flow 2 — Windows operator attempts runtime upgrade**
  - As a Windows operator, I want upgrade paths to fail before mutation with explicit unsupported messaging, so that unsupported platform handling does not risk replacing or damaging an existing local binary.
- **Flow 3 — Operator reads release/install docs**
  - As an operator, I want docs to list current supported runtime release targets and the Windows unsupported boundary, so that I do not assume Windows parity.
- **Flow 4 — Maintainer verifies release/install behavior**
  - As a release maintainer, I want tests to assert unsupported Windows truth, so that future release hardening does not accidentally soften or contradict the unsupported platform story.

## Business Rules


### Operator/runtime truth rules

- Current runtime release support must be described as macOS/Linux prebuilt binaries only unless repository reality changes to include Windows artifacts and a Windows runtime installer.
- Windows runtime install and upgrade must be classified as `unsupported`, not `degraded`, `misconfigured`, `completed`, `noop`, or a generic missing-artifact failure.
- Unsupported Windows output must state the cause in product terms: Windows runtime release packaging/installer is not implemented yet.
- Unsupported Windows output must state the unblock condition: Windows runtime support requires `dh-windows-*.exe` release artifacts and a PowerShell installer/upgrader or equivalent implemented Windows runtime path.
- Unsupported Windows output must not direct users to run POSIX shell install scripts as if they are supported on Windows.
- Unsupported Windows output must not imply that installing Rust, MSVC Build Tools, Git Bash, WSL, or PowerShell will make the runtime installer supported.
- If source/development bootstrap docs mention Windows, they must remain separate from runtime install support and must not be presented as Windows runtime parity.
- Upgrade paths must fail before target mutation on unsupported Windows runtime conditions.
- Existing macOS/Linux success and failure semantics must not regress while adding unsupported Windows truth.
- Touched docs and scripts must use one consistent support boundary: Windows is unsupported for runtime install/upgrade until Windows assets and installer exist.

### Inspectable acceptance expectations

- The unsupported Windows contract must be inspectable in docs and tests, not only in prose from this scope package.
- Tests should assert both exit/failure behavior and human-readable unsupported messaging for each touched install/upgrade path where Windows branching can be simulated safely.
- Where real Windows execution is not available in the repository validation environment, tests may simulate platform detection, but the simulation mechanism and expected messaging must be explicit.
- Documentation must avoid future-tense support promises; it may state the concrete missing requirements for future support.

## Acceptance Criteria Matrix

- **AC1 — Runtime support boundary is explicit**
  - **Given** an operator reads touched release/install docs,
  - **when** supported runtime install targets are described,
  - **then** the docs state that current prebuilt runtime install support is macOS/Linux only and that Windows runtime install is unsupported until `dh-windows-*.exe` artifacts and a Windows installer exist.

- **AC2 — Windows install fails as unsupported**
  - **Given** a runtime install path is invoked under Windows or simulated Windows platform detection,
  - **when** the path evaluates platform support,
  - **then** it exits before install mutation and reports `unsupported` or equivalent explicit unsupported condition with a reason tied to missing Windows runtime packaging/installer.

- **AC3 — Windows upgrade fails before mutation**
  - **Given** a runtime upgrade path is invoked under Windows or simulated Windows platform detection,
  - **when** the path evaluates platform support,
  - **then** it exits before replacing any target binary and reports explicit Windows runtime upgrade unsupported messaging.

- **AC4 — GitHub release path does not degrade into missing-asset ambiguity**
  - **Given** a GitHub release install or upgrade path resolves assets for a Windows host,
  - **when** no `dh-windows-*.exe` release asset exists,
  - **then** the operator-visible result is an unsupported Windows runtime message, not only a generic 404, checksum, download, or asset-not-found error.

- **AC5 — No Windows parity claim appears in touched surfaces**
  - **Given** touched scripts, docs, tests, README/changelog wording, or lifecycle output mention platform support,
  - **when** they describe Windows,
  - **then** they do not claim Windows runtime install support, Windows release parity, or a working Windows installer.

- **AC6 — Development/source setup remains separate**
  - **Given** touched docs mention Windows development/source prerequisites such as Rust, MSVC Build Tools, Windows SDK, or PowerShell,
  - **when** a reader follows runtime install guidance,
  - **then** those development prerequisites are not presented as a supported runtime install path.

- **AC7 — macOS/Linux lifecycle behavior is preserved**
  - **Given** existing macOS/Linux release-directory, direct-binary, and GitHub release install/upgrade scenarios,
  - **when** this feature is implemented,
  - **then** their existing supported-path success/failure, verification-tier, backup/rollback, and limitation messaging remains behaviorally unchanged except for any added clarification that does not alter outcomes.

- **AC8 — Tests lock unsupported truth**
  - **Given** the repository test suite or installer test script is run for this feature,
  - **when** Windows platform behavior is tested directly or by simulation,
  - **then** tests assert unsupported classification, no mutation for upgrade, and consistent unsupported wording for each touched Windows install/upgrade path.

- **AC9 — Solution-ready handoff**
  - **Given** this scope package,
  - **when** Solution Lead begins planning,
  - **then** they can inventory touched install/upgrade/doc/test surfaces and design the smallest implementation without deciding whether to add Windows runtime support.

## Edge Cases

- A Windows user runs a POSIX shell script through Git Bash, MSYS, Cygwin, or WSL-like environments; messaging must not accidentally imply native Windows runtime support.
- A release manifest or `SHA256SUMS` later contains a Windows-looking filename without a working Windows installer; docs/output must not infer full support from filename presence alone.
- A GitHub release lookup for Windows assets fails with network, auth, or not-found errors; unsupported platform truth should be distinguishable from transient download failures when the host platform itself is unsupported.
- A direct-binary install is pointed manually at a Windows executable-like file; this feature does not validate or support a Windows runtime path unless the repository implements the full asset and installer contract.
- Existing non-Windows upgrade rollback tests must continue to distinguish pre-mutation blocked outcomes from post-mutation failures.
- Windows development/source bootstrap references may exist separately; they must remain clearly non-runtime and not become an implied installer workaround.

## Error And Failure Cases

- The feature fails if a Windows install or upgrade attempt reaches mutation before unsupported platform rejection.
- The feature fails if Windows users see only generic `asset not found`, `unsupported architecture`, checksum, shell, or download errors when the real product condition is unsupported Windows runtime install.
- The feature fails if touched docs or lifecycle output imply that Windows runtime support exists today.
- The feature fails if adding unsupported checks weakens macOS/Linux release verification, backup/rollback, or success/failure reporting.
- The feature fails if tests only check prose/docs but do not lock at least one executable unsupported Windows install/upgrade behavior path.
- The feature fails if implementation adds Windows runtime assets, package-manager integration, or a PowerShell installer under this feature.

## Open Questions

- None blocking for Solution Lead planning.
- Non-blocking solution choice: decide whether unsupported Windows branching should be centralized in a shared installer helper or kept local to touched scripts, provided the final behavior and tests stay consistent.
- Non-blocking validation choice: decide the safest repository-supported way to simulate Windows platform detection in installer tests without requiring a Windows runner.

## Success Signal

- Windows runtime install and upgrade attempts fail early with explicit unsupported messaging and no parity overclaim.
- Release/install docs and touched lifecycle outputs tell the same support story: macOS/Linux prebuilt runtime install is supported; Windows runtime install is not implemented yet.
- Automated or scripted tests make the unsupported Windows contract inspectable and prevent future drift.
- Existing supported macOS/Linux release lifecycle behavior remains intact.

## Handoff Notes For Solution Lead

- Keep this feature narrow: truth hardening only, not Windows enablement.
- Start by inventorying current installer/upgrade scripts, release docs, and installer tests that mention or infer platform support; touch only the minimum set needed for consistent unsupported Windows truth.
- Preserve the RELEASE-HARDENING-V2 bounded trust model and backup/rollback semantics while adding Windows unsupported checks.
- Ensure upgrade unsupported checks happen before any target mutation.
- If implementation discovers actual Windows runtime assets or installer surfaces already exist, re-check repository reality and route back to Product Lead before changing the support boundary.
