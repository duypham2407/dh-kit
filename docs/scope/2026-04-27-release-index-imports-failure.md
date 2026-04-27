---
artifact_type: scope_package
version: 1
status: pass
feature_id: RELEASE-INDEX-IMPORTS-FAILURE
feature_slug: release-index-imports-failure
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Release Index Imports Failure

## Goal

- Restore clean workspace indexing/status reporting for this repository by fixing the `dh index`/`dh status` import insertion failure without broad redesign or release artifact cleanup.

## Problem

- Published RC2 install smoke confirms the `dh status` command exists and runs, but this repository reports workspace index status `Failed`.
- The failure records `last_error: insert imports for packages/opencode-app/src/workflows/run-lane-command.ts`, blocking clean workspace indexing/status reporting for release validation.
- Maintainers and release operators need `dh index` and `dh status` to complete cleanly for this repository so the RC2 hotfix can be validated independently from release publishing and first-run documentation work.

## In Scope

- Reproduce the workspace index/import insertion failure for this repository using the relevant `dh index` and/or `dh status` path, or use preserved failure evidence if reproduction is already captured.
- Identify the concrete cause of the `insert imports` failure for `packages/opencode-app/src/workflows/run-lane-command.ts`.
- Apply the smallest safe fix that lets the indexer record imports and complete for this repository.
- Verify `dh index` can complete without the recorded import insertion failure.
- Verify `dh status` reports a clean/non-failed workspace index state after the fix.
- Preserve release/local artifacts, including raw Semgrep JSON, `{cwd}` artifacts, `.opencode` state, generated workflow/index state, and other release evidence unless the user explicitly approves deletion.
- Record any residual validation limitation if a command cannot be run in the current environment.

## Out of Scope

- First-run documentation updates or onboarding copy changes.
- RC2 commit, publish, npm packaging, or release promotion work.
- Broad indexer redesign, database schema redesign, or unrelated runtime architecture changes.
- Deleting, pruning, or regenerating release/local artifacts as a cleanup step.
- Fixing unrelated `dh status`, `dh index`, Semgrep, workflow-state, or target-project app issues discovered during investigation unless they directly block the import insertion fix.
- Adding new app-native build, lint, or test tooling for this repository.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Verification |
| --- | --- | --- |
| AC1 | The failure is reproduced, or existing failure evidence is sufficient to identify the failing import insertion path for `packages/opencode-app/src/workflows/run-lane-command.ts`. | Reproduction notes or preserved evidence identify the command/path and failing file. |
| AC2 | The implemented fix targets the import insertion failure without broad redesign or unrelated behavior changes. | Diff/review shows changes are limited to the indexing/import insertion failure path and directly related supporting tests/docs if needed. |
| AC3 | `dh index` completes for this repository without `last_error: insert imports for packages/opencode-app/src/workflows/run-lane-command.ts`. | Fresh `dh index` run exits successfully or reports a non-failed index state without that error. |
| AC4 | `dh status` reports the workspace index as clean/non-failed after indexing. | Fresh `dh status` output shows no workspace index status `Failed` and no stale `last_error` for the target file. |
| AC5 | Release/local artifacts are preserved. | No deletion of raw Semgrep JSON, `{cwd}` artifacts, `.opencode` state, generated state, or release evidence appears in the fix. |
| AC6 | The hotfix remains separate from first-run docs and release publish work. | Scope, changes, and final report do not include first-run documentation changes, RC2 publishing, or release promotion steps. |
