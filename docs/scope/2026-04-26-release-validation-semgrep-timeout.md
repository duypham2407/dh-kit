---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: RELEASE-VALIDATION-SEMGREP-TIMEOUT
feature_slug: release-validation-semgrep-timeout
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Release Validation Semgrep Timeout

This hotfix unblocks release validation by bounding and fail-safing Semgrep CLI availability detection in the quality-gates runtime test path. The scope is intentionally narrow: prevent `semgrep --version` detection from hanging `npm test`, preserve the existing unavailable/degraded `rule_scan` behavior when Semgrep cannot be used, and avoid any cleanup or changes to raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Goal

- Ensure Semgrep availability/version detection cannot hang release validation indefinitely.
- Preserve quality-gates behavior that treats unusable Semgrep as unavailable or degraded rather than successful.
- Keep the hotfix limited to the Semgrep detection blocker without touching unrelated release-validation failures or local/generated state.

## Target Users

- Release maintainers running `npm test` as part of release validation.
- Reviewers and QA agents who need bounded, inspectable evidence that Semgrep detection no longer blocks quality-gates runtime tests.
- Operators relying on release-validation status to distinguish this Semgrep detection blocker from separate graph-indexer or worker-bundle failures.

## Problem

Active hotfix `RELEASE-VALIDATION-SEMGREP-TIMEOUT` addresses a release validation blocker: `npm test` can hang because quality-gates runtime tests perform Semgrep CLI detection through unbounded `spawnSync("semgrep", ["--version"])`. When Semgrep is missing, slow, blocked, or non-responsive, the detection path must return a controlled unavailable/degraded result instead of blocking the Vitest process or release validation indefinitely.

## In Scope

- Bound Semgrep CLI availability/version detection used by quality-gates runtime code and tests so it cannot wait indefinitely for `semgrep --version`.
- Fail safe when Semgrep is unavailable, slow, non-responsive, exits non-zero, or throws/returns an execution error during detection.
- Preserve existing `rule_scan` unavailable/degraded semantics when Semgrep cannot be executed successfully.
- Keep changes limited to the Semgrep availability detection path that blocks quality-gates runtime tests and release validation.
- Validate the previously hanging quality-gates runtime Vitest path completes without blocking on Semgrep detection.
- Preserve raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state.

## Out of Scope

- Fixing, reclassifying, benchmarking, or otherwise changing graph-indexer benchmark failures or timeouts.
- Fixing, reclassifying, benchmarking, or otherwise changing worker-bundle failures or timeouts.
- Reworking the quality-gates runtime architecture beyond bounding and fail-safing Semgrep availability detection.
- Changing release-candidate scope, workflow-state schemas, workflow approval gates, or generated local runtime/state artifacts.
- Deleting, regenerating, moving, truncating, or cleaning raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.
- Treating Semgrep absence or timeout as a successful rule scan.

## Main Flows

- **Flow 1 — Release maintainer runs release validation**
  - As a release maintainer, I want `npm test` to progress past Semgrep availability detection, so that release validation is not blocked indefinitely by a missing, slow, or non-responsive Semgrep CLI.
- **Flow 2 — Quality-gates runtime detects unusable Semgrep**
  - As a quality-gates consumer, I want unusable Semgrep detection to produce a controlled unavailable/degraded `rule_scan` outcome, so that validation output stays honest without hanging.
- **Flow 3 — Reviewer verifies hotfix boundaries**
  - As a reviewer, I want the hotfix diff to be limited to Semgrep detection behavior and to preserve local/generated state, so that unrelated release-validation failures and raw scan artifacts are not modified under this hotfix.

## Business Rules

