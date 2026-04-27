---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RELEASE-FIRST-RUN-COMMAND-MISMATCH
feature_slug: release-first-run-command-mismatch
source_scope_package: docs/scope/2026-04-26-release-first-run-command-mismatch.md
owner: SolutionLead
approval_gate: solution_to_fullstack
parallel_mode: none
---

# Solution Package: Release First Run Command Mismatch

## Recommended Path

Align every current first-run, post-install, post-upgrade, quick-start, release-note, and onboarding guidance surface with the command set that the shipped Rust `dh` binary actually exposes. Replace `dh doctor` recommendations with supported command guidance such as `dh --help` for discovery, `dh status` for workspace/index status, `dh index` for indexing, and `dh ask "how does this project work?"` for the first knowledge-command flow. This is enough because the approved scope is a command-guidance hotfix: do not add a `doctor` command, alias, hidden command, or compatibility dispatch path.

## Scope Dependency

- Upstream scope package: `docs/scope/2026-04-26-release-first-run-command-mismatch.md`
- Approval context: `product_to_solution` is approved for active full-delivery hotfix `RELEASE-FIRST-RUN-COMMAND-MISMATCH`; this package is the Solution Lead handoff for `solution_to_fullstack` review.
- Command truth source: the shipped Rust binary help/command registration. Current supported user-facing commands include `init`, `status`, `index`, `parity`, `benchmark`, `host-contract`, `ask`, `explain`, `trace`, and `serve`; `dh --help` remains the authoritative discovery path.
- Boundary to preserve: this is a wording/lifecycle-output/test hotfix only. Preserve raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, and generated local state.

## Chosen Approach

- Replace stale `dh doctor` first-run guidance at the source text/fixture/snapshot level instead of making Rust accept `doctor`.
- Keep lifecycle output shape (`surface`, `condition`, `why`, `works`, `limited`, `next`) intact; only correct the unsupported command guidance inside `limited`/`next` wording.
- Use `dh --help` plus supported first-run commands as the replacement pattern. Prefer:
  - `dh --help` when the user needs command discovery.
  - `dh status` when the user needs workspace/index status.
  - `dh index` when the next step is building the index.
  - `dh ask "how does this project work?"` when the next step is exercising the knowledge path.
- Keep historical or internal references to a TypeScript compatibility `doctor` surface only if they are clearly not current shipped-Rust first-run/install guidance. User-facing README/user-guide/release/install guidance must not present `dh doctor` as the current health-check or first-run command.
- Add or update tests so they fail when active first-run/install/upgrade/README guidance reintroduces unavailable `dh doctor`.

## Impacted Surfaces

- `.github/release-notes.md`
  - Replace the First Run block so it begins with `dh --help` or supported commands instead of `dh doctor`.
- `README.md`
  - Update prerequisites, quick start, install/upgrade examples, health-check language, troubleshooting, and command-reference text that presents `doctor` as current Rust-binary guidance.
- `docs/user-guide.md`
  - Update first-run steps, command snippets, diagnostic/status language, and any `dh ask` fallback guidance that points users to `dh doctor`.
- `docs/operations/release-and-install.md`
  - Update expected install/upgrade lifecycle-output contracts so `next` guidance uses supported commands.
- Installer and upgrader scripts:
  - `scripts/install.sh`
  - `scripts/upgrade.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
  - Correct `limited` and `next` text that currently says runtime/workspace readiness requires `dh doctor` or tells users to run `$target doctor`.
- Installer tests:
  - `scripts/test-installers.sh`
  - Update assertions so lifecycle output keeps the `limited`/`next` contract while naming only supported commands.
- CLI/onboarding text and tests, where current user-facing help is in scope:
  - `apps/cli/src/commands/root.ts`
  - `apps/cli/src/commands/root.test.ts`
  - Replace first-time setup/home-screen guidance that tells users to run `dh doctor`.
- Knowledge-command fallback guidance, where it is surfaced to users on the Rust-hosted path:
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - Replace failure guidance that tells users to run `dh doctor` with `dh --help`, `dh status`, or the relevant supported command.
- Documentation wording regression tests:
  - `docs/operations/rust-host-lifecycle-wording.test.ts`
  - Add focused checks for active docs/release/install wording where practical.
- Review-only Rust command truth surface:
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs`
  - Do not add `Commands::Doctor`; use these files only to verify/help guard the supported command set.

