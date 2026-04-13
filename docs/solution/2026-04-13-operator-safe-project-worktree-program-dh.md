# Solution Package: Operator-safe Project/Worktree Program (DH)

**Date:** 2026-04-13  
**Scope reference:** `docs/scope/2026-04-13-operator-safe-project-worktree-program-dh.md`  
**Planning references:**
- `docs/opencode/operator-safe-project-worktree-master-plan-dh.md`
- `docs/opencode/operator-safe-project-worktree-program-master-checklist-dh.md`

---

## Recommended Path

- Build the program as a **single operator-safe execution layer** that extends the completed discovery, segmentation, and preflight assets into one bounded lifecycle: **preflight -> prepare -> apply -> report -> cleanup / rollback-light**.
- Keep the core path **workspace-truth-first and temp-workspace-first**. Treat any future git worktree integration as an **optional adapter decision after the internal lifecycle is stable**, not as the starting point.

Why this is enough:
- DH already has the right foundation in `detect-projects`, `scan-paths`, and the current operator-safe preflight utility.
- The missing value is not another discovery slice; it is a coherent runtime envelope, shared contract expansion, and operator-facing reporting/hygiene.
- This path closes the program without drifting into branch/worktree platform parity.

---

## Current DH Baseline That Must Be Preserved

- `packages/intelligence/src/workspace/detect-projects.ts` is already the discovery and segmentation source for workspace roots, markers, and partial-scan coverage.
- `packages/intelligence/src/workspace/scan-paths.ts` already centralizes canonical path and boundary helpers.
- `packages/shared/src/types/operator-worktree.ts` already defines the initial preflight contract, mode vocabulary, and reason/warning structure.
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts` already provides the bounded preflight gateway for `index_workspace`.
- `packages/runtime/src/jobs/index-job-runner.ts` and `packages/runtime/src/diagnostics/debug-dump.ts` already consume the preflight slice in advisory/summary form.
- DH has real validation tooling for TypeScript and tests via:
  - `npm run check`
  - `npm test`

No solution slice should reopen completed scan hardening, marker-driven segmentation, or the current preflight utility slice except where direct contract integration is required.

---

## Architecture Decisions

### AD-1: One operator-safe lifecycle, not per-callsite behavior
- Sensitive project/worktree operations must converge on one runtime lifecycle and one shared vocabulary.
- Jobs and diagnostics may consume the lifecycle at different strengths, but they must not invent separate safety semantics.

### AD-2: Intelligence remains the sole workspace/boundary truth
- `detect-projects.ts` and `scan-paths.ts` stay authoritative for canonical path resolution, workspace membership, marker detection, and partial-scan metadata.
- Runtime code may cache or pass this truth forward, but must not create a second workspace identity model.

### AD-3: Shared types own the contract; runtime owns execution
- `packages/shared/src/types/operator-worktree.ts` should expand from preflight-only types into the stable program contract surface.
- Runtime modules in `packages/runtime/src/workspace/` should implement prepare/apply/report/cleanup behavior against those contracts.
- Diagnostics and jobs consume the shared contract; they do not define parallel schemas.

### AD-4: Core execution stays bounded and policy-driven
- Supported operations must be explicitly cataloged.
- Allowed surfaces, failure classes, and `dry_run` / `execute` parity must be defined by policy rather than ad hoc callsite logic.
- Unsupported operations must fail as unsupported rather than silently widening scope.

### AD-5: Snapshot and rollback-light are metadata-first, not backup-system behavior
- Snapshot capability should capture the minimum metadata required to explain and, where supported, reverse bounded operations.
- DH should not promise universal undo, transactional rollback, or full backup semantics.

### AD-6: Temp isolation is internal-first
- The default isolation mechanism should be an internal temp workspace or staging-area abstraction controlled by DH policy.
- This keeps the core lifecycle independent of git worktree and avoids early parity creep.

### AD-7: Execution reporting is a first-class program output
- Every bounded operation must produce one report shape covering preflight, prepare, apply, warnings, cleanup, and recommended next action.
- `debug-dump.ts` should summarize and point to these reports rather than becoming the report store itself.

### AD-8: Maintenance is part of done, not follow-up polish
- Temp, snapshot, and report artifacts introduce runtime residue.
- List/inspect/prune/cleanup utilities are mandatory completion work for the program, not deferred cleanup.

### AD-9: Optional worktree wrapper is a late-stage go/no-go decision
- The wrapper is only justified if the core lifecycle is already working and there is a clear isolation gap that temp workspaces cannot cover.
- If approved, it must reuse the same preflight, snapshot, reporting, and maintenance model.

---

## Impacted Surfaces And Technical Risks

### Primary surfaces
- `packages/shared/src/types/operator-worktree.ts`
- `packages/intelligence/src/workspace/detect-projects.ts`
- `packages/intelligence/src/workspace/scan-paths.ts`
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
- `packages/runtime/src/workspace/` (new program modules)
- `packages/runtime/src/jobs/index-job-runner.ts`
- `packages/runtime/src/diagnostics/debug-dump.ts`

### Secondary validation and integration surfaces
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
- `packages/runtime/src/jobs/index-job-runner.test.ts`
- New tests under `packages/runtime/src/workspace/`

### Program risks that change execution behavior
- **Contract drift:** shared, runtime, and diagnostics may diverge if report/result semantics are not frozen first.
- **Premature worktree complexity:** starting with a git worktree wrapper would pull scope into VCS orchestration before the internal envelope is proven.
- **Preflight-only stagnation:** if snapshot/apply/report are postponed, DH remains advisory-heavy and does not close the operator-safe story.
- **Artifact debt:** temp/snapshot/report artifacts will accumulate unless maintenance utilities ship with the core lifecycle.
- **Gateway bypass:** individual jobs may reintroduce local checks/apply logic unless the gateway becomes the required entry surface.

---

## Target Files / Modules By Capability Area

## 1. Contract freeze and shared vocabulary
- **Expand:** `packages/shared/src/types/operator-worktree.ts`
  - grow from preflight-only types into program types for:
    - operation catalog
    - risk class
    - execution stage/result classification
    - snapshot manifest/result
    - bounded apply request/result
    - rollback-light result
    - execution report summary
    - maintenance action summary
- **Review for reuse only:** `packages/shared/src/types/execution-envelope.ts`
  - reuse where terminology already aligns; do not force-fit if it weakens operator-safe clarity.

## 2. Boundary truth and operation context mapping
- **Preserve / lightly extend:** `packages/intelligence/src/workspace/detect-projects.ts`
  - keep ownership of workspace detection, markers, coverage, and partial-scan metadata.
- **Preserve / lightly extend:** `packages/intelligence/src/workspace/scan-paths.ts`
  - keep canonical path normalization and workspace-relative path helpers as the only path truth.
- **No new parallel workspace model** in runtime.

## 3. Preflight gateway and intent normalization
- **Refine:** `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - remain the gateway entrypoint.
  - normalize intent/mode/risk handling and dispatch to deeper lifecycle modules.
  - keep `check` advisory semantics where callsites need advisory-only behavior.

