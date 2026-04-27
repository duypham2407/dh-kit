---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: RELEASE-FIRST-RUN-COMMAND-MISMATCH
feature_slug: release-first-run-command-mismatch
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Release First Run Command Mismatch

This hotfix corrects RC first-run guidance so published release notes, install/upgrade lifecycle output, README/user docs, and tests point operators to commands that actually exist in the shipped Rust `dh` binary. The scope is intentionally narrow: replace `dh doctor` guidance with available commands such as `dh status`, `dh index`, `dh ask`, or `dh --help`; do not add a new `doctor` command; and do not clean up or delete raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Goal

- Ensure first-run instructions for RC v0.3.1-rc.1 and related user-facing surfaces match the shipped `dh` command set.
- Prevent users from being told to run `dh doctor` when the Rust binary does not expose a `doctor` subcommand.
- Keep the hotfix limited to wording, lifecycle output, docs, and tests for command guidance truth.

## Target Users

- Operators installing or upgrading the published RC and following first-run instructions.
- Release maintainers validating release notes, install output, and documentation before promoting or republishing a candidate.
- Reviewers and QA agents verifying that command guidance matches `dh --help` and does not hide unrelated local/generated state changes.

## Problem

Published RC v0.3.1-rc.1 installs successfully and `dh --version` works, but release notes and install output instruct users to run `dh doctor`. The shipped Rust binary help does not include a `doctor` command; available user-facing commands include `init`, `status`, `index`, `parity`, `benchmark`, `host-contract`, `ask`, `explain`, `trace`, and `serve`. This creates a first-run failure path where users follow official guidance and immediately hit an unsupported command.

## In Scope

- Update release notes so first-run guidance uses existing commands, such as `dh status`, `dh index`, `dh ask`, or `dh --help`, instead of `dh doctor`.
- Update install and upgrade lifecycle output that tells users what to run after installation or upgrade.
- Update README and user-facing docs that reference `dh doctor` as a first-run, health-check, or post-install command.
- Update or add tests that assert first-run guidance no longer references unavailable `dh doctor` and instead references supported commands.
- Preserve factual guidance that `dh --version` works and `dh --help` is the canonical discoverability path for available commands.
- Keep references to the shipped command set aligned with the Rust binary help output: `init`, `status`, `index`, `parity`, `benchmark`, `host-contract`, `ask`, `explain`, `trace`, and `serve`.
- Preserve raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state.

## Out of Scope

- Implementing a new `dh doctor` command.
- Adding aliases, hidden commands, compatibility shims, or command dispatch behavior for `doctor`.
- Redesigning the CLI command model, help output, command taxonomy, or runtime health-check architecture.
- Changing install packaging behavior beyond correcting displayed first-run/lifecycle guidance.
- Changing release candidate membership, release gate policy, workflow-state schemas, or approval flows.
- Deleting, regenerating, moving, truncating, or cleaning raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.
- Fixing unrelated release-validation failures, scan findings, benchmark behavior, index behavior, or generated artifact drift.

## Main Flows

- **Flow 1 — New install first run**
  - As an operator who installs RC v0.3.1-rc.1, I want the install output to recommend an existing command such as `dh status` or `dh --help`, so that my first command succeeds instead of failing on `dh doctor`.
- **Flow 2 — Upgrade lifecycle guidance**
  - As an operator who upgrades the CLI, I want upgrade completion output to name only supported follow-up commands, so that lifecycle guidance remains trustworthy.
- **Flow 3 — Release/documentation review**
  - As a release maintainer, I want release notes, README/user docs, and tests to agree with the shipped `dh --help` command set, so that the release candidate does not publish stale first-run instructions.

## Business Rules

