---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RELEASE-VALIDATION-VITEST-HANG
feature_slug: release-validation-vitest-hang
release_candidate: linux-macos-runtime-hardening-rc
source_scope_package: docs/scope/2026-04-26-release-validation-vitest-hang.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Release Validation Vitest Hang Hotfix

## Recommended Path

Add a small bounded Semgrep CLI detection wrapper in `packages/runtime/src/workflow/quality-gates-runtime.ts` and make the corresponding Vitest coverage deterministic by controlling the Semgrep detection path instead of depending on the host `semgrep` binary behavior. This is enough because diagnostics isolated the release-validation hang to unbounded `spawnSync("semgrep", ["--version"])` when `.semgrep.yml` is present; the hotfix does not need a quality-gates architecture rewrite.

## Impacted Surfaces

- `packages/runtime/src/workflow/quality-gates-runtime.ts`
  - Bound `detectSemgrepCli()` execution so Semgrep absence, slowness, or non-response returns a controlled unavailable result instead of blocking Vitest indefinitely.
- `packages/runtime/src/workflow/quality-gates-runtime.test.ts`
  - Add deterministic coverage for configured `.semgrep.yml` behavior without relying on an unbounded real host Semgrep process.
- `package.json`
  - Existing validation path is `npm test` (`vitest run`) and `npm run check` (`tsc --noEmit`); do not add new tooling for this hotfix unless implementation genuinely requires it.

## Boundaries And Components

- Keep the change inside quality-gates Semgrep availability detection and its targeted tests.
- Preserve the existing contract that `rule_scan` is `not_configured` when no Semgrep config exists and `unavailable` when config exists but Semgrep cannot be executed successfully.
- Do not execute, delete, regenerate, or clean up raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.
- Do not attempt to fix or reclassify graph-indexer benchmark failures or worker-bundle timeouts discovered after bypassing the hang.

## Implementation Approach

- Replace the unbounded Semgrep probe with a fail-safe bounded call, for example `spawnSync("semgrep", ["--version"], { stdio: "ignore", timeout: <small-ms-value> })`.
- Treat any non-zero status, thrown error, timeout signal/error, or missing binary as Semgrep unavailable for the `rule_scan` availability record.
- Keep the availability reason user-facing and diagnostic-friendly: configuration exists, but Semgrep CLI was not detected or did not respond within the bounded probe.
- Make the unit test deterministic by isolating the detection behavior from the host environment; acceptable approaches include dependency-injecting the probe behind a narrow internal seam, mocking `node:child_process` in Vitest, or adding a test-only controllable helper. Choose the smallest seam that keeps production behavior clear.
- Avoid broad refactors of `buildWorkflowQualityGateReport`, gate catalog shape, workflow stages, release-candidate state, or scan execution semantics.

## Implementation Slices

### Slice 1: Bounded Semgrep detection

- **Files:** `packages/runtime/src/workflow/quality-gates-runtime.ts`
- **Goal:** `detectSemgrepCli()` cannot hang indefinitely and returns `false` for missing, slow, timed-out, or unsuccessful Semgrep probes.
- **Validation hook:** targeted Vitest coverage for configured `.semgrep.yml` unavailable/timeout behavior.

### Slice 2: Deterministic quality-gates regression test

- **Files:** `packages/runtime/src/workflow/quality-gates-runtime.test.ts`
- **Goal:** The test covering configured `.semgrep.yml` no longer depends on real host Semgrep behavior and completes consistently.
- **Validation hook:** run the narrowest Vitest command available for this file/test name before the full suite.

### Slice 3: Release-validation smoke

- **Files:** no production surface beyond Slice 1/2 unless TypeScript import shape requires a small test seam.
- **Goal:** Confirm `npm test` progresses past the previously hanging quality-gates test.
- **Validation hook:** run `npm test` with an external bounded timeout or release-validation timeout; record any later graph-indexer benchmark or worker-bundle failures as separate blockers, not regressions in this hotfix.

## Dependency Graph

- Slices are sequential: bounded production probe -> deterministic unit coverage -> bounded full-suite smoke.
- Critical path: Semgrep probe timeout -> configured `.semgrep.yml` test determinism -> `npm test` progress evidence.
- `parallel_mode`: `none`; the hotfix touches one runtime module and one directly coupled test file.
- Integration checkpoint: verify quality-gates reports configured-but-unusable Semgrep as unavailable and the release-validation run advances beyond `quality-gates-runtime.test.ts`.

## Validation Plan

1. Run TypeScript validation:
   - `npm run check`
2. Run targeted Vitest validation for the isolated hang path, using the narrowest supported Vitest invocation for `packages/runtime/src/workflow/quality-gates-runtime.test.ts` and/or the `marks rule_scan unavailable...` test name.
3. Run release-validation smoke:
   - `npm test` under an external bounded timeout so a future unrelated hang is recorded rather than allowed to block indefinitely.
4. If `npm test` proceeds past `quality-gates-runtime.test.ts` but later fails or times out in graph-indexer benchmark or worker-bundle tests, classify those as separate release blockers outside this hotfix.
5. Review the diff to confirm no deletions or cleanup operations touch raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Validation Matrix

| Acceptance Target | Validation Path |
| --- | --- |
| AC-1: bounded Semgrep check | Code inspection plus targeted test/mocked timeout path showing the probe returns unavailable instead of blocking. |
| AC-2: previously hanging test completes | Targeted Vitest run for `quality-gates-runtime.test.ts` / `marks rule_scan unavailable...`. |
| AC-3: `npm test` progresses past hang | Bounded `npm test` run confirms progress beyond quality-gates runtime tests. |
| AC-4: unusable Semgrep is not treated as success | Assertion that configured-but-unusable Semgrep yields `rule_scan.availability === "unavailable"` or the existing unavailable/degraded contract. |
| AC-5: local/generated state preserved | Diff review shows no deletion of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. |
| AC-6: unrelated blockers remain separate | Test notes identify graph-indexer benchmark and worker-bundle failures/timeouts as out of scope if encountered after bypass. |

## Risks And Trade-offs

- Timeout value too low could mark a slow but usable Semgrep install as unavailable; prefer a conservative small bounded probe that protects tests while allowing normal CLI startup.
- Mocking `node:child_process` too broadly could mask integration behavior; keep test seams narrow and assert the availability contract, not implementation trivia.
- `npm test` may still fail after this hotfix because of graph-indexer benchmark or worker-bundle blockers; those must be reported separately so this hotfix remains focused.

## Non-Goals

- No graph-indexer benchmark fix.
- No worker-bundle timeout/failure fix.
- No quality-gates architecture rewrite or scan execution bridge expansion.
- No release-candidate state, workflow-state, or local generated-state mutation.
- No deletion of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Reviewer Focus Points

- Confirm Semgrep detection is bounded and fail-safe in all error paths.
- Confirm deterministic tests do not depend on the developer machine having or not having Semgrep installed.
- Confirm quality-gates availability semantics remain compatible with existing callers.
- Confirm the implementation does not touch out-of-scope release blockers or protected local/generated artifacts.