## 4. Snapshot and rollback-light foundations
- **Create:** `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`
  - snapshot manifest creation and capture metadata.
- **Create:** `packages/runtime/src/workspace/operator-safe-project-worktree-rollback-light.ts`
  - bounded rollback execution where snapshot/apply metadata supports it.

## 5. Temp isolation lifecycle
- **Create:** `packages/runtime/src/workspace/operator-safe-temp-workspace.ts`
  - create/use/cleanup lifecycle for temp or staging areas.
  - stale detection and TTL policy hooks.

## 6. Bounded apply execution
- **Create:** `packages/runtime/src/workspace/operator-safe-bounded-apply.ts`
  - policy-driven apply surface.
  - parity rules for `dry_run` and `execute`.
  - capture apply metadata for reporting and rollback-light.

## 7. Execution reporting and operator summaries
- **Create:** `packages/runtime/src/workspace/operator-safe-execution-report.ts`
  - one report shape for success, blocked, failed, cleanup-failed, and rollback-degraded outcomes.
- **Integrate:** `packages/runtime/src/diagnostics/debug-dump.ts`
  - consume recent operator-safe report summaries instead of inventing a second reporting contract.

## 8. Callsite integration and gateway enforcement
- **Update:** `packages/runtime/src/jobs/index-job-runner.ts`
  - move from current advisory-only preflight consumption toward the frozen gateway/report model for supported operation classes.
  - preserve current `index_workspace` behavior while the broader catalog is phased in.
