---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RELEASE-HARDENING-V2
feature_slug: release-hardening-v2
source_scope_package: docs/scope/2026-04-19-release-hardening-v2.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Release Hardening V2

## Chosen Approach
- Harden the existing release/install lifecycle around a **tiered verification model** instead of forcing every path to parity. The local release-directory path remains the strongest supported trust path because it can verify `manifest.json`, `SHA256SUMS`, on-disk file size/checksum truth, and optional signatures. GitHub-release and direct-binary paths remain intentionally narrower, but they must say exactly what they did and did not verify.
- Keep the current product boundary intact: this feature updates existing release scripts, installer/upgrader behavior, uninstall behavior, doctor guidance, and touched docs so they tell one inspectable story. It does **not** add new package-manager ecosystems, new runtime platforms, or workflow/runtime architecture changes.
- This is enough because the approved scope is about release artifact truth, lifecycle outcome truth, backup/rollback truth, doctor boundary clarity, and wording consistency across current surfaces.

## Impacted Surfaces
- Release packaging and artifact-verification truth:
  - `scripts/package-release.sh`
  - `scripts/sign-release.sh`
  - `scripts/verify-release-artifacts.sh`
  - `scripts/checksum-from-sha256s.sh`
  - `scripts/resolve-release-binary.sh`
- Direct and release-directory lifecycle entrypoints:
  - `scripts/install.sh`
  - `scripts/upgrade.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/uninstall.sh`
- GitHub release lifecycle entrypoints:
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
- Validation harnesses and lifecycle regression checks:
  - `scripts/test-installers.sh`
  - `scripts/check-doctor-snapshot.mjs`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
- Doctor/readiness boundary surfaces:
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
- Operator-facing docs and release-facing wording:
  - `docs/operations/release-and-install.md`
  - `README.md`
  - `CHANGELOG.md`
- Conditional doc touch only if wording drift remains after primary updates:
  - `docs/homebrew.md`

## Boundaries And Components
- **Release bundle truth owner:** `scripts/package-release.sh` and `scripts/sign-release.sh` produce the bounded release artifact set; `scripts/verify-release-artifacts.sh` is the authoritative verifier for local release-directory trust.
- **Lifecycle execution layer:** `scripts/install.sh`, `scripts/upgrade.sh`, and `scripts/uninstall.sh` are the low-level mutation surfaces for binary install/replace/remove behavior.
- **Path-specific operator entrypoints:**
  - `install-from-release.sh` / `upgrade-from-release.sh` = strongest supported operator path for verified local release bundles.
  - `install-github-release.sh` / `upgrade-github-release.sh` = narrower remote download path.
  - `install.sh` / `upgrade.sh` with raw binaries = bounded manual path.
- **Doctor boundary:** `dh doctor` remains a product/install/workspace health surface with the existing classes `install/distribution`, `runtime/workspace readiness`, and `capability/tooling`. It must not become a lifecycle success proxy or a workflow-state/policy surface.
- **Out-of-scope boundaries to preserve:**
  - no new package-manager expansion beyond the currently documented flows
  - no Windows installer/runtime parity work
  - no workflow-state, approval-gate, or lane-model changes
  - no rollback promises for workspace state, indexes, config, or project data

## Interfaces And Data Contracts
### Release bundle contract
- A release bundle is artifact-complete only when it contains:
  - at least one shipped `dh-*` binary for currently supported targets
  - `SHA256SUMS`
  - `manifest.json`
- `manifest.json` remains the local release metadata contract with existing top-level shape:
  - `version`
  - `generatedAt`
  - `files[]` entries containing `name`, `sha256`, and `sizeBytes`
- `scripts/verify-release-artifacts.sh` must remain the source of truth for local release-directory verification and must fail on missing metadata, missing files, checksum drift, malformed manifest entries, or file-size drift.
- Signature artifacts stay optional. When `.sig` artifacts are present on a touched path, the final operator-visible result must say whether signatures were:
  - `verified`
  - `skipped`
  - `unavailable` to verify
  - `absent`

### Verification-tier contract
- The implementation should preserve three bounded verification tiers and prevent wording drift between them:
  - **Release-directory verified:** manifest + checksum + file-size truth, plus optional signature verification when available
  - **GitHub-release bounded:** downloaded asset verified against `SHA256SUMS`, with optional signature verification when the script actually downloads and validates signatures; this path must never claim manifest/file-size verification unless it truly performs it
  - **Direct-binary bounded/manual:** explicit SHA, sidecar SHA, optional sidecar signature, or raw binary copy with no release-metadata proof; this path must never read as equivalent to release-directory verification

### Lifecycle result contract
- Every touched operator-facing lifecycle command should emit one consistent terminal summary shape for success, noop, and bounded failure paths:
  - `surface`
  - `condition`
  - `why`
  - `works`
  - `limited`
  - `next`