## Boundaries And Components

- Product/documentation boundary: active first-run, install, upgrade, quick-start, README, user-guide, release-note, and onboarding guidance must name supported commands only.
- Lifecycle-output boundary: installer/upgrader scripts may continue to report that runtime/workspace readiness is not fully verified by install/upgrade lifecycle, but they must not say the next verification step is `dh doctor`.
- CLI boundary: shipped Rust command registration remains unchanged. The implementation must not add a `doctor` variant to Rust `Commands`, command dispatch, aliases, or hidden compatibility behavior.
- Test boundary: tests should protect the wording contract and command-truth contract. They should not require a new doctor implementation or mutate protected local/generated state.
- Local-state boundary: raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, and generated local state are not cleanup targets for this hotfix.

## Interfaces And Data Contracts

- Installer/upgrader lifecycle summary still emits the same human-readable fields:
  - `surface`
  - `condition`
  - `why`
  - `works`
  - `limited`
  - `next`
- Replacement wording must keep `limited` truthful. Acceptable pattern: install/upgrade verifies binary installation and release artifacts where applicable, while deeper workspace/index readiness should be checked with supported commands such as `dh status`, `dh index`, `dh ask ...`, and `dh --help`.
- Any command list in docs or lifecycle output must match shipped Rust command truth. If implementation verifies that an example needs required flags from `dh --help`, include those flags rather than simplifying into an invalid command.
- Existing JSON/report contracts for unrelated runtime diagnostics must not be changed unless they directly emit first-run/install guidance covered by this hotfix.

## Risks And Trade-offs

- Some repository surfaces still contain a TypeScript compatibility `doctor` implementation. Removing all code-level references would exceed this hotfix. The right review question is whether current user-facing first-run/install/upgrade guidance still presents `dh doctor` as available in the shipped Rust binary.
- A broad text replacement could damage historical/internal docs or tests. Prefer targeted edits to active release, install, README/user-guide, onboarding, and lifecycle-output wording.
- `dh index`/`dh status` examples must be validated against actual Rust help. If the built binary requires flags for a command, the docs and scripts should use the exact valid form.
- Installer tests may require release artifacts in `dist/releases/`. If artifacts are absent, the validation report must state that installer end-to-end validation is unavailable until release artifacts are built; do not substitute unrelated OpenKit workflow checks as proof.
- Existing broad `npm test` may cover unrelated runtime areas. Failures outside command-guidance surfaces should be classified separately unless directly caused by this hotfix.

## Dependencies

- Additional packages: none expected.
- Environment variables: none required for implementation.
- Existing validation commands/surfaces:
  - `npm run check` for TypeScript type validation.
  - `npm test` / targeted Vitest paths for docs, CLI, and knowledge-command wording tests.
  - `scripts/test-installers.sh dist/releases` when release artifacts exist.
  - `cargo test -p dh-engine --test host_contract_cli_test` from `rust-engine/` for Rust command-truth coverage when Rust tooling is available.

## Non-Goals

- Do not implement `dh doctor` in the Rust binary.
- Do not add a `doctor` alias, hidden command, command-dispatch shim, or compatibility fallback.
- Do not redesign CLI command taxonomy, help output architecture, runtime health-check architecture, or lifecycle reporting shape beyond the stale command wording.
- Do not change release-candidate membership, release approvals, workflow-state schemas, or approval flows.
- Do not fix unrelated release-validation failures, Semgrep scan findings, benchmark behavior, index behavior, generated artifact drift, or worker-bundle failures.
- Do not delete, move, truncate, regenerate, normalize, or clean raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, or generated local state.

## Implementation Slices

### Slice 1: Establish command-truth wording and update user-facing docs

- **Files**: `.github/release-notes.md`, `README.md`, `docs/user-guide.md`, `docs/operations/release-and-install.md`
- **Goal**: remove `dh doctor` from current first-run, post-install, post-upgrade, quick-start, health-check, and release-note guidance; replace it with supported Rust-binary commands.
- **Validation Command**: `npm test -- docs/operations/rust-host-lifecycle-wording.test.ts` plus targeted documentation review/search over the touched files.
- **Details**:
  - Use `dh --help` as the discovery recommendation.
  - Use `dh status`, `dh index`, and `dh ask "how does this project work?"` as the practical first-run path where valid for the built binary.
  - Update the release-note First Run block before implementation touches broader docs so release promotion has an immediate corrected source.
  - Keep docs factual about Linux/macOS support and bounded Rust-hosted first-wave knowledge commands.
  - If `doctor` remains in a historical/internal context, make sure it is not described as current shipped-Rust first-run guidance.