- **Search and review other callsites under:** `packages/runtime/src/jobs/`
  - any sensitive project/worktree operation added later must reuse the same gateway.

## 9. Maintenance and hygiene
- **Create:** `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`
  - list/inspect/prune temp workspaces, snapshots, and execution artifacts.

## 10. Optional adapter only if justified later
- **Optional create:** `packages/runtime/src/workspace/operator-safe-worktree-wrapper.ts`
  - git worktree adapter only after explicit go decision.
  - must remain thin and reuse lifecycle modules above.

---

## Program Phases And Sequencing

### Phase 0 — Program alignment and baseline lock
- Confirm completed assets as frozen inputs: scan hardening, segmentation, preflight utility slice.
- Confirm owner/cadence/reporting format and the first supported operation wave.
- Output: explicit baseline statement and initial supported operation set starting from current `index_workspace` reality.
- Dependency: none.

### Phase 1 — Contract and boundary freeze
- Freeze vocabulary for operation intent, risk class, reason/warning codes, failure classes, and supported vs unsupported catalog.
- Freeze workspace truth -> operation context mapping using existing intelligence surfaces.
- Separate advisory-only checks from execution-gating checks.
- Expand shared types before deeper runtime modules start depending on new semantics.
- Dependency: Phase 0.

### Phase 2 — Snapshot and rollback-light foundations
- Define minimal snapshot metadata and when snapshot is mandatory.
- Define rollback-light support boundaries, degraded states, and explicit unsupported cases.
- Ensure snapshot data is sufficient for operator explanation even where rollback is unavailable.
- Dependency: Phase 1.

### Phase 3 — Temp workspace / isolated target lifecycle
- Introduce internal temp/staging workspace lifecycle.
- Add boundary enforcement, stale detection, and cleanup rules.
- Keep isolation optional by policy and operation risk, not mandatory for every flow.
- Dependency: Phase 1; overlaps with Phase 2 only after contract freeze is complete.

### Phase 4 — Bounded apply execution helpers
- Implement supported apply surfaces and policy checks.
- Freeze `dry_run` / `execute` parity semantics.
- Capture apply metadata required by reporting and rollback-light.
- Begin blocking callsite bypass for supported operation classes.
- Dependency: Phases 1-3.

### Phase 5 — Execution reporting and operator summaries
- Introduce the canonical execution report module and failure classification.
- Route jobs and diagnostics to consume the same report/result vocabulary.
- Ensure blocked, successful, failed, cleanup-failed, and rollback-degraded outcomes are all represented.
- Dependency: Phases 2-4.

### Phase 6 — Maintenance utilities and hygiene
- Build inspect/list/prune/cleanup utilities against real temp, snapshot, and report artifacts produced by prior phases.
- Document routine maintenance and degraded-run cleanup expectations.
- Dependency: Phases 3-5.

### Phase 7 — Optional worktree wrapper decision point
- Evaluate whether the stabilized internal lifecycle still leaves a justified isolation gap.
- Make a formal go/no-go decision using the decision frame below.
- If go, implement as a thin adapter only.
- Dependency: Phases 1-6 complete enough to judge real gaps.

### Phase 8 — Validation and closure
- Validate one end-to-end successful bounded flow.
- Validate main blocked, failed, cleanup-failed, and rollback-degraded paths.
- Validate maintenance utilities on real artifacts.
- Close only when the program-level DoD and scope acceptance criteria are met.
- Dependency: all prior phases.