- Lifecycle `condition` vocabulary should stay bounded and inspectable:
  - `completed` = command-scope success
  - `noop` = no change was needed or nothing existed at the target path
  - `blocked` = preflight or verification gate prevented safe completion before claiming success
  - `failed` = post-mutation verification or rollback path failed and the command cannot honestly report completion
- `limited` must carry meaningful narrowing instead of being treated as decorative text. In particular it must stay non-empty when:
  - manifest verification did not run
  - signature verification was skipped/unavailable
  - the path was checksum-only
  - the path was raw direct-binary/manual
  - runtime/workspace readiness still requires `dh doctor`

### Replacement / backup / rollback fact contract
- Replacement flows must preserve and surface these facts through the final lifecycle summary, whether implemented by shared helper, structured verifier output, or script-local state:
  - whether an existing target binary was present
  - whether a binary backup was created
  - which post-install verification was attempted
  - whether rollback was attempted
  - whether rollback succeeded, failed, or was unavailable because no backup existed
- Backup/rollback scope remains limited to the installed binary at the target path.

### Structured verifier handoff
- To avoid caller-specific paraphrasing drift, `scripts/verify-release-artifacts.sh` should keep its exit-code behavior and add an inspectable structured mode for callers that exposes at least:
  - release metadata completeness
  - checksum verification result
  - manifest verification result
  - signature status
  - warnings/limitations
- `install-from-release.sh` and `upgrade-from-release.sh` should consume that structured result instead of re-stating verification strength from assumption.

### Doctor boundary contract
- `dh doctor` keeps its existing health vocabulary (`healthy`, `degraded`, `unsupported`, `misconfigured`) and existing output boundary.
- Lifecycle commands may report `completed` / `noop` / `blocked` / `failed`, but they must not imply `dh doctor` already proved runtime/workspace health.

## Risks And Trade-offs
- **Chosen trade-off:** do **not** force GitHub-release install/upgrade to full manifest parity. Keeping that path checksum-bounded with explicit limitation is simpler and safer than pretending remote download parity with local verified bundles.
- Adding a structured verifier result introduces small shell complexity, but it is the cleanest way to stop `install-from-release` and `upgrade-from-release` from overclaiming verification strength.
- If lifecycle summaries are standardized in multiple scripts without one shared contract, drift will return quickly; the implementation should centralize the contract logically even if it does not create a new helper file.
- Post-install verification and rollback wording is easy to overstate. Fresh installs must not claim backup/rollback protection that only exists on replacement flows.
- Docs already mention Homebrew and GitHub release paths. If touched wording is not reconciled together, operator trust will remain inconsistent even if the scripts improve.

## Recommended Path
- Make `scripts/verify-release-artifacts.sh` the explicit authority for strong local release verification and expose its result in a structured, caller-consumable way.
- Keep `install-from-release.sh` and `upgrade-from-release.sh` as the strongest supported operator path and require them to report the exact verification facts returned by the verifier.
- Keep GitHub-release and direct-binary flows available, but make them visibly narrower:
  - GitHub path = checksum-anchored remote install/upgrade, optional signatures if actually validated
  - direct path = bounded manual path with only the checksum/signature proof actually supplied
- Standardize lifecycle outcome reporting across install, upgrade, uninstall, and release verification so backup creation, rollback outcome, unsupported platform, noop behavior, and next-step guidance are consistent.
- Align README/runbook/doctor wording only after the script behavior is settled, so docs describe shipped truth rather than aspirational behavior.

## Dependencies
- No new package-manager ecosystem or runtime-platform dependency should be introduced for this feature.
- Implementation depends on existing repository capabilities only:
  - shell scripts under `scripts/`
  - `node` for verifier/doctor logic already used in-repo
  - existing Make/npm/cargo validation commands already present in `Makefile` and `package.json`
  - optional `gpg`, `curl`, `shasum`/`sha256sum` only where the current scripts already depend on them
- If the GitHub installer paths need automated coverage, add a **test seam** such as a base-URL override for fixture-backed downloads rather than a new distribution mechanism.

## Implementation Flow
1. **Freeze the verification tiers and lifecycle summary contract first.** Do not edit docs first.
2. **Harden the authoritative verifier and packaging truth** so local release-directory verification yields inspectable metadata/checksum/manifest/signature facts.
3. **Thread those facts through install/upgrade paths** so release-directory, GitHub, and direct-binary flows each report the exact verification level they performed.
4. **Finalize replacement/rollback truth** so fresh install, replacement install, upgrade, rollback success, rollback failure, and rollback-unavailable states are distinguishable.
5. **Align doctor guidance and docs last** so README/runbook/changelog reflect the implemented lifecycle contract and supported-platform boundaries.
6. **Close with validation that exercises both strong and narrow paths** before handing to Code Review/QA.

