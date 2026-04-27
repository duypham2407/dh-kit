---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: RELEASE-FIRST-RUN-COMMAND-MISMATCH
feature_slug: release-first-run-command-mismatch
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-26-release-first-run-command-mismatch.md
source_solution_package: docs/solution/2026-04-26-release-first-run-command-mismatch.md
---

# QA Report: Release First Run Command Mismatch

## Verification Scope

- Verified the full-delivery hotfix goal: prepare RC2 by removing current first-run/install/release guidance that recommended unavailable `dh doctor` for the shipped Rust `dh` binary.
- Checked acceptance targets AC-1 through AC-8 from `docs/scope/2026-04-26-release-first-run-command-mismatch.md`.
- Validated the approved solution package at `docs/solution/2026-04-26-release-first-run-command-mismatch.md`.
- Reviewed active first-run/install/release/user-facing surfaces:
  - `.github/release-notes.md`
  - `README.md`
  - `docs/user-guide.md`
  - `docs/troubleshooting.md`
  - `docs/operations/release-and-install.md`
  - `scripts/install.sh`
  - `scripts/install-from-release.sh`
  - `scripts/install-github-release.sh`
  - `scripts/upgrade.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/upgrade-github-release.sh`
  - `apps/cli/src/commands/root.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- Verified Rust command truth surface:
  - `rust-engine/crates/dh-engine/src/main.rs`
  - `rust-engine/crates/dh-engine/tests/host_contract_cli_test.rs`
- Confirmed the protected-state boundary: QA did not commit, push, tag, publish, delete raw Semgrep JSON, delete `{cwd}`, delete `.opencode` local runtime state, or delete generated local state.

## Observed Result

PASS

The requested validation commands passed. Current active first-run/install/release guidance now points users to supported commands such as `dh --help`, `dh status`, `dh index`, and `dh ask`; no current user-facing first-run/install/release guidance reviewed recommends `dh doctor`. `dh status` documentation is narrowed to workspace/index/database/index state and explicitly does not claim install readiness, provider config readiness, or embedding-key readiness.

## Tool Evidence

- rule-scan: 0 findings on 22 files via Semgrep CLI substitute; direct `tool.rule-scan` is not exposed in this session. Artifact: `qa-release-first-run-command-mismatch-rule-scan.json`.
- security-scan: 0 findings on 22 files via Semgrep `p/security-audit` CLI substitute; direct `tool.security-scan` is not exposed in this session. Artifact: `qa-release-first-run-command-mismatch-security-scan.json`.
- evidence-capture: 8 records written:
  - `qa-frcm-npm-check`
  - `qa-frcm-targeted-tests`
  - `qa-frcm-installer-tests`
  - `qa-frcm-rust-host-contract`
  - `qa-frcm-rule-scan`
  - `qa-frcm-security-scan`
  - `qa-frcm-doc-script-search`
  - `qa-frcm-syntax-outline-fallback`
- syntax-outline: attempted on 7 structural source/test files; unavailable because the runtime resolved paths under `/Users/duypham/Code/DH/{cwd}` and returned missing-file/invalid-path. Fallback structural verification used direct file reads for the same files.

## Evidence

| Validation | Command / Evidence | Exit | Result |
| --- | --- | ---: | --- |
| TypeScript validation | `npm run check` | 0 | Passed (`tsc --noEmit`). |
| Targeted wording tests | `npm test -- docs/operations/rust-host-lifecycle-wording.test.ts apps/cli/src/commands/root.test.ts packages/opencode-app/src/workflows/run-knowledge-command.test.ts` | 0 | Passed: 3 test files, 54 tests. |
| Installer lifecycle suite | `sh scripts/test-installers.sh dist/releases` | 0 | Passed: 73 assertions, 0 failures. Install/upgrade outputs recommend `dh --help` and `dh status` and assert absence of `dh doctor`. |
| Rust command truth | From `rust-engine/`: `cargo test -p dh-engine --test host_contract_cli_test` | 0 | Passed: 4 tests. Warnings were existing dead-code warnings; tests passed and `shipped_cli_help_does_not_advertise_doctor_command` passed. |
| Quality scan substitute | `npx semgrep --config auto --json --output qa-release-first-run-command-mismatch-rule-scan.json <22 hotfix files>` | 0 | Passed: 0 findings, 0 blocking findings. |
| Security scan substitute | `npx semgrep --config p/security-audit --json --output qa-release-first-run-command-mismatch-security-scan.json <22 hotfix files>` | 0 | Passed: 0 findings, 0 blocking findings. |
| Active guidance search/review | Grep/read review for `dh doctor`, `doctor`, and `dh status` boundary wording across active docs/scripts/tests | 0 | No current first-run/install/release guidance reviewed recommends `dh doctor`. Remaining `doctor` references are absence assertions, legacy TypeScript compatibility command surfaces/tests, historical scope/solution docs, or non-first-run nightly snapshot wording. |
| Structural verification fallback | Direct file reads after `tool.syntax-outline` path-resolution failure | n/a | Confirmed TS onboarding uses `dh --help`/`dh index`/`dh ask`, knowledge-command fallback uses `dh --help`/`dh status`, Rust `Commands` enum includes `Status` and no `Doctor`, and host contract test asserts Rust help omits doctor. |

## Acceptance Mapping

| AC | QA Result | Evidence |
| --- | --- | --- |
| AC-1 release notes do not recommend `dh doctor` | Pass | `.github/release-notes.md` First Run block uses `dh --help`, `dh status`, `dh index`, and `dh ask`; targeted wording test passed. |
| AC-2 install lifecycle output recommends supported commands only | Pass | `sh scripts/test-installers.sh dist/releases` passed and asserts install paths include `dh --help`/`dh status` while excluding `dh doctor`. |
| AC-3 upgrade lifecycle output recommends supported commands only | Pass | Installer suite passed and asserts upgrade paths include `dh --help`/`dh status` while excluding `dh doctor`. |
| AC-4 README/user docs do not present `dh doctor` as first-run/health-check guidance | Pass | Grep/read review over README, user guide, troubleshooting, and release/install runbook found no current first-run/user guidance recommending `dh doctor`; targeted docs wording tests passed. |
| AC-5 tests prevent reintroduction | Pass | Targeted Vitest tests and installer assertions include negative checks for `dh doctor` in active guidance. |
| AC-6 no Rust `doctor` command/alias/shim added | Pass | `rust-engine/crates/dh-engine/src/main.rs` `Commands` enum has `Init`, `Status`, `Index`, `Parity`, `Benchmark`, `HostContract`, `Ask`, `Explain`, `Trace`, and `Serve`; no `Doctor`. Rust host contract test passed. |
| AC-7 docs/output command lists align with shipped Rust help | Pass | Rust test confirms help advertises supported status/index/ask/explain/trace and does not advertise doctor; docs/scripts use supported first-run commands. |
| AC-8 protected raw/local/generated state preserved | Pass | QA did not delete or clean raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. Newly generated QA scan JSON artifacts are preserved. |

## Behavior Impact

- Passed: a user following the active release note first-run block is directed to `dh --help`, `dh status`, `dh index`, and `dh ask` instead of unavailable `dh doctor`.
- Passed: install and upgrade lifecycle summaries keep the `limited`/`next` boundary while directing users to `--version`, `--help`, and `status` rather than doctor.
- Passed: CLI onboarding and knowledge-command fallback guidance no longer tell users to run `dh doctor` as the first-run or workspace-prerequisite check.
- Passed: `dh status` wording is scoped to workspace/index/database/index state and avoids health/config/provider/embedding-key overclaiming.
- Passed: Rust command model remains unchanged for this hotfix; `doctor` remains absent from shipped Rust help.

## Issue List

None.

Previously routed issue `FRCM-SCOPE-001` is resolved by the implementation/code-review pass and was not reopened by QA.

## Recommended Route

Route to `MasterOrchestrator` for `qa_to_done` closure on `RELEASE-FIRST-RUN-COMMAND-MISMATCH` and RC2 preparation.

Do not commit, push, tag, or publish from QA. Those actions remain out of scope per the user instruction.

## Verification Record(s)

- issue_type: none
  severity: none
  rooted_in: none
  evidence: `npm run check` exit 0; targeted Vitest exit 0; installer lifecycle suite exit 0; Rust host contract test exit 0; Semgrep quality and security substitute scans exit 0 with 0 findings; active guidance review found no current first-run/install/release recommendation to run `dh doctor`.
  behavior_impact: RC2 first-run/install/release guidance is aligned to supported shipped Rust commands, and `dh status` docs are constrained to workspace/index/database/index state.
  route: `full_done` via `MasterOrchestrator` `qa_to_done` gate.
