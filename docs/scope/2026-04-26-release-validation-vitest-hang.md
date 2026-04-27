# Scope Package: Release Validation Vitest Hang Hotfix

## Problem

Release candidate `linux-macos-runtime-hardening-rc` is blocked because `npm test` hangs during release validation. Diagnostics isolated the primary hang to `packages/runtime/src/workflow/quality-gates-runtime.test.ts`, test `marks rule_scan unavailable...`, where Semgrep availability detection performs an unbounded `spawnSync("semgrep", ["--version"])`. The hotfix must make Semgrep detection bounded/fail-safe so the Vitest suite can continue when Semgrep is unavailable or slow, without deleting raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## In Scope

- Bound Semgrep availability/version detection so it cannot hang Vitest or release validation indefinitely.
- Preserve existing quality-gates behavior that reports `rule_scan` as unavailable/degraded when Semgrep cannot be executed successfully.
- Keep the hotfix limited to the Semgrep detection hang path exercised by `quality-gates-runtime.test.ts`.
- Validate the fix against the previously hanging Vitest test and the relevant `npm test` release-validation path.
- Preserve all raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state.

## Out of Scope

- Fixing the separately observed graph-indexer benchmark timeout/failure.
- Fixing the separately observed worker-bundle test timeout/failure.
- Reworking quality-gates architecture beyond the bounded Semgrep detection path.
- Changing release-candidate scope, workflow state, or local generated runtime/state artifacts.
- Deleting or regenerating raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state as part of this hotfix.

## Acceptance Criteria Matrix

| ID | Acceptance Criterion | Verification |
| --- | --- | --- |
| AC-1 | The Semgrep availability/version check used by the quality-gates runtime has a bounded execution path and returns a controlled unavailable/degraded result when Semgrep is missing, slow, or non-responsive. | Code inspection plus targeted test coverage for unavailable/slow Semgrep behavior. |
| AC-2 | The Vitest test `packages/runtime/src/workflow/quality-gates-runtime.test.ts` test `marks rule_scan unavailable...` completes without hanging. | Run the targeted Vitest test or the narrowest available test command for that test file/name. |
| AC-3 | `npm test` no longer blocks indefinitely on the Semgrep detection path for release candidate `linux-macos-runtime-hardening-rc`. | Run `npm test` with a bounded external timeout or release-validation timeout and confirm progress past the previously hanging test. |
| AC-4 | When Semgrep cannot be used, quality-gates output still reports `rule_scan` unavailable/degraded rather than treating the scan as successful. | Inspect targeted test assertions or runtime output for the unavailable/degraded status. |
| AC-5 | The hotfix does not delete raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. | Review changed files and git diff for deletions or state cleanup operations. |
| AC-6 | The hotfix does not attempt to fix or reclassify the separate graph-indexer benchmark or worker-bundle failures. | Review changed files and test notes to confirm those failures remain out of scope unless independently addressed later. |
