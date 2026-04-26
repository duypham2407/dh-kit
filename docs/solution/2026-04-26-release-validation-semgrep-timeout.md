---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RELEASE-VALIDATION-SEMGREP-TIMEOUT
feature_slug: release-validation-semgrep-timeout
source_scope_package: docs/scope/2026-04-26-release-validation-semgrep-timeout.md
owner: SolutionLead
approval_gate: solution_to_fullstack
parallel_mode: none
---

# Solution Package: Release Validation Semgrep Timeout

## Recommended Path

Bound the Semgrep CLI availability probe in `packages/runtime/src/workflow/quality-gates-runtime.ts` with a small explicit timeout and treat every unusable probe outcome as fail-safe `rule_scan` unavailability instead of success or an unhandled hang. Add deterministic Vitest coverage in `packages/runtime/src/workflow/quality-gates-runtime.test.ts` so configured Semgrep tests no longer depend on the host machine's real `semgrep` binary. This is enough because the approved scope isolates the blocker to unbounded `spawnSync("semgrep", ["--version"])`; graph-indexer benchmark failures/timeouts and worker-bundle failures/timeouts stay outside this hotfix.

## Scope Dependency

- Upstream scope package: `docs/scope/2026-04-26-release-validation-semgrep-timeout.md`
- Approval context: `product_to_solution` is approved for active full-delivery hotfix `RELEASE-VALIDATION-SEMGREP-TIMEOUT`; this package is the Solution Lead handoff for `solution_to_fullstack` review.
- Scope boundary to preserve: do not delete, regenerate, normalize, move, truncate, or clean raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, or generated local state.
- Out-of-scope release blockers: graph-indexer benchmark failures/timeouts and worker-bundle failures/timeouts must be reported separately if they appear after this hotfix unblocks the Semgrep detection path.

## Chosen Approach

- Keep the production change at the existing `detectSemgrepCli()` boundary rather than reworking quality-gates architecture or scan execution bridges.
- Use `spawnSync("semgrep", ["--version"], { stdio: "ignore", timeout: <bounded-ms> })` or an equivalent narrow wrapper so Semgrep detection cannot wait indefinitely.
- Return success only when the bounded probe exits cleanly with `status === 0` and no timeout/error signal is present.
- Return fail-safe unavailability for missing executable, thrown launch error, non-zero exit, timeout, signal/termination, or any `result.error` condition.
- Make tests deterministic by controlling the child-process probe path in Vitest rather than accepting host-dependent `available`/`unavailable` outcomes.

## Impacted Surfaces

- `packages/runtime/src/workflow/quality-gates-runtime.ts`
  - Primary change: bound/fail-safe Semgrep CLI detection inside `detectSemgrepCli()`.
  - Preserve existing availability contract: no Semgrep config remains `not_configured`; configured but unusable Semgrep remains `unavailable`; only a successful bounded probe may become `available`.
- `packages/runtime/src/workflow/quality-gates-runtime.test.ts`
  - Primary test surface for configured `.semgrep.yml` behavior and Semgrep timeout/error/non-zero simulation.
  - Replace or supplement host-dependent assertions with controlled assertions for unavailable/fail-safe paths.
- `package.json`
  - Existing validation commands are sufficient: `npm run check` and `npm test` / targeted Vitest invocation. Do not add scripts or dependencies for this hotfix unless implementation discovers a real TypeScript/Vitest blocker.
- Explicitly not impacted: graph-indexer benchmark code/tests, worker-bundle code/tests, release-candidate state, workflow-state schema, raw Semgrep JSON artifacts, `{cwd}`, `.opencode` local runtime state, and generated local state.

## Boundaries And Components

- The production boundary is the Semgrep availability probe used by `resolveRuleScanAvailability(repoRoot)` before the runtime reports `rule_scan` availability.
- The runtime output boundary is the existing `QualityGateAvailabilityRecord` contract: `available | unavailable | not_configured` plus diagnostic `reason`.
- The test boundary is quality-gates runtime behavior in `packages/runtime/src/workflow/quality-gates-runtime.test.ts`; tests should not require an actual Semgrep installation.
- No release-state, workflow-state, task-board, `.opencode`, generated local-state, or raw scan-output mutation is part of this solution.
- No broader quality-gates feature work is included: scan execution remains lane-owned/additive exactly as before.

## Interfaces And Data Contracts

- `getQualityGateAvailabilitySnapshot(repoRoot)` must keep returning `QualityGateAvailabilitySnapshot` with the existing `contractVersion`, `catalog`, `gates`, and `summary` fields.
- `resolveRuleScanAvailability(repoRoot)` must keep returning:
  - `not_configured` when no supported Semgrep config exists.
  - `unavailable` when config exists but Semgrep is missing, times out, exits non-zero, throws, or otherwise cannot complete the bounded probe.
  - `available` only when config exists and the bounded Semgrep version probe succeeds.