## Implementation Slices
### Slice 1: authoritative release bundle verification
- **Files:**
  - `scripts/package-release.sh`
  - `scripts/sign-release.sh`
  - `scripts/verify-release-artifacts.sh`
  - `scripts/checksum-from-sha256s.sh`
  - `scripts/resolve-release-binary.sh`
- **Goal:** keep release-directory verification as the strongest bounded trust path and make its result inspectable enough for downstream lifecycle scripts.
- **Validation Command:**
  - `make release-all VERSION=test`
  - `scripts/verify-release-artifacts.sh dist/releases`
- **Details:**
  - Preserve the existing bundle completeness rule: binary + `SHA256SUMS` + `manifest.json`.
  - Preserve existing manifest shape unless a change is strictly necessary for inspectability.
  - Add structured verifier output for callers so signature status and limitation state are machine-readable, not only warning text.
  - Keep signature verification optional, but never silent when signature artifacts are present.
  - Reviewer focus: local release verification is the only path allowed to claim manifest/file-size truth unless another path actually implements it.

### Slice 2: lifecycle outcome contract for direct and local release paths
- **Files:**
  - `scripts/install.sh`
  - `scripts/upgrade.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/uninstall.sh`
- **Goal:** standardize install/upgrade/uninstall outcomes so operators can tell exactly what changed, what was verified, and what rollback protection existed.
- **Validation Command:**
  - `scripts/test-installers.sh dist/releases`
- **Details:**
  - Direct-binary install/upgrade must classify their verification path truthfully: explicit SHA, sidecar SHA, optional signature, or raw/manual.
  - Release-directory install/upgrade must consume the structured verifier result from Slice 1 and surface manifest/checksum/signature truth without overclaim.
  - Replacement flows must surface whether a backup existed, whether the new binary passed post-install verification, and whether rollback was needed/succeeded/failed/unavailable.
  - Fresh install on an empty target path must not claim backup creation or rollback safety that did not exist.
  - Uninstall must keep `completed` vs `noop` explicit and continue to direct operators to `which dh` for PATH verification.

### Slice 3: GitHub release path hardening without parity overclaim
- **Files:**
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
  - `scripts/test-installers.sh`
- **Goal:** keep GitHub release install/upgrade usable while making their narrower verification floor and rollback behavior explicit.
- **Validation Command:**
  - `scripts/test-installers.sh dist/releases`
- **Details:**
  - Preserve current macOS/Linux asset resolution and current bounded distribution scope.
  - Do not claim local release-directory parity unless manifest verification is truly added; the recommended path is to keep GitHub flows checksum-bounded and explicit.
  - If signature artifacts are downloadable and verified, report that. If they are skipped, unavailable, or not fetched, report that instead of implying full verification.
  - Add a bounded fixture/test seam so GitHub install/upgrade behavior can be exercised without live network dependence; do not leave this path validation-only-by-conversation.
  - Reviewer focus: unsupported platform wording, checksum-only wording, and rollback wording must stay consistent with Slice 2.

### Slice 4: doctor and documentation alignment
- **Files:**
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
  - `scripts/check-doctor-snapshot.mjs`
  - `docs/operations/release-and-install.md`
  - `README.md`
  - `CHANGELOG.md`
  - `docs/homebrew.md` only if touched to remove contradiction
- **Goal:** keep lifecycle guidance, doctor boundary wording, and supported-platform/distribution messaging consistent with the implemented script behavior.
- **Validation Command:**
  - `npm run check`
  - `npm test -- packages/runtime/src/diagnostics/doctor.test.ts`
- **Details:**
  - Preserve doctor as product/install/workspace health only.
  - Ensure docs explicitly distinguish install/upgrade success from runtime/workspace readiness and workflow-state status.
  - Ensure touched docs state that macOS/Linux prebuilt binaries are the bounded supported runtime install path and Windows parity remains unsupported.
  - If `docs/homebrew.md` is touched, keep it framed as current macOS distribution documentation, not new ecosystem expansion.
  - Reviewer focus: `README.md`, runbook, doctor output, and script summaries must use the same verification-tier story.

## Dependency Graph
- Critical path: `Slice 1 -> Slice 2 -> Slice 3 -> Slice 4`
- Slice 1 must land first because it defines the authoritative verification facts that release-directory flows need.
- Slice 2 must land before Slice 3 because GitHub and direct paths should reuse the same lifecycle outcome contract for backup/rollback/limited wording.
- Slice 4 must land last so docs and doctor guidance describe settled behavior instead of shaping it speculatively.