- Semgrep availability/version detection must be bounded by an explicit timeout or equivalent execution guard.
- Detection must fail safe for all unusable Semgrep conditions, including missing executable, launch error, non-zero exit, timeout, and non-responsive process behavior.
- A failed or timed-out Semgrep availability check must not be reported as a successful Semgrep scan.
- When Semgrep cannot be used, quality-gates behavior must continue to surface `rule_scan` as unavailable or degraded according to existing status vocabulary.
- The hotfix must not delete, regenerate, normalize, or clean raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.
- Graph-indexer benchmark failures/timeouts and worker-bundle failures/timeouts must remain separately tracked issues, not hidden by or bundled into this hotfix.
- Any validation report must distinguish Semgrep detection hang resolution from unrelated release-validation failures that remain out of scope.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Verification |
| --- | --- | --- |
| AC-1 | Semgrep availability/version detection used by quality-gates runtime has a bounded execution path and cannot wait indefinitely for `semgrep --version`. | Code inspection plus targeted test or mock proving slow/non-responsive Semgrep detection returns within the configured bound. |
| AC-2 | When Semgrep is missing, slow, non-responsive, exits non-zero, or errors during launch, detection returns a controlled unavailable/degraded result instead of hanging or throwing an unhandled exception. | Targeted unit test coverage or existing quality-gates runtime assertions for unavailable/degraded Semgrep outcomes. |
| AC-3 | The quality-gates runtime Vitest path that previously hung on Semgrep detection completes without blocking indefinitely. | Run the narrowest relevant Vitest command for `packages/runtime/src/workflow/quality-gates-runtime.test.ts` or the specific previously hanging test name under a bounded timeout. |
| AC-4 | Release validation `npm test` progresses past the Semgrep detection hang path for active hotfix `RELEASE-VALIDATION-SEMGREP-TIMEOUT`. | Run `npm test` under an external release-validation timeout and confirm it does not hang on Semgrep availability detection. |
| AC-5 | If Semgrep cannot be used, quality-gates output still marks `rule_scan` unavailable or degraded and does not treat the scan as successful. | Inspect targeted test assertions or runtime output for unavailable/degraded `rule_scan` status. |
| AC-6 | The hotfix does not delete raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. | Review changed-file list and git diff for absence of deletion, cleanup, movement, truncation, or regeneration operations affecting those artifacts. |
| AC-7 | The hotfix does not attempt to fix graph-indexer benchmark or worker-bundle failures/timeouts. | Review changed files and validation notes to confirm those separate failure classes remain out of scope. |
| AC-8 | Validation notes clearly separate Semgrep detection hang resolution from any remaining unrelated release-validation failures. | Review handoff, implementation, and QA notes for explicit out-of-scope classification when graph-indexer or worker-bundle failures appear. |

## Edge Cases

- `semgrep` executable is absent from `PATH`.
- `semgrep --version` starts but never exits or exceeds the configured bound.
- `semgrep --version` exits non-zero or emits unexpected output.
- Spawning `semgrep` raises an operating-system or permission error.
- Semgrep is present and responsive; detection should still report availability without changing successful scan semantics.

## Error And Failure Cases

- If Semgrep detection times out, the runtime must continue and report an unavailable/degraded `rule_scan` state rather than hang.
- If Semgrep detection throws, the error must be contained in the detection path and surfaced as unavailable/degraded status rather than an unhandled test/process failure.
- If `npm test` still fails after progressing past Semgrep detection due to graph-indexer benchmark or worker-bundle failures/timeouts, those failures are not acceptance failures for this hotfix unless they are caused by Semgrep detection changes.
- If any raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state is deleted or regenerated by the hotfix, the scope fails AC-6.

## Open Questions

- None for product scope. Solution Lead should choose the smallest safe timeout/guarding strategy that preserves current quality-gates status vocabulary and test determinism.

## Success Signal

- The previously hanging quality-gates runtime Semgrep detection path completes within a bounded time.
- `npm test` no longer blocks indefinitely on Semgrep availability detection.
- Review and QA can show the hotfix did not alter graph-indexer or worker-bundle failure handling and did not delete protected raw/local/generated state.

## Handoff Notes For Solution Lead

- Preserve this hotfix boundary: solve only Semgrep availability detection hang/fail-safe behavior.
- Do not use cleanup, regeneration, or deletion of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state as part of the implementation or validation process.
- If unrelated graph-indexer benchmark or worker-bundle failures appear during validation, report them separately as out-of-scope release-validation blockers.
- Prefer targeted tests/mocks for missing, slow, non-responsive, and successful Semgrep detection before running broader `npm test` validation.
- Handoff readiness: pass — problem, scope boundaries, rules, acceptance criteria, edge cases, and failure cases are explicit enough for Solution Lead planning.