- `normalizeRuleGateResult("rule_scan", availability)` must continue to treat non-available scans as `status: "not_run"` with limitations rather than pass/success.
- If the unavailable reason text changes, it must stay honest and diagnostic-friendly; it may mention timeout/non-response but must not imply a successful Semgrep scan.

## Risks And Trade-offs

- A timeout value that is too low can mark a slow but valid Semgrep install as unavailable. Prefer a conservative module-level constant that bounds release validation while allowing normal CLI startup; avoid test-only ultra-low production values.
- Broad mocking of `node:child_process` can hide unrelated behavior. Keep the test seam narrow and focused on Semgrep detection outcomes.
- `npm test` may still fail or time out later in graph-indexer benchmark or worker-bundle paths. Those failures are not acceptance failures for this hotfix unless caused by the Semgrep detection change.
- Adding a public export solely for tests can expand the runtime API unnecessarily. Prefer module mocking or the smallest local seam; if a helper is exported, document it as narrow and avoid broad internal exposure.
- Protected local/generated state is easy to disturb accidentally during validation. Implementation and QA must review the changed-file list before handoff.

## Dependencies

- Additional packages: none expected.
- Environment variables: none required.
- Tooling reality: repository `package.json` defines `npm run check` (`tsc --noEmit`) and `npm test` (`vitest run`), so use those commands for OpenKit repository/runtime validation.
- Semgrep remains optional. Absence, slowness, or failure of host Semgrep must produce unavailable/degraded quality-gate behavior, not a successful scan.

## Implementation Slices

### Slice 1: Bounded fail-safe Semgrep probe

- **Files**: `packages/runtime/src/workflow/quality-gates-runtime.ts`
- **Goal**: ensure `detectSemgrepCli()` cannot block indefinitely and returns `false` for timeout, missing executable, launch error, non-zero exit, termination signal, or any `spawnSync` error.
- **Validation Command**: `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts -t "rule_scan"`
- **Details**:
  - Add a named module-level timeout constant such as `SEMGREP_CLI_DETECTION_TIMEOUT_MS` with a bounded value chosen by implementation.
  - Pass the timeout into the Semgrep version probe or equivalent execution guard.
  - Treat `result.status === 0` as the only success path when no `result.error` or timeout/termination signal is present.
  - Treat all other outcomes as `false` and keep exceptions contained in the detection path.
  - Preserve current behavior for missing Semgrep config: the probe must not run when `.semgrep.yml`, `.semgrep.yaml`, `semgrep.yml`, or `semgrep.yaml` is absent.

### Slice 2: Deterministic quality-gates regression coverage

- **Files**: `packages/runtime/src/workflow/quality-gates-runtime.test.ts`
- **Goal**: prove configured Semgrep availability handling is deterministic and fail-safe without relying on real host Semgrep behavior.
- **Validation Command**: `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts`
- **Details**:
  - Add or tighten Vitest coverage for at least timeout/non-responsive and error/non-zero Semgrep probe outcomes.
  - Prefer `vi.mock`/spy control around `node:child_process` or a minimal local probe wrapper; avoid broad architecture changes.
  - Replace host-dependent expectations like `expect(["available", "unavailable"]).toContain(...)` for simulated unusable Semgrep with direct `rule_scan.availability === "unavailable"` assertions.
  - Keep existing `not_configured` assertions for repos without Semgrep config.
  - Ensure no test setup deletes or regenerates raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

### Slice 3: Release-validation smoke and boundary confirmation

- **Files**: no additional files expected beyond Slice 1 and Slice 2.
- **Goal**: show the formerly hanging quality-gates runtime path completes and classify any later release blockers correctly.
- **Validation Command**: `npm run check`, then `npm test` under the release-validation runner's external bound.
- **Details**:
  - Run targeted quality-gates runtime Vitest before broad validation.
  - Run TypeScript validation with `npm run check`.
  - Run broader `npm test` only after targeted coverage passes; use the release-validation environment's external timeout/bounds so future unrelated hangs are recorded rather than allowed to block indefinitely.
  - If graph-indexer benchmark or worker-bundle failures/timeouts appear after Semgrep detection no longer hangs, record them as separate out-of-scope blockers.
  - Review changed files and diff before handoff to confirm no protected raw/local/generated artifacts were deleted, regenerated, moved, truncated, or cleaned.

## Dependency Graph