### Critical path
- **Contract freeze -> snapshot/temp foundations -> bounded apply -> execution reporting -> maintenance -> optional wrapper decision -> closure**

### Parallelization guidance
- Shared contract work and runtime execution work should not proceed in parallel until Phase 1 semantics are frozen.
- Snapshot and temp-workspace module design can progress in parallel only after Phase 1, with an integration checkpoint before apply/report work starts.
- Diagnostics and maintenance should follow artifact/report stabilization, not lead it.

---

## Solution Slices

### Slice 1: Freeze the program contract
- **Goal:** turn the current preflight slice into the stable contract base for the full program.
- **Files:**
  - `packages/shared/src/types/operator-worktree.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - targeted consumers in `packages/runtime/src/jobs/index-job-runner.ts` and `packages/runtime/src/diagnostics/debug-dump.ts`
- **Validation:** `npm run check && npm test`
- **Reviewer focus:** vocabulary stability, separation of advisory vs execution gating, no parallel workspace truth model.

### Slice 2: Add prepare-phase foundations
- **Goal:** define snapshot and temp workspace capabilities that prepare bounded execution safely.
- **Files:**
  - `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`
  - `packages/runtime/src/workspace/operator-safe-temp-workspace.ts`
  - supporting shared types in `packages/shared/src/types/operator-worktree.ts`
- **Validation:** `npm run check && npm test`
- **Reviewer focus:** metadata sufficiency, bounded scope, cleanup and stale policy clarity.

### Slice 3: Add bounded apply and rollback-light contract
- **Goal:** establish the first supported operation classes that can move from preflight/prepare into controlled apply.
- **Files:**
  - `packages/runtime/src/workspace/operator-safe-bounded-apply.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-rollback-light.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - `packages/shared/src/types/operator-worktree.ts`
- **Validation:** `npm run check && npm test`
- **Reviewer focus:** `dry_run` / `execute` parity, explicit unsupported cases, no overclaiming rollback behavior.

### Slice 4: Standardize execution reporting
- **Goal:** ensure every supported operation yields one inspectable operator-safe report.
- **Files:**
  - `packages/runtime/src/workspace/operator-safe-execution-report.ts`
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - `packages/shared/src/types/operator-worktree.ts`
- **Validation:** `npm run check && npm test`
- **Reviewer focus:** consistency across success/block/failure/degraded paths and diagnostics consumption.

### Slice 5: Add maintenance utilities and close gateway bypasses
- **Goal:** keep the operator-safe layer operable over time and prevent contract drift at callsites.
- **Files:**
  - `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`
  - `packages/runtime/src/jobs/index-job-runner.ts`
  - other relevant job callsites under `packages/runtime/src/jobs/`
  - docs/runbook surface if maintenance guidance is added
- **Validation:** `npm run check && npm test`
- **Reviewer focus:** artifact hygiene, real cleanup paths, gateway reuse discipline.

### Slice 6: Decide optional worktree wrapper
- **Goal:** explicitly conclude whether DH needs a git worktree adapter after the core lifecycle is proven.
- **Files:**
  - if no-go: documentation and decision record only
  - if go: `packages/runtime/src/workspace/operator-safe-worktree-wrapper.ts` plus minimal shared/runtime updates
- **Validation:** `npm run check && npm test` for code paths; if no-go, document evidence and closure rationale
- **Reviewer focus:** no parity drift, optionality preserved, reuse of core lifecycle modules.

---

## Validation Strategy

## Repository-backed commands
- Type safety: `npm run check`
- Automated tests: `npm test`

## Validation matrix

