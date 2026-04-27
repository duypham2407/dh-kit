# Scope Package: Release Validation Vitest Timeout Hotfix

## Problem

Active hotfix `RELEASE-VALIDATION-VITEST-TIMEOUT` addresses a release validation blocker where `npm test` hangs in quality-gates runtime tests because Semgrep CLI availability detection calls unbounded `spawnSync("semgrep", ["--version"])`. The hotfix must bound and fail-safe Semgrep availability detection so Vitest can continue when Semgrep is missing, slow, or non-responsive, while preserving raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state.

## In Scope

- Bound Semgrep CLI availability/version detection so it cannot hang Vitest or release validation indefinitely.
- Ensure Semgrep detection fails safe when Semgrep is unavailable, slow, non-responsive, or returns an execution error.
- Preserve existing quality-gates behavior that reports `rule_scan` as unavailable or degraded when Semgrep cannot be executed successfully.
- Keep changes limited to the Semgrep availability detection path used by quality-gates runtime tests.
- Validate that the previously hanging quality-gates runtime Vitest path completes without blocking on Semgrep detection.
- Preserve raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state.

## Out of Scope

- Fixing, reclassifying, or benchmarking graph-indexer failures or timeouts.
- Fixing, reclassifying, or benchmarking worker-bundle failures or timeouts.
- Reworking quality-gates architecture beyond bounding and fail-safing Semgrep availability detection.
- Changing release candidate scope, workflow-state schemas, approval gates, or generated local runtime/state artifacts.
- Deleting, regenerating, or cleaning raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Verification |
| --- | --- | --- |
| AC-1 | Semgrep availability/version detection used by quality-gates runtime has a bounded execution path and cannot wait indefinitely for `semgrep --version`. | Code inspection plus a targeted test or mock proving slow/non-responsive Semgrep detection returns within the configured bound. |
| AC-2 | When Semgrep is missing, slow, non-responsive, exits non-zero, or errors during launch, detection returns a controlled unavailable/degraded result instead of hanging or throwing an unhandled exception. | Targeted unit test coverage or existing quality-gates runtime assertions for unavailable/degraded Semgrep outcomes. |
| AC-3 | The quality-gates runtime Vitest case that previously hung on Semgrep detection completes without blocking indefinitely. | Run the narrowest relevant Vitest command for `packages/runtime/src/workflow/quality-gates-runtime.test.ts` or the specific previously hanging test name. |
| AC-4 | Release validation `npm test` progresses past the Semgrep detection hang path for active hotfix `RELEASE-VALIDATION-VITEST-TIMEOUT`. | Run `npm test` under an external release-validation timeout and confirm it does not hang on Semgrep availability detection. |
| AC-5 | If Semgrep cannot be used, quality-gates output still marks `rule_scan` unavailable or degraded and does not treat the scan as successful. | Inspect targeted test assertions or runtime output for the unavailable/degraded `rule_scan` status. |
| AC-6 | The hotfix does not delete raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. | Review the git diff and changed-file list for absence of deletion, cleanup, or regeneration operations affecting those artifacts. |
| AC-7 | The hotfix does not attempt to fix graph-indexer benchmark or worker-bundle failures/timeouts. | Review changed files and verification notes to confirm those separate failure classes remain out of scope. |
