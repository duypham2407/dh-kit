---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: RELEASE-VALIDATION-VITEST-TIMEOUT
feature_slug: release-validation-vitest-timeout
source_scope_package: docs/scope/2026-04-26-release-validation-vitest-timeout.md
owner: SolutionLead
approval_gate: solution_to_fullstack
parallel_mode: none
---

# Solution Package: Release Validation Vitest Timeout Hotfix

## Recommended Path

Bound the Semgrep CLI availability probe inside `packages/runtime/src/workflow/quality-gates-runtime.ts` with a small `spawnSync` timeout and treat every timeout, launch error, non-zero exit, or missing binary as a fail-safe unavailable `rule_scan` result. Add deterministic Vitest coverage in `packages/runtime/src/workflow/quality-gates-runtime.test.ts` for the configured-but-unusable Semgrep path so release validation no longer depends on real host Semgrep behavior. This is enough because the approved scope isolates the blocker to unbounded Semgrep detection; graph-indexer benchmark and worker-bundle failures/timeouts remain separate release issues.

## Scope Dependency

- Upstream scope package: `docs/scope/2026-04-26-release-validation-vitest-timeout.md`
- Goal traced from scope: prevent quality-gates runtime tests and `npm test` from hanging on `spawnSync("semgrep", ["--version"])`.
- This artifact intentionally does not edit workflow state, release state, `.opencode` local runtime state, generated local state, raw Semgrep JSON, or `{cwd}` content.

## Impacted Surfaces

- `packages/runtime/src/workflow/quality-gates-runtime.ts`
  - Add a bounded/fail-safe Semgrep detection path, most likely in `detectSemgrepCli()`.
  - Preserve existing `rule_scan` availability semantics: no Semgrep config remains `not_configured`; configured but unusable Semgrep remains `unavailable`; only a successful bounded probe may be `available`.
- `packages/runtime/src/workflow/quality-gates-runtime.test.ts`
  - Add or tighten deterministic coverage for slow, timed-out, missing, or errored Semgrep detection.
  - Avoid assertions that depend on whether the developer or CI host has a working Semgrep binary.
- `package.json`
  - Existing validation commands are sufficient: `npm run check` and `npm test` / targeted Vitest invocation. Do not add dependencies or scripts for this hotfix unless implementation discovers a genuine blocker.

## Technical Risks

- A timeout that is too low can mark a valid but cold Semgrep install as unavailable. Prefer a conservative module-level constant that bounds tests and release validation without pretending slow startup is success.
- A broad test mock can hide production behavior. Keep the seam narrow: test the Semgrep probe outcome and quality-gates availability contract, not unrelated gate aggregation internals.
- `npm test` may progress past quality-gates runtime and then expose graph-indexer benchmark or worker-bundle failures/timeouts. Those are explicitly out of scope and must be reported separately, not fixed under this hotfix.

## Dependencies

- Additional packages: none expected.
- Environment variables: none required.
- Runtime assumptions: Semgrep remains optional. The quality-gates runtime must degrade to `rule_scan.availability === "unavailable"` when Semgrep cannot complete the bounded probe.

## Solution Slices

### Slice 1: Bounded fail-safe Semgrep probe

- **Files**: `packages/runtime/src/workflow/quality-gates-runtime.ts`
- **Goal**: `detectSemgrepCli()` cannot block indefinitely and returns `false` for timeout, missing CLI, thrown launch error, non-zero exit, or terminated probe.
- **Validation Command**: `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts -t "rule_scan"`
- **Details**:
  - Add a module-level timeout constant for Semgrep CLI detection, for example `SEMGREP_CLI_DETECTION_TIMEOUT_MS = 1_000` or another clearly bounded value chosen by implementation.
  - Call `spawnSync("semgrep", ["--version"], { stdio: "ignore", timeout: SEMGREP_CLI_DETECTION_TIMEOUT_MS })` or an equivalent narrow wrapper.
  - Return success only when the probe exits cleanly with status `0` and no timeout/error signal is present.
  - Return `false` on `result.error`, `result.status !== 0`, timeout/termination signal, or caught exception.
  - Keep user-facing reason text consistent with the existing unavailable contract; it may mention that Semgrep was not detected or did not respond within the bounded probe.

### Slice 2: Deterministic quality-gates regression coverage