### Slice 2: Correct install/upgrade lifecycle output

- **Files**: `scripts/install.sh`, `scripts/upgrade.sh`, `scripts/install-from-release.sh`, `scripts/upgrade-from-release.sh`, `scripts/install-github-release.sh`, `scripts/upgrade-github-release.sh`
- **Goal**: keep lifecycle summaries intact while replacing unsupported `dh doctor`/`$target doctor` next steps with supported commands.
- **Validation Command**: `scripts/test-installers.sh dist/releases` when `dist/releases` contains release artifacts; otherwise record installer E2E validation as blocked by missing artifacts.
- **Details**:
  - Update successful install/upgrade `limited` wording from "run `dh doctor`" to a supported readiness/discovery pattern.
  - Update failed/rollback guidance from `$target doctor` to supported recovery verification such as `$target --version`, `$target --help`, and, where applicable, `$target status` or `$target index`.
  - Preserve rollback, checksum, signature, manifest/file-size, Linux/macOS, and worker-bundle wording.
  - Do not change file mutation behavior, backup behavior, release verification behavior, or artifact selection.

### Slice 3: Update tests and onboarding/runtime guidance guards

- **Files**: `scripts/test-installers.sh`, `apps/cli/src/commands/root.ts`, `apps/cli/src/commands/root.test.ts`, `packages/opencode-app/src/workflows/run-knowledge-command.ts`, `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`, `docs/operations/rust-host-lifecycle-wording.test.ts`
- **Goal**: ensure user-facing help, first-run onboarding, knowledge-command fallback guidance, and installer assertions cannot reintroduce stale `dh doctor` first-run/install guidance.
- **Validation Command**: `npm test -- apps/cli/src/commands/root.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts docs/operations/rust-host-lifecycle-wording.test.ts`
- **Details**:
  - Add assertions that active first-run/onboarding text contains supported commands and does not contain `dh doctor` as a current next step.
  - Update installer assertions to preserve lifecycle `next`/`limited` coverage while asserting replacement commands.
  - Keep tests scoped to user-facing guidance; do not break unrelated diagnostics tests that intentionally validate an existing internal/compatibility doctor module unless that module is part of current first-run guidance.

### Slice 4: Command-set and protected-state verification

- **Files**: `rust-engine/crates/dh-engine/src/main.rs`, `rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs`, changed-file list/diff
- **Goal**: prove the hotfix did not implement `doctor`, did not change the shipped Rust command model, and did not touch protected raw/local/generated state.
- **Validation Command**: `cargo test -p dh-engine --test host_contract_cli_test` from `rust-engine/` when Rust tooling is available; `npm run check`; changed-file review.
- **Details**:
  - Review Rust `Commands` enum and help output to confirm `doctor` is absent and supported commands remain available.
  - Add a focused Rust test only if needed to prevent `doctor` from appearing in the shipped command set; avoid changing Rust command behavior.
  - Review the final diff for protected paths/artifacts and document that no raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, or generated local state were deleted/regenerated/moved/truncated.

## Dependency Graph

- Sequential chain: Slice 1 docs/release-note command truth -> Slice 2 lifecycle script wording -> Slice 3 tests/onboarding guards -> Slice 4 command-set/protected-state verification.
- Critical path: correct release-note/install wording first, then update lifecycle scripts and assertions so tests protect the new command contract.
- Slice 3 depends on Slices 1 and 2 because tests should assert the final wording contract rather than temporary strings.
- Slice 4 can be reviewed alongside implementation but must be completed before code review/QA handoff.

## Parallelization Assessment

