---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: OPERATOR-SAFE-WORKTREE-COMPLETION
feature_slug: operator-safe-worktree-completion
source_scope_package: docs/scope/2026-04-23-operator-safe-worktree-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Operator Safe Worktree Completion

## Recommended Path

- Add one dedicated first-class operator surface, `dh operator-safe-maintenance`, for `list`, `inspect`, `prune`, and `cleanup`.
- Keep operator-safe artifact truth in the existing TypeScript shared/runtime layer under `.dh/runtime/operator-safe-worktree/`; do not route this feature through workflow-state surfaces and do not add Rust bridge work in the first wave.
- Freeze a shared artifact identity model so reports, snapshots, and temp workspaces are inspectable as linked lifecycle outputs instead of bare filenames.
- Keep `dh doctor --debug-dump` as a secondary summary and pointer surface only; it must not become the maintenance API or the delete authority.

Why this is enough:

- Repository reality already includes bounded operator-safe lifecycle execution, persisted reports, persisted snapshots, temp workspace creation, summary consumption in `debug-dump`, and helper-level list/prune code.
- The remaining completion gap is operator-facing maintenance truth and bounded cleanup semantics, not a new lifecycle, not a new git worktree wrapper, and not broader platform management.
- A dedicated maintenance command plus tighter artifact contracts closes the program without widening the supported execution catalog beyond current `index_workspace` reality.

## Impacted Surfaces

### Shared contract and artifact schema

- `packages/shared/src/types/operator-worktree.ts`

### Runtime lifecycle and maintenance surfaces

- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
- `packages/runtime/src/workspace/operator-safe-execution-report.ts`
- `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`
- `packages/runtime/src/workspace/operator-safe-temp-workspace.ts`
- `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`
- `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
- `packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts` _(new, recommended)_

### Runtime consumers and summary surfaces

- `packages/runtime/src/jobs/index-job-runner.ts`
- `packages/runtime/src/diagnostics/debug-dump.ts`
- `packages/runtime/src/diagnostics/audit-query-service.test.ts`

### CLI operator surface

- `apps/cli/src/runtime-client.ts`
- `apps/cli/src/commands/root.ts`
- `apps/cli/src/commands/operator-safe-maintenance.ts` _(new, recommended)_
- `apps/cli/src/commands/operator-safe-maintenance.test.ts` _(new, recommended)_

### Docs and runbook alignment

- `docs/operations/operator-safe-project-worktree-maintenance-runbook.md`
- `docs/user-guide.md`

## Boundaries And Components

### Exact first-wave runtime/operator entry surfaces

| Capability | First-wave operator surface | Runtime entry surface | Boundary note |
| --- | --- | --- | --- |
| list inventory | `dh operator-safe-maintenance list [--family <all|report|snapshot|temp>] [--limit <n>] [--json]` | `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts` | first-class inventory path over live artifacts; replaces helper-only access |
| inspect artifact | `dh operator-safe-maintenance inspect --family <report|snapshot|temp> --id <artifact-id> [--json]` | same runtime module | must expose meaningful artifact facts, not raw filenames only |
| policy prune | `dh operator-safe-maintenance prune --mode <dry-run|apply> [--family <all|report|snapshot|temp>] [--json]` | same runtime module | bounded retention cleanup only; no arbitrary path deletion |
| targeted cleanup | `dh operator-safe-maintenance cleanup --mode <dry-run|apply> (--report <report-id> | --family <snapshot|temp> --id <artifact-id>) [--json]` | same runtime module | for degraded/abandoned/orphan residue only; must emit retained/skipped reasons |
| secondary summary only | `dh doctor --debug-dump` | `packages/runtime/src/diagnostics/debug-dump.ts` | summary, counts, and maintenance-path hint only; not canonical inventory or deletion authority |

First-wave command rule:

- `dh operator-safe-maintenance` is the only new operator entry surface recommended for this feature.
- `dh doctor --debug-dump` remains read-only and secondary.
- No generic `dh worktree`, no git wrapper command family, and no broad shell/file maintenance path should be introduced.

### Artifact ownership rules

| Artifact family | Creation owner | Inspection / cleanup owner | Canonical truth | Must not become |
| --- | --- | --- | --- | --- |
| reports | `packages/runtime/src/workspace/operator-safe-execution-report.ts` via lifecycle runner | `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts` | report JSON under `.dh/runtime/operator-safe-worktree/reports/` | workflow-state mirror, release status, or debug-dump-only truth |
| snapshots | `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts` | `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts` | snapshot manifest under `.dh/runtime/operator-safe-worktree/snapshots/` | filename-only inference or generic backup/restore platform |
| temp workspaces | `packages/runtime/src/workspace/operator-safe-temp-workspace.ts` | `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts` | temp directory plus persisted temp manifest under `.dh/runtime/operator-safe-worktree/temp/` | arbitrary OS temp cleanup or generic repo worktree manager |
| diagnostics summary | `packages/runtime/src/diagnostics/debug-dump.ts` | none; read-only surface | derived summary over artifact truth | canonical maintenance store or workflow-state proxy |

Ownership rules to preserve:

- Report, snapshot, and temp artifacts remain rooted only under `.dh/runtime/operator-safe-worktree/`.
- Workflow-state and `.opencode/work-items/` remain out of scope for artifact inventory, inspection, prune, and cleanup.
- Maintenance code may summarize linked lifecycle facts, but it must not synthesize workflow-stage, approval, release-readiness, or QA truth.
- The current bounded execution catalog remains unchanged: `index_workspace` is still the only explicitly supported operator-safe execution operation. Maintenance actions are artifact hygiene actions, not new execution operations.

### Rust / TypeScript / runtime responsibility boundaries

#### Rust responsibilities for this feature

- **No first-wave Rust changes are recommended.**
- The Rust bridge and engine remain untouched and must not become the maintenance backend for this feature.
- If implementation pressure appears to route artifact maintenance through Rust bridge utility methods, stop and return to Solution Lead review; that would broaden the feature beyond current repository need.

#### TypeScript shared-contract responsibilities

- `packages/shared/src/types/operator-worktree.ts` should own:
  - artifact family vocabulary
  - shared execution / artifact identity fields
  - inventory and inspect result shapes
  - prune / cleanup request and result shapes
  - refusal / retained / skipped reason taxonomy

#### TypeScript runtime responsibilities

- Runtime workspace modules own:
  - artifact-root resolution
  - execution/artifact link persistence
  - inventory materialization from real files
  - cleanup-plan evaluation
  - bounded delete execution within approved roots only
- `debug-dump.ts` owns read-only summary output only.
- `index-job-runner.ts` continues to consume operator-safe lifecycle summary, but it must not become the maintenance API.

#### CLI responsibilities

- CLI owns argument parsing, help text, text/JSON rendering, and dry-run/apply guardrails.
- CLI must not perform raw `fs.rm` cleanup outside the runtime maintenance layer.
- CLI must not accept arbitrary paths, arbitrary TTL milliseconds, or generic shell arguments for this feature.

## Interfaces And Data Contracts

### Shared artifact identity and inventory contract

Current gap to close:

- `listOperatorSafeArtifacts(...)` currently returns bare filename arrays.
- That is not sufficient for truthful inspection, targeted cleanup, or retained/skipped reasoning.

Recommended contract changes in `packages/shared/src/types/operator-worktree.ts`:

- add a shared lifecycle-level identity such as `executionId` for each operator-safe run
- add an artifact-family enum such as `report | snapshot | temp_workspace`
- replace the current maintenance summary arrays with structured inventory records that include at least:
  - `family`
  - `artifactId`
  - `executionId` when known
  - `path`
  - `createdAt`
  - `lastTouchedAt`
  - `existsOnDisk`
  - `operation`
  - `mode`
  - `outcome` / `failureClass` when the family supports it
  - `cleanupEligibility`
  - `cleanupReason`

### Inspect contract

`inspect` should return family-specific facts without requiring filename inference.

Minimum report inspection fields:

- report id / execution id
- operation and mode
- outcome and failure class
- recommended next action
- blocking / warning codes
- linked snapshot and temp-workspace pointers when present
- cleanup relevance and refusal reason when not eligible

Minimum snapshot inspection fields:

- snapshot id / execution id
- created-at timestamp
- repo root / target path / workspace root when present
- warning codes and idempotent-skip metadata
- linked report id or explicit orphan state
- cleanup relevance

Minimum temp inspection fields:

- temp artifact id / execution id
- temp path
- created-at / last-touched timestamps
- stale-after policy and next eligible cleanup time
- linked report id when present, otherwise explicit orphan / unlinked state
- cleanup relevance

### Temp-workspace manifest requirement

Current temp-workspace creation returns only a path and TTL note.

Recommended first-wave change:

- persist temp-workspace metadata as a small manifest stored within the bounded temp artifact family
- that manifest should carry the same shared execution identity used by report and snapshot artifacts
- maintenance inventory and inspect should use the persisted manifest plus filesystem stats, not path-name heuristics alone

### Prune and cleanup result contract

Both destructive actions should produce an inspectable result shape with at least:

- action type (`prune` or `cleanup`)
- mode (`dry-run` or `apply`)
- evaluated targets
- removed items
- retained items
- skipped items
- per-item reason codes
- warnings for missing/corrupt/unreadable artifacts

Counts alone are not sufficient.

### Default policy constants

First-wave retention defaults should align to the existing runbook unless implementation proves a smaller truthful bound is required:

- reports: `7 days`
- snapshots: `3 days`
- temp workspaces: `24 hours`

Operator surface rule:

- these defaults should be the visible operator policy in the first wave
- do not expose arbitrary `olderThanMs` as the primary CLI contract
- internal override hooks for tests are acceptable, but operator-facing behavior should stay policy-based and bounded

### Bounded deletion / cleanup semantics and refusal cases

#### Prune semantics

- `prune` is family-policy cleanup only.
- It may remove only artifacts:
  - inside the approved operator-safe roots
  - older than the family retention policy
  - whose path resolves cleanly inside the family root
- It must retain and report artifacts that are:
  - newer than the family policy
  - unreadable / corrupt in a way that makes automatic deletion untrustworthy
  - already missing on disk by the time the action runs

#### Cleanup semantics

- `cleanup` is targeted residue cleanup, not a second broad prune.
- First-wave targeted cleanup should support:
  - `--report <report-id>` for linked residue from one bounded run
  - `--family <snapshot|temp> --id <artifact-id>` for explicit orphan or individually targeted cleanup
- `cleanup` may remove recent artifacts only when eligibility is proven by artifact truth, for example:
  - report outcome is `blocked`, `failed`, `cleanup_failed`, or `rollback_degraded`
  - linked artifact is orphaned or unreadable but explicitly targeted
  - temp artifact is stale by recorded temp policy
- `cleanup` must refuse recent successful/advisory artifacts when no degraded/orphan/stale signal exists

#### Refusal / retained / skipped reasons that should be explicit

- `artifact_not_found`
- `family_not_supported`
- `path_outside_operator_safe_root`
- `cleanup_eligibility_unproven`
- `artifact_too_recent_for_policy_prune`
- `metadata_unreadable_or_untrusted`
- `already_removed`
- `linked_artifact_missing`

Important honesty rule:

- if a requested cleanup target cannot be proven safe by current artifact truth, retain it and emit the reason; do not guess from workflow-state or generic repo status.

## Risks And Trade-offs

- **Artifact-schema drift risk**
  - report, snapshot, temp, CLI, and debug-dump will diverge if shared identity and refusal vocabulary are not frozen first.
- **Maintenance-command scope creep risk**
  - adding raw path arguments, arbitrary TTL knobs, or generic delete behavior would turn this into platform maintenance instead of operator-safe completion.
- **Summary-vs-truth drift risk**
  - `debug-dump` already surfaces counts; if it grows into the canonical maintenance view, reviewers will lose one truthful source of artifact state.
- **Unsafe deletion risk**
  - current helper-level `prune` uses direct age-based `fs.rm` across the family roots; that is too coarse for retained/skipped reasoning and targeted cleanup.
- **Fake active-state risk**
  - this feature should not invent “active” detection by borrowing workflow-stage or task-board state. If active eligibility cannot be proven from artifact truth, cleanup must refuse.

## Implementation Slices

### Slice 1: Freeze artifact identity, ownership, and maintenance vocabulary

- **Files:**
  - `packages/shared/src/types/operator-worktree.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.ts`
  - `packages/runtime/src/workspace/operator-safe-execution-report.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-snapshot.ts`
  - `packages/runtime/src/workspace/operator-safe-temp-workspace.ts`
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
- **Goal:** make report/snapshot/temp artifacts share enough stable identity and metadata that maintenance can be truthful without filename guessing.
- **Validation Command:** `npm run check && npm test -- packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
- **Details:**
  - add shared execution/artifact identity fields
  - persist temp manifest metadata instead of path-only temp truth
  - preserve current temp-workspace-first lifecycle and current `index_workspace` execution catalog
  - keep workflow-state and Rust out of the maintenance contract