- **Files**: `packages/runtime/src/workflow/quality-gates-runtime.test.ts`
- **Goal**: Configured `.semgrep.yml` tests prove fail-safe `rule_scan` behavior without relying on the host machine's actual Semgrep installation.
- **Validation Command**: `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts`
- **Details**:
  - Add deterministic coverage for at least one timeout/non-responsive Semgrep probe and one launch/error or non-zero probe path.
  - Prefer a narrow test seam such as spying/mocking the child-process probe, or a tiny injectable wrapper local to the module. Avoid exporting broad internal runtime state just for tests.
  - Replace loose host-dependent expectations such as `available` or `unavailable` with controlled assertions when the test is simulating unusable Semgrep.
  - Preserve existing coverage that no Semgrep config yields `rule_scan.availability === "not_configured"`.

### Slice 3: Release-validation smoke and scope guard

- **Files**: no additional files expected beyond Slice 1 and Slice 2.
- **Goal**: Demonstrate that the previously hanging Vitest path completes and that any later release-validation failures are classified outside this hotfix.
- **Validation Command**: `npm test` under the release-validation runner's external timeout/bounds.
- **Details**:
  - Run the targeted quality-gates runtime test first, then `npm run check`, then the broader `npm test` smoke.
  - If `npm test` reaches later graph-indexer benchmark or worker-bundle failures/timeouts, record those as separate blockers and do not expand this solution to address them.
  - Review changed files before handoff to confirm there are no deletion, cleanup, or regeneration operations against raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state.

## Dependency Graph

- Slice order is sequential: bounded probe first, deterministic tests second, broader release-validation smoke third.
- Critical path: `detectSemgrepCli()` timeout/fail-safe behavior -> deterministic `rule_scan` unavailable assertions -> `npm test` progress beyond quality-gates runtime.
- `parallel_mode`: `none`. The production helper and its direct test are tightly coupled, and parallel execution would add coordination risk without meaningful speed benefit.
- Integration checkpoint: before code review, confirm `getQualityGateAvailabilitySnapshot(repoWithSemgrepConfig).gates.rule_scan.availability` is controlled and unavailable when the Semgrep probe is missing, errored, non-zero, or timed out.

## Validation Matrix

| Acceptance Target | Validation Path |
| --- | --- |
| AC-1: Semgrep availability/version detection is bounded | Code inspection verifies `spawnSync("semgrep", ["--version"])` has a timeout or equivalent bound; targeted test simulates timeout/non-response. |
| AC-2: Missing, slow, non-responsive, non-zero, or errored Semgrep fails safe | Targeted Vitest assertions cover timeout/error/non-zero paths and expect `rule_scan.availability === "unavailable"` for configured Semgrep. |
| AC-3: Previously hanging quality-gates runtime Vitest path completes | `npm test -- packages/runtime/src/workflow/quality-gates-runtime.test.ts` completes without waiting on real host Semgrep. |
| AC-4: Release validation progresses past Semgrep detection | `npm test` is run under external release-validation bounds and reaches completion or a later, separately classified blocker. |
| AC-5: Unusable Semgrep is not treated as success | Runtime test or inspection confirms no timeout/error/non-zero probe can mark `rule_scan` as successful/available. |
| AC-6: Protected local/generated artifacts are preserved | Git diff/changelist review confirms no deletion or regeneration of raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state. |
| AC-7: Unrelated release blockers remain out of scope | Changelist and verification notes show no graph-indexer benchmark or worker-bundle failure/timeout fixes. |

## Reviewer Focus Points

- Confirm every Semgrep probe path is bounded and fail-safe.
- Confirm tests are deterministic across machines with Semgrep installed, missing, slow, or broken.
- Confirm existing quality-gates output still marks `rule_scan` unavailable/degraded rather than successful when Semgrep cannot be executed.
- Confirm no workflow-state, release-state, raw Semgrep JSON, `{cwd}`, `.opencode` local runtime state, or generated local state deletion/regeneration occurs.
- Confirm no graph-indexer benchmark or worker-bundle fixes are hidden in this hotfix.

## QA Focus Points

- Run the narrow quality-gates runtime Vitest path before the full suite.
- Run `npm run check` for TypeScript validation.
- Run `npm test` with an external release-validation bound and record whether it passes or advances to later out-of-scope blockers.
- Preserve separate evidence labels: OpenKit runtime test evidence is runtime/repository validation, not target-project application validation.

## Handoff Readiness

- **Solution package status**: pass.
- **Why**: one recommended approach is clear, impacted surfaces are bounded to the Semgrep availability path and direct tests, slices are sequential and actionable, validation commands match existing repository scripts, and protected/out-of-scope artifacts are explicitly guarded.