- User-facing first-run, post-install, post-upgrade, and quick-start guidance must not instruct users to run `dh doctor` unless the command exists in the shipped Rust binary.
- For this hotfix, `dh doctor` must remain unsupported; the correct fix is documentation/output/test alignment, not a new command.
- First-run guidance may recommend only existing commands such as `dh --help`, `dh status`, `dh index`, or `dh ask`.
- `dh --help` remains the authoritative discovery surface for the shipped command list.
- Tests must protect against reintroducing `dh doctor` into release/install/README first-run guidance.
- The hotfix must not delete, regenerate, normalize, or clean raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.
- Validation notes must distinguish this command-guidance fix from unrelated release-validation or local-state issues.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Verification |
| --- | --- | --- |
| AC-1 | Release notes for RC v0.3.1-rc.1 and any touched release-note template no longer tell users to run `dh doctor` as first-run or health-check guidance. | Documentation diff or snapshot inspection shows `dh doctor` removed from first-run guidance and replaced with supported commands. |
| AC-2 | Install lifecycle output shown after installation recommends only existing commands such as `dh status`, `dh index`, `dh ask`, or `dh --help`. | Targeted test or captured install-output fixture/snapshot proves post-install guidance has no `dh doctor` reference. |
| AC-3 | Upgrade lifecycle output shown after upgrade recommends only existing commands such as `dh status`, `dh index`, `dh ask`, or `dh --help`. | Targeted test or captured upgrade-output fixture/snapshot proves post-upgrade guidance has no `dh doctor` reference. |
| AC-4 | README and user-facing docs no longer present `dh doctor` as an available first-run, post-install, post-upgrade, quick-start, or health-check command. | Documentation search/review over touched user docs confirms no stale `dh doctor` first-run guidance remains. |
| AC-5 | Tests cover the command-guidance contract and fail if release/install/upgrade/README first-run guidance reintroduces `dh doctor`. | Automated test evidence or updated snapshots assert supported replacement commands and absence of unavailable `dh doctor`. |
| AC-6 | The implementation does not add a `doctor` command, alias, hidden subcommand, or command-dispatch compatibility shim. | Code review of CLI command registration/help/dispatch confirms the shipped command set is unchanged except for guidance/tests. |
| AC-7 | Any command list shown in docs or lifecycle output remains consistent with shipped Rust help, including existing commands such as `init`, `status`, `index`, `parity`, `benchmark`, `host-contract`, `ask`, `explain`, `trace`, and `serve`. | Compare touched wording or snapshots with `dh --help`/help fixture evidence. |
| AC-8 | Raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state are preserved. | Changed-file review confirms no deletion, cleanup, movement, truncation, or regeneration of protected artifacts. |

## Edge Cases

- A docs page mentions `doctor` in historical context; it must not present `dh doctor` as a current command or first-run instruction.
- A release-note template and a generated release note both contain first-run guidance; both must align if either is in the active release path.
- Lifecycle output may include multiple suggested next commands; every suggested command must exist in the shipped binary.
- If docs explain troubleshooting, they should point to `dh --help` or existing diagnostic/status commands rather than inventing `dh doctor`.
- If a test fixture intentionally includes stale output, it must be updated or clearly scoped as historical/non-current so it cannot validate current first-run guidance.

## Error And Failure Cases

- If any current user-facing first-run, post-install, post-upgrade, quick-start, or release-note guidance still tells users to run `dh doctor`, the hotfix fails.
- If implementation adds a `doctor` command or alias to satisfy the guidance, the hotfix fails because new command work is explicitly out of scope.
- If install/upgrade output names a replacement command that does not exist in `dh --help`, the hotfix fails.
- If tests pass while stale `dh doctor` guidance remains in active release/install/user-doc surfaces, test coverage is insufficient for this scope.
- If any raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state is deleted or regenerated by the hotfix, the scope fails AC-8.

## Open Questions

- None for product scope. Solution Lead should choose the smallest safe set of release-note, lifecycle-output, README/user-doc, and test updates needed to remove stale `dh doctor` first-run guidance.

## Success Signal

- A user following published or generated first-run guidance after install/upgrade is directed to commands that exist in the shipped Rust binary.
- `dh doctor` no longer appears as current first-run, post-install, post-upgrade, quick-start, or health-check guidance.
- Review and QA can show the hotfix did not implement a new command and did not delete protected raw/local/generated state.

## Handoff Notes For Solution Lead

- Preserve this hotfix boundary: align release/install/docs/tests with existing command truth; do not add `doctor`.
- Treat `dh --help` as the command truth source when choosing replacement wording.
- Prefer replacement guidance that helps first-run users make progress: `dh --help` for discovery, `dh status` for workspace status, `dh index` for indexing, and `dh ask` for first knowledge-command use.
- Do not use cleanup, regeneration, or deletion of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state as part of implementation or validation.
- Handoff readiness: pass — problem, scope boundaries, business rules, acceptance criteria, edge cases, and failure cases are explicit enough for Solution Lead planning.