- Sequential chain: Slice 1 bounded probe -> Slice 2 deterministic regression coverage -> Slice 3 broader release-validation smoke.
- Critical path: Semgrep probe timeout/fail-safe behavior -> configured `.semgrep.yml` unavailable assertions -> `npm test` progresses beyond quality-gates runtime Semgrep detection.
- Slice 2 depends on Slice 1 unless implementation introduces a narrow mockable probe seam first as part of Slice 1.
- Slice 3 depends on targeted Slice 1/2 validation so broad `npm test` failures can be classified as in-scope Semgrep regressions or out-of-scope release blockers.

## Parallelization Assessment

- parallel_mode: `none`
- why: this hotfix touches one runtime module and one directly coupled test file; splitting implementation would create overlap risk without meaningful speed gain.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1-BOUNDED-PROBE -> SLICE-2-DETERMINISTIC-TESTS -> SLICE-3-RELEASE-SMOKE`
- integration_checkpoint: before code review, confirm a configured repo with simulated timeout/error/non-zero Semgrep reports `rule_scan.availability === "unavailable"` and targeted Vitest completes without waiting on host Semgrep.
- max_active_execution_tracks: 1

## Validation Matrix

| Acceptance Target | Validation Path |
| --- | --- |
| AC-1: Semgrep availability/version detection is bounded | Code inspection verifies the Semgrep `spawnSync` probe has an explicit timeout or equivalent guard; targeted Vitest simulates timeout/non-response. |
| AC-2: missing, slow, non-responsive, non-zero, and launch-error Semgrep fail safe | Targeted tests or controlled mocks assert configured `rule_scan.availability === "unavailable"` and no unhandled exception is thrown. |
| AC-3: previously hanging quality-gates runtime Vitest path completes | `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts` completes without relying on a real host Semgrep process. |
| AC-4: release validation progresses past Semgrep detection | `npm test` is run under the release-validation runner's external bound and either completes or reaches a later separately classified blocker. |
| AC-5: unusable Semgrep is not treated as successful scan | Test assertions and `normalizeRuleGateResult` behavior confirm unusable Semgrep remains unavailable/not-run rather than pass/success. |
| AC-6: protected raw/local/generated state is preserved | Changed-file and diff review confirms no deletion, cleanup, movement, truncation, or regeneration of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing stores, or generated local state. |
| AC-7: graph-indexer benchmark and worker-bundle failures remain out of scope | Changed-file review and validation notes show no fixes or reclassification for graph-indexer benchmark or worker-bundle failures/timeouts. |
| AC-8: validation notes separate Semgrep resolution from unrelated blockers | Implementation/QA handoff records any later failures as out-of-scope unless directly caused by Semgrep detection changes. |

## Integration Checkpoint

- Required before `solution_to_fullstack` handoff is treated as implementation-ready: the implementing agent must be able to explain the exact Semgrep timeout/fail-safe path and the exact deterministic test seam.
- Required before code review: targeted quality-gates runtime Vitest passes and shows configured-but-unusable Semgrep becomes `unavailable` without hanging.
- Required before QA: broader `npm test` evidence either passes or clearly progresses beyond Semgrep detection and identifies any graph-indexer/worker-bundle result as out of scope.

## Rollback Notes

- Rollback is localized: revert changes to `packages/runtime/src/workflow/quality-gates-runtime.ts` and `packages/runtime/src/workflow/quality-gates-runtime.test.ts` if the timeout/fail-safe behavior causes an unexpected regression.
- Do not roll back by deleting generated state, raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or workflow-state backing stores.
- If the chosen timeout is too strict but the approach is correct, adjust the timeout constant and tests rather than removing the execution guard.

## Reviewer Focus Points

- Confirm the Semgrep CLI detection path is bounded in production code, not only in tests.
- Confirm every unusable Semgrep condition returns unavailable/fail-safe behavior and cannot mark `rule_scan` successful.
- Confirm tests are deterministic on machines with Semgrep installed, missing, slow, or broken.
- Confirm `getQualityGateAvailabilitySnapshot` and quality-gates report contracts remain backward compatible.
- Confirm no graph-indexer benchmark or worker-bundle fixes are hidden in the diff.
- Confirm no raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, workflow-state backing store, or generated local state was deleted, regenerated, moved, truncated, or cleaned.

## QA Focus Points

- Run the targeted quality-gates runtime Vitest path first: `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts`.
- Run `npm run check` for TypeScript validation.
- Run `npm test` under the release-validation runner's external bound and record whether it passes or advances to later out-of-scope failures/timeouts.
- Keep validation-surface language precise: these are OpenKit repository/runtime validations, not target-project application validations.
- Preserve raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, and generated local state throughout validation.

## Handoff Readiness

- **Solution package status**: pass.
- **Why**: one recommended approach is clear; affected surfaces are bounded to the Semgrep detection helper and direct tests; slices are sequential and actionable; validation uses real repository commands; protected state and out-of-scope release blockers are explicitly guarded.