- parallel_mode: `none`
- why: this is a hotfix across overlapping wording and tests; parallel edits would increase the chance of inconsistent replacement language and stale snapshots.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1-DOCS -> SLICE-2-LIFECYCLE-SCRIPTS -> SLICE-3-TEST-GUARDS -> SLICE-4-VERIFICATION`
- integration_checkpoint: before code review, one changed-file/diff review must show all active first-run/install/upgrade guidance uses supported commands and no Rust `doctor` command was added.
- max_active_execution_tracks: 1

## Validation Matrix

| Acceptance Target | Validation Path |
| --- | --- |
| AC-1 release notes no longer recommend `dh doctor` | Review `.github/release-notes.md` First Run block; ensure it uses `dh --help`, `dh status`, `dh index`, and/or `dh ask` as appropriate. |
| AC-2 install lifecycle output recommends supported commands only | `scripts/test-installers.sh dist/releases` when release artifacts exist; otherwise inspect changed install script strings and record artifact-dependent validation as unavailable. |
| AC-3 upgrade lifecycle output recommends supported commands only | `scripts/test-installers.sh dist/releases` when release artifacts exist; otherwise inspect changed upgrade script strings and record artifact-dependent validation as unavailable. |
| AC-4 README/user docs do not present `dh doctor` as first-run/health-check guidance | Targeted documentation review/search over `README.md` and `docs/user-guide.md`; `npm test -- docs/operations/rust-host-lifecycle-wording.test.ts` after test updates. |
| AC-5 tests prevent reintroducing stale first-run guidance | Targeted Vitest and installer tests assert supported commands and absence of `dh doctor` in active guidance. |
| AC-6 no `doctor` command/alias/shim is added | Code review of `rust-engine/crates/dh-engine/src/main.rs` and any command dispatch changes; optional `cargo test -p dh-engine --test host_contract_cli_test`. |
| AC-7 docs/output command lists align with shipped Rust help | Compare touched command examples with `dh --help`/Rust command registration; adjust examples to exact valid syntax if required. |
| AC-8 protected raw/local/generated state is preserved | Changed-file review confirms no deletion, cleanup, movement, truncation, or regeneration of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, or generated local state. |

## Integration Checkpoint

- Before `solution_to_fullstack` handoff is treated as implementation-ready: Fullstack must preserve the product boundary that command guidance changes are the fix, not new Rust CLI behavior.
- Before code review: provide the changed-file list and show replacement wording is consistent across release notes, docs, lifecycle scripts, and tests.
- Before QA: provide targeted validation evidence for docs/onboarding tests, TypeScript check, installer tests where release artifacts exist, and Rust command-truth review/test where Rust tooling is available.

## Rollback Notes

- Rollback is localized: revert wording/test changes in release notes, README/user docs, lifecycle scripts, CLI/onboarding guidance, and associated tests.
- Do not roll back by deleting or regenerating raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, or generated local state.
- If a replacement command example turns out to require different flags, patch the wording to match `dh --help` rather than reintroducing `dh doctor`.

## Reviewer Focus Points

- Confirm every current first-run, post-install, post-upgrade, quick-start, release-note, and onboarding path stops recommending `dh doctor`.
- Confirm replacement commands exist in the shipped Rust binary and examples match actual help syntax.
- Confirm the Rust command registration did not gain `doctor`, aliasing, hidden dispatch, or compatibility behavior.
- Confirm lifecycle `limited`/`next` fields still communicate what install/upgrade verifies and what remains unverified.
- Confirm tests assert the command-guidance contract instead of only updating snapshots mechanically.
- Confirm no protected raw/local/generated state was deleted, moved, truncated, regenerated, normalized, or cleaned.

## QA Focus Points

- Verify `.github/release-notes.md`, README, user guide, release/install runbook, lifecycle scripts, CLI help/onboarding, and knowledge-command fallback guidance all use supported commands.
- Run `npm run check` for TypeScript validation.
- Run targeted Vitest paths: `apps/cli/src/commands/root.test.ts`, `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`, and `docs/operations/rust-host-lifecycle-wording.test.ts`.
- Run `scripts/test-installers.sh dist/releases` when release artifacts exist; if they do not, record this validation path as artifact-blocked rather than replacing it with unrelated checks.
- Run or inspect Rust command-truth validation from `rust-engine/` so QA can state that `doctor` remains unsupported.
- Keep validation-surface language precise: these are repository CLI/release/docs validations, not arbitrary target-project application validations.

## Handoff Readiness

- **Solution package status**: pass.
- **Why**: one recommended approach is clear; impacted surfaces are explicit; slices are sequential and validation-aware; non-goals and protected-state boundaries are recorded; implementation can proceed without guessing whether to add `doctor`.