## Parallelization Assessment
- parallel_mode: `none`
- why: the same operator contract spans release verification, install/upgrade/uninstall summaries, backup/rollback facts, GitHub/download messaging, doctor boundary wording, and README/runbook text. Parallel execution would create high risk of contradictory truth claims across overlapping scripts and docs.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4`
- integration_checkpoint: run the full release/install validation sequence and compare one strong path, one narrow path, one rollback path, one noop uninstall path, and doctor boundary wording together before Fullstack hands off to Code Review.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix
- **AC1 / AC2 / AC3 — release bundle truth, drift rejection, signature truth**
  - **Validation path:**
    - `make release-all VERSION=test`
    - `scripts/verify-release-artifacts.sh dist/releases`
    - negative-path coverage in `scripts/test-installers.sh dist/releases` for missing manifest / missing checksum metadata / signature-skipped cases
- **AC4 / AC5 / AC6 — install and upgrade verification gating, narrower path honesty, bounded success messaging**
  - **Validation path:**
    - `scripts/test-installers.sh dist/releases`
    - fixture-backed GitHub installer coverage added as part of Slice 3
    - manual spot-check only if a new fixture seam genuinely cannot be added, and that limitation must be recorded explicitly
- **AC7 / AC8 / AC9 — backup creation and rollback truth**
  - **Validation path:**
    - `scripts/test-installers.sh dist/releases` extended to cover replacement, failed post-install verification, rollback success, and no-backup/fresh-install behavior
- **AC10 — uninstall completed vs noop**
  - **Validation path:**
    - `scripts/test-installers.sh dist/releases` for both removal and noop cases
- **AC11 / AC14 / AC15 — doctor boundary, runtime-prerequisite honesty, non-blocking limitation visibility**
  - **Validation path:**
    - `npm run check`
    - `npm test -- packages/runtime/src/diagnostics/doctor.test.ts`
    - targeted manual review of touched lifecycle output strings against `packages/runtime/src/diagnostics/doctor.ts`
- **AC12 / AC13 — bounded support messaging and no dev-bootstrap overclaim**
  - **Validation path:**
    - manual review of `README.md`, `docs/operations/release-and-install.md`, and `docs/homebrew.md` if touched
    - confirm script output still matches documented macOS/Linux bounded support and opt-in Rust bootstrap language
- **Repository-level regression check before handoff from Fullstack:**
  - `npm run check`
  - `npm test`
  - `cargo test --workspace --manifest-path rust-engine/Cargo.toml`
  - `make release-all VERSION=test`
  - `scripts/verify-release-artifacts.sh dist/releases`
  - `scripts/test-installers.sh dist/releases`

## Integration Checkpoint
- Compare all touched lifecycle endings in one pass before Code Review:
  - local release-directory install success
  - local release-directory upgrade success
  - GitHub install/upgrade success with explicit narrower verification wording
  - one blocked verification path
  - one rollback path
  - uninstall `noop`
- Confirm all of the following are simultaneously true:
  - only release-directory verification claims manifest/file-size truth
  - GitHub/direct paths state narrower verification scope in `limited`
  - backup/rollback messages refer only to the target binary path
  - `dh doctor` still says it is a product/install/workspace health surface and does not imply lifecycle or workflow success
  - touched docs match the script outputs rather than an older or broader story

## Rollback Notes
- Preserve the existing release bundle format and installer entrypoint names. Do not ship this feature by renaming or replacing the current operator scripts.
- If structured verification output from `verify-release-artifacts.sh` destabilizes callers, keep the existing exit-code behavior as the compatibility baseline and narrow the new structured mode until it is stable.
- If lifecycle summary refactoring causes installer regressions, prefer reverting summary plumbing over weakening release verification or backup/rollback protection.
- Keep any GitHub-path test seam default-off and test-only; it must not become a new public distribution mode.
- Do not let rollback wording expand beyond binary replacement. Workspace/config/index/project-state rollback remains out of scope.
- Do not merge doc-only wording that promises behavior the scripts do not actually perform.

## Reviewer Focus Points
- Reject any path other than the local release-directory verifier that claims manifest/file-size verification unless the code truly added that verification.
- Reject any `limited: none` or equivalent message when signatures were skipped/unavailable, manifest verification did not run, or the path was otherwise narrower than the strongest local release flow.
- Verify fresh install, replacement install, upgrade, rollback success, rollback failure, and rollback-unavailable states are distinguishable in operator-visible output.
- Verify uninstall still distinguishes `completed` from `noop` honestly.
- Verify `dh doctor` remains in its lane: install/distribution, runtime/workspace readiness, capability/tooling; no workflow-state or approval-gate implication.
- Reject Windows parity claims, package-manager ecosystem expansion, or “fully verified everywhere” language that exceeds current repository reality.
- Verify touched docs (`README.md`, runbook, changelog, and Homebrew doc only if touched) tell the same bounded story as the scripts.