### Slice 2: Expand runtime maintenance from helper-level code into real inventory / inspect / prune / cleanup behavior

- **Files:**
  - `packages/runtime/src/workspace/operator-safe-maintenance-utils.ts`
  - `packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts` _(new, recommended)_
  - `packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
- **Goal:** deliver the real maintenance runtime surface over live artifacts.
- **Validation Command:** `npm run check && npm test -- packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts`
- **Details:**
  - replace bare-name inventory with structured records
  - add `inspect` for report, snapshot, and temp families
  - change `prune` to policy-driven dry-run/apply behavior with removed/retained/skipped reasoning
  - add targeted `cleanup` for degraded/orphan residue
  - bound all delete resolution to the operator-safe family roots only

### Slice 3: Add the dedicated operator CLI path and keep it narrowly scoped

- **Files:**
  - `apps/cli/src/runtime-client.ts`
  - `apps/cli/src/commands/root.ts`
  - `apps/cli/src/commands/operator-safe-maintenance.ts` _(new, recommended)_
  - `apps/cli/src/commands/operator-safe-maintenance.test.ts` _(new, recommended)_
- **Goal:** make maintenance first-class for operators instead of helper-only for developers.
- **Validation Command:** `npm run check && npm test -- apps/cli/src/commands/operator-safe-maintenance.test.ts apps/cli/src/runtime-client.test.ts`
- **Details:**
  - implement `list`, `inspect`, `prune`, and `cleanup` subcommands
  - keep `prune` and `cleanup` behind `--mode <dry-run|apply>`
  - accept family / id / report selectors only; no arbitrary path arguments
  - keep text output concise and JSON output structured for inspectability

### Slice 4: Keep diagnostics/reporting secondary and truthful

- **Files:**
  - `packages/runtime/src/diagnostics/debug-dump.ts`
  - `packages/runtime/src/diagnostics/audit-query-service.test.ts`
- **Goal:** preserve debug-dump as a read-only summary and pointer surface.
- **Validation Command:** `npm run check && npm test -- packages/runtime/src/diagnostics/audit-query-service.test.ts`
- **Details:**
  - keep artifact counts and recent pointers in debug output
  - add an explicit maintenance-surface hint pointing operators to `dh operator-safe-maintenance`
  - do not add delete semantics, workflow-stage truth, approval truth, or release-readiness fields
  - if debug summary and underlying artifact inventory disagree, artifact inventory wins

### Slice 5: Align runbook/help/docs and close with one operator-safe story

- **Files:**
  - `docs/operations/operator-safe-project-worktree-maintenance-runbook.md`
  - `docs/user-guide.md`
  - `apps/cli/src/commands/root.ts`
- **Goal:** make docs, help text, and runtime behavior describe the same bounded contract.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - document the new maintenance command and first-wave subcommands
  - document default family retention policy and targeted cleanup semantics
  - document refusal behavior and separation from workflow-state truth
  - do not market the feature as a git worktree wrapper, shell manager, or platform cleanup tool

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Why sequential:
  - Slice 1 freezes the shared artifact vocabulary and ownership model.
  - Slice 2 depends on that contract for truthful inspect and cleanup behavior.
  - Slice 3 should consume the stabilized runtime surface rather than invent a parallel CLI schema.
  - Slice 4 must summarize the same runtime truth after the dedicated maintenance path is real.
  - Slice 5 should document shipped truth, not speculative behavior.
- Critical-path summary:
  - `artifact identity -> maintenance runtime -> operator command -> diagnostics summary -> docs alignment`

## Parallelization Assessment

- parallel_mode: `none`
- why: shared artifact identity, cleanup eligibility, refusal taxonomy, CLI rendering, and debug-dump summary all depend on one cross-cutting maintenance contract. Parallel implementation would create high risk of mismatched IDs, contradictory retained/skipped reasons, or delete behavior that diverges from docs.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: prove one coherent story across live artifacts, `dh operator-safe-maintenance`, `dh doctor --debug-dump`, and the maintenance runbook before handoff to Code Review.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Target | What must be proven | Validation path |
| --- | --- | --- |
| shared artifact identity and link persistence | report, snapshot, and temp artifacts carry enough metadata for inventory and targeted cleanup | `npm run check`; `npm test -- packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts` |
| list and inspect are truthful | empty, present, missing, and partially corrupt artifact cases are surfaced honestly with family-specific metadata | `npm run check`; `npm test -- packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts` |
| prune stays policy-bounded | only policy-eligible artifacts inside approved roots are removed; recent/ineligible items are retained with reasons | `npm run check`; `npm test -- packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts packages/runtime/src/workspace/operator-safe-project-worktree-utils.test.ts` |
| cleanup handles degraded/orphan residue without widening scope | report-anchored cleanup and explicit snapshot/temp cleanup work in dry-run/apply modes and refuse unproven recent-success targets | `npm run check`; `npm test -- packages/runtime/src/workspace/operator-safe-maintenance-utils.test.ts apps/cli/src/commands/operator-safe-maintenance.test.ts` |
| CLI surface is first-class and bounded | operators can reach list/inspect/prune/cleanup without raw filesystem digging or arbitrary path deletion | `npm run check`; `npm test -- apps/cli/src/commands/operator-safe-maintenance.test.ts apps/cli/src/runtime-client.test.ts` |
| diagnostics remain secondary | `debug-dump` summarizes artifact truth and points to maintenance path without leaking workflow-state truth | `npm run check`; `npm test -- packages/runtime/src/diagnostics/audit-query-service.test.ts` |
| docs and runtime tell the same story | runbook/help wording matches bounded live behavior | `npm run check && npm test`; reviewer comparison of `apps/cli/src/commands/root.ts`, `packages/runtime/src/diagnostics/debug-dump.ts`, `docs/operations/operator-safe-project-worktree-maintenance-runbook.md`, and `docs/user-guide.md` |

Validation reality notes:

- Use real repository commands only:
  - from repo root: `npm run check`
  - from repo root: `npm test`
- No repo-native lint command exists; do not invent one.
- No first-wave Rust change is recommended here, so no Rust validation command is required for this feature. If implementation expands into Rust, the work should return for solution review.

## Integration Checkpoint

Before handoff from Fullstack to Code Review, one integrated inspection pass should be able to show all of the following together:

- At least one repo with real operator-safe artifacts across:
  - `reports/`
  - `snapshots/`
  - `temp/`
- `dh operator-safe-maintenance list` shows inventory grouped by family with identity, recency, and cleanup relevance.
- `dh operator-safe-maintenance inspect` works for:
  - one report artifact
  - one snapshot artifact
  - one temp artifact
- `dh operator-safe-maintenance prune --mode dry-run` shows what would be removed, retained, and skipped under the default family policies.
- `dh operator-safe-maintenance cleanup --mode dry-run` shows one targeted degraded/orphan cleanup plan and the reasons behind it.
- `--mode apply` removes only approved operator-safe artifacts under `.dh/runtime/operator-safe-worktree/` and reports already-missing / skipped cases honestly.
- `dh doctor --debug-dump` still shows summary counts and maintenance-path hint only; it must not replace list/inspect/prune/cleanup.
- No touched output mentions workflow stage, approval gate, release readiness, or QA status while describing operator-safe artifact maintenance.

## Rollback Notes

- If linked artifact identity proves harder than expected, prefer adding a small persisted temp manifest and shared `executionId` over teaching maintenance code to infer linkage from filenames.
- If the CLI surface starts attracting arbitrary path or TTL knobs, narrow it back to the bounded family/report selectors in this package.
- If targeted cleanup cannot prove eligibility from artifact truth, refuse the cleanup and preserve the artifact; do not add workflow-state or git-status fallbacks.
- If `debug-dump` becomes noisy, keep only counts, recent pointers, and maintenance-surface hint there; do not promote it into a second maintenance API.

## Reviewer Focus Points

- Reject any implementation that deletes paths outside `.dh/runtime/operator-safe-worktree/reports/`, `.dh/runtime/operator-safe-worktree/snapshots/`, or `.dh/runtime/operator-safe-worktree/temp/`.
- Reject any implementation that imports workflow-state files or stage/approval/release surfaces into maintenance logic or output.
- Reject any implementation that turns the new command into arbitrary filesystem cleanup, broad shell management, or generic git worktree orchestration.
- Verify report, snapshot, and temp inspection each expose meaningful artifact facts rather than counts only.
- Verify prune and cleanup results include retained/skipped reasoning, not just success counts.
- Verify Rust stays untouched in the first wave unless the work is explicitly re-scoped.
- Verify docs and help text do not over-claim broader operator-safe capability than current repository reality supports.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - temp-workspace-first execution posture
  - current bounded execution catalog (`index_workspace` only)
  - one dedicated maintenance command instead of a generic worktree wrapper
  - artifact truth separate from workflow-state truth
- **Code Reviewer must preserve:**
  - shared/runtime/CLI contract consistency for IDs, cleanup reasons, and family vocabulary
  - no raw delete behavior outside approved roots
  - no diagnostic surface claiming canonical maintenance truth
- **QA Agent must preserve:**
  - empty inventory, present inventory, degraded residue, orphan artifact, and already-removed artifact coverage
  - proof that list/inspect/prune/cleanup are live through the operator path, not helper-only
  - proof that diagnostics summarize and point, but do not replace, maintenance truth
