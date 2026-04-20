---
artifact_type: qa_report
version: 1
status: qa_handoff
feature_id: RELEASE-HARDENING-V2
feature_slug: release-hardening-v2
owner: QAAgent
approval_gate: qa_to_done
source_scope_package: docs/scope/2026-04-19-release-hardening-v2.md
source_solution_package: docs/solution/2026-04-19-release-hardening-v2.md
---

# QA Report: RELEASE-HARDENING-V2

## Verification Scope

- Mode/stage/task context verified: `full` / `full_qa` / `TASK-RELEASE-HARDENING-REWORK-1 (qa_in_progress)`.
- Contract basis verified:
  - `docs/scope/2026-04-19-release-hardening-v2.md`
  - `docs/solution/2026-04-19-release-hardening-v2.md`
- Primary rework surfaces verified:
  - `scripts/install.sh`
  - `scripts/upgrade.sh`
  - `scripts/install-github-release.sh`
  - `scripts/upgrade-github-release.sh`
  - `scripts/test-installers.sh`
- Adjacent lifecycle/reporting surfaces verified for bounded-truth alignment:
  - `scripts/verify-release-artifacts.sh`
  - `scripts/install-from-release.sh`
  - `scripts/upgrade-from-release.sh`
  - `scripts/uninstall.sh`
  - `docs/operations/release-and-install.md`
  - `README.md`
  - `CHANGELOG.md`
- Explicit QA rework focus:
  - `upgrade.sh` must distinguish **pre-mutation blocked** vs **post-mutation failed** outcomes truthfully.
  - unsupported Windows/runtime-parity messaging must be consistent across GitHub install/upgrade surfaces.
  - bounded trust story must stay honest: local release-directory path strongest, GitHub/direct paths narrower with no parity/SLA overclaim.

## Observed Result

- **PASS**
- Ready-for-full_done: **Yes**

## Evidence

Fresh validation rerun in this QA pass:

- `semgrep --config p/ci scripts/install.sh scripts/upgrade.sh scripts/install-github-release.sh scripts/upgrade-github-release.sh scripts/test-installers.sh scripts/verify-release-artifacts.sh` -> PASS, 0 findings.
- `semgrep --config p/security-audit scripts/install.sh scripts/upgrade.sh scripts/install-github-release.sh scripts/upgrade-github-release.sh scripts/test-installers.sh scripts/verify-release-artifacts.sh` -> PASS, 0 findings.
- `cargo test --workspace` (from `rust-engine/`) -> PASS.
- `npm run check` -> PASS.
- `npm test` -> PASS (73 files passed, 372 tests passed, 4 skipped).
- `scripts/test-installers.sh dist/releases` -> PASS (49 passed, 0 failed), including:
  - upgrade post-mutation failure branch assertions
  - GitHub install/upgrade bounded limitation assertions
  - release-directory install/upgrade strong-tier assertions
  - uninstall completed/noop assertions.
- `scripts/verify-release-artifacts.sh --json dist/releases` -> PASS; emits `verificationTier=release-directory-verified` with required checks true.

Targeted manual behavior checks in this QA pass:

- `scripts/upgrade.sh /tmp/nonexistent-dh-binary <tmp>` (after seeded install) -> emits `condition: blocked` and “failed before target replacement” language, confirming pre-mutation gate behavior.
- `scripts/upgrade.sh --with-rust-tools <binary> <tmp>` (without consent) -> emits `condition: failed` and “failed after binary replacement/mutation” language, confirming post-mutation failure truth.
- Fixture-backed GitHub checks with `DH_RELEASE_BASE_URL=file://...`:
  - `scripts/install-github-release.sh` -> completed with explicit limitations including Windows unsupported parity.
  - `scripts/upgrade-github-release.sh` -> completed with explicit limitations including Windows unsupported parity.
- Strong-path confirmation:
  - `scripts/install-from-release.sh dist/releases <tmp>` and `scripts/upgrade-from-release.sh dist/releases <tmp>` both report `tier=release-directory-verified` and keep doctor/readiness boundary explicit.

## Behavior Impact

- Rework finding 1 remains fixed: upgrade lifecycle reporting now truthfully separates pre-mutation blocked outcomes from post-mutation failed outcomes and no longer overclaims unchanged target state for post-mutation failures.
- Rework finding 2 remains fixed: unsupported Windows runtime installer parity messaging is consistently surfaced across both GitHub install and GitHub upgrade paths (and preserved in adjacent docs/tests).
- Bounded trust model remains honest and closure-safe:
  - local release-directory path remains strongest (`manifest + checksum + file-size` tier)
  - GitHub/direct flows remain narrower with explicit `limited` text
  - no parity overclaim or hidden SLA language detected in touched script/doc surfaces.

## Issue List

- None.

## Tool Evidence

- rule-scan: 0 findings on 6 files (runtime `tool.rule-scan` unavailable; substituted with Semgrep p/ci)
- security-scan: 0 findings on 6 files (runtime `tool.security-scan` unavailable; substituted with Semgrep p/security-audit)
- evidence-capture: 3 records written in this QA pass (`release-hardening-v2-qa-runtime-2026-04-20`, `release-hardening-v2-qa-manual-contract-checks-2026-04-20`, `release-hardening-v2-qa-syntax-outline-unavailable-2026-04-20`)
- syntax-outline: unavailable — runtime path resolution points to `/Users/duypham/Code/DH/{cwd}/...`; manual structural verification performed on all changed rework surfaces

## Recommended Route

- Route to `MasterOrchestrator` for `qa_to_done` approval and `full_done` closure.
- Reason: approved bounded RELEASE-HARDENING-V2 acceptance targets are satisfied with fresh QA evidence; both rework findings remain fixed; no closure-blocking QA issues remain.

## Verification Record(s)

- issue_type: `none` (QA pass)
  - severity: `none`
  - rooted_in: `n/a`
  - evidence:
    - Semgrep p/ci and p/security-audit reruns: PASS, 0 findings
    - full Rust/TS validations and installer/release verification paths: PASS
    - targeted manual behavioral checks confirm blocked-vs-failed lifecycle truth and GitHub Windows-parity wording consistency
    - manual structural review confirms bounded trust-tier messaging stays explicit across touched scripts/docs
  - behavior_impact: RELEASE-HARDENING-V2 remains closure-safe and bounded-contract honest
  - route: `qa_to_done` approval -> `full_done`