| Target | What must be proven | Validation path |
|---|---|---|
| Contract freeze | One shared vocabulary and lifecycle, no conflicting semantics | `npm run check`, targeted tests for contract consumers, doc review against scope |
| Boundary reuse | Runtime continues to use `detect-projects` and `scan-paths` as truth | unit tests around workspace/path context mapping; review imports and no parallel model additions |
| Snapshot behavior | Supported side-effecting operations require and produce bounded snapshot metadata | unit tests for snapshot manifest creation and prepare failures |
| Temp lifecycle | Temp/staging areas have create/use/cleanup and stale handling | unit tests plus integration-style temp artifact lifecycle tests |
| Bounded apply parity | `dry_run` and `execute` match on decision semantics for supported operations | paired tests for allow/block/conflict/failure paths |
| Rollback-light boundaries | supported / degraded / unavailable states are explicit | tests covering rollback-supported, rollback-degraded, and unsupported cases |
| Execution reports | one report shape covers blocked, successful, failed, cleanup-failed, and degraded outcomes | report-shape tests and diagnostics consumption tests |
| Maintenance utilities | real artifacts can be listed, inspected, and pruned | integration tests against generated temp/snapshot/report artifacts |
| Current integrations | `index-job-runner` and `debug-dump` remain aligned with the new contract | update existing test suites and add focused regression tests |

## Required program closure evidence
- At least one successful end-to-end bounded flow.
- At least one blocked preflight flow.
- At least one prepare/apply failure path.
- At least one rollback-degraded or rollback-unavailable path.
- Maintenance proof that stale artifacts can be inspected and cleaned.

---

## Compatibility And Bounded-Scope Notes

- DH remains an **operator-safe bounded layer**, not a repo-management or VCS lifecycle platform.
- The current completed discovery and segmentation work is preserved as-is except for direct contract integration needs.
- `index_workspace` is the only explicitly visible supported operation in the current codebase; contract freeze must not pretend broader support until additional operations are actually added.
- `check` mode must retain advisory semantics where current integrations rely on advisory-only behavior.
- The program must not assume git worktree, branch lifecycle support, merge/rebase/reset orchestration, or universal rollback.
- Diagnostics should summarize and link to operator-safe execution state, not replace it with a second reporting system.
- No new dependency is required for the core program path based on current repository reality. A future worktree adapter must not become a required dependency for core flows.

---

## Optional Worktree Wrapper: Explicit Go / No-Go Decision Frame

## Default position
- **Default: No-Go until core lifecycle is stable.**

## Go only if all of the following are true
- Phases 1-6 are materially complete and validated.
- Internal temp workspace/staging lifecycle has been proven and a real isolation gap still remains.
- The gap is specific, recurring, and valuable enough to justify git worktree complexity.
- The wrapper can reuse the same:
  - preflight gateway
  - snapshot model
  - bounded apply semantics
  - execution reporting
  - maintenance utilities
- The wrapper can stay optional and thin without introducing branch/worktree lifecycle management.

## No-Go if any of the following is true
- The request for worktree support is mainly aspirational parity with upstream behavior.
- Core temp workspace handling already covers DH's practical operator needs.
- The adapter would require DH to manage branch lifecycle, merge/rebase/reset flows, or broad git porcelain behavior.
- The adapter would force contract expansion before the internal lifecycle is mature.
- The adapter would become a hidden prerequisite for normal operator-safe flows.

## Decision outputs
- **No-Go:** document temp workspace as the long-term default and close the program without wrapper implementation.
- **Conditional Go:** implement only a thin adapter module and keep it explicitly non-core.

---

## Handoff Notes

### FullstackAgent must preserve
- intelligence-owned workspace truth
- advisory vs execution-gating distinctions
- bounded rollback claims only
- temp-workspace-first core path
- no bypass around the operator-safe gateway for supported sensitive operations

### Code Reviewer must check
- shared/runtime/diagnostics contract consistency
- no parallel workspace model or duplicate report schema
- no premature worktree/VCS platform behavior
- tests cover blocked, successful, failed, and degraded paths

### QA Agent must verify
- one real successful bounded flow
- failure classification paths and recommended actions
- maintenance cleanup on real artifacts
- optional wrapper is either absent with documented no-go, or present as a thin optional adapter only
