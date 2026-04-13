# Scope Package: Operator-safe Project/Worktree Program (DH)

**Date:** 2026-04-13  
**Owner:** DH runtime/intelligence team  
**Primary inputs:**
- `docs/opencode/operator-safe-project-worktree-master-plan-dh.md`
- `docs/opencode/operator-safe-project-worktree-program-master-checklist-dh.md`

---

DH has already completed the foundation for project/workspace scan hardening, marker-driven multi-workspace segmentation, and an operator-safe preflight utility slice. The remaining program is to turn those completed assets into one bounded, operator-safe project/worktree operation layer with a consistent lifecycle from preflight through execution reporting and cleanup, while explicitly avoiding drift into full VCS/worktree platform parity.

## Problem Statement

- DH currently has the right safety-oriented building blocks, but they are still partial and not yet a complete operator-safe operation model.
- The current state is strong at **discovery, boundary truth, and narrow preflight**, but weak at **bounded execution, recovery, operation reporting, and maintenance hygiene**.
- If DH continues through isolated follow-ons without a program-level scope, the likely outcomes are:
  - execution behavior remains inconsistent across callsites,
  - recovery and cleanup behavior stays underspecified,
  - reporting remains fragmented,
  - contract drift emerges across shared, runtime, and diagnostics surfaces,
  - scope may either stay too thin (preflight-only) or sprawl into VCS/worktree parity.
- The problem to solve is therefore **program-level completion of an operator-safe workspace operation layer**, not a narrow utility slice and not a full repo/worktree management platform.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this program |
|---|---|---|
| Discovery and boundary truth | Scan hardening is completed | Remains the canonical foundation and is reused without creating a parallel model |
| Workspace segmentation | Marker-driven multi-workspace segmentation is completed | Continues to provide workspace context for all operator-safe operations |
| Safety gateway | Narrow operator-safe preflight slice exists with bounded `check` / `dry_run` / `execute` semantics | Becomes the required gateway for sensitive project/worktree operations |
| Execution model | No unified execution lifecycle beyond preflight | Unified lifecycle exists from preflight -> prepare -> apply -> report -> cleanup / rollback-light |
| Snapshot and recovery | No program-level snapshot or rollback-light capability | Bounded snapshot plus rollback-light exist for supported operation classes |
| Temp isolation | No program-level temp workspace lifecycle | Temp workspace / isolated target handling exists with create-use-cleanup and stale handling |
| Reporting | Diagnostics exist, but not a standardized operation execution report | Standard execution report and operator summary exist for bounded operations |
| Maintenance | No cohesive maintenance utility set for temp/snapshot/report artifacts | Inspect / prune / cleanup utilities exist for operator-safe artifacts |
| Worktree support | No optional wrapper decision yet | Explicit go/no-go decision exists; if implemented, wrapper stays optional and thin |
| Scope posture | Safe slices completed, but program not yet closed | DH operates as an operator-safe bounded layer, not a VCS/worktree parity platform |

## In Scope

1. **Program contract and boundary freeze**
   - Freeze program vocabulary for operation intent, risk class, mode semantics, reason codes, and warning codes.
   - Standardize mapping from workspace truth to operation context.
   - Separate advisory-only checks from execution-gating checks.
   - Freeze the supported bounded operation catalog and the unsupported list.

2. **Bounded execution envelope**
   - Add a program-level execution lifecycle for sensitive project/worktree operations.
   - Require bounded preflight before execution.
   - Define prepare/apply/cleanup behavior within explicit allowed surfaces.

3. **Snapshot and rollback-light foundations**
   - Define minimal snapshot metadata for supported side-effecting operations.
   - Support rollback-light only where snapshot and apply metadata make it bounded and explainable.
   - Classify prepare failure and rollback-degraded outcomes explicitly.

4. **Temp workspace / isolated target handling**
   - Provide a bounded temp workspace or staging-area lifecycle.
   - Define stale detection, TTL, cleanup expectations, and boundary enforcement.
   - Keep temporary isolation optional by policy, not mandatory for every flow.

5. **Bounded apply policy**
   - Define allowed surfaces and policy-driven apply behavior.
   - Require parity between `dry_run` and `execute` semantics within the supported operation classes.
   - Capture apply metadata needed for reporting and bounded rollback-light.

6. **Execution reporting and operator summaries**
   - Standardize execution report schema across preflight, snapshot, apply, outcome, warnings, cleanup, and recommended next action.
   - Standardize failure classes for preflight failure, prepare failure, apply failure, cleanup failure, and rollback-degraded outcomes.

7. **Maintenance utilities and hygiene**
   - Provide utilities to inspect recent operator-safe artifacts.
   - Provide utilities to prune stale temp/snapshot/report artifacts according to policy.
   - Provide operator-facing maintenance guidance for incomplete or degraded runs.

8. **Optional worktree wrapper decision**
   - Evaluate whether an optional git worktree wrapper is justified after the core lifecycle is stable.
   - If approved, keep it as an adapter that reuses the same preflight, lifecycle, and reporting model.

## Out of Scope

- Full parity with an upstream project/VCS/worktree subsystem.
- Branch lifecycle platform behavior.
- Merge, rebase, reset, or broad branch/worktree orchestration.
- Full git porcelain replacement.
- General-purpose sandbox or repo-management platform behavior.
- Transactional or universal rollback for all filesystem or VCS changes.
- A large UI/workbench for project/worktree management.
- Reopening already completed scan-hardening or segmentation work except where direct integration is required.
- Introducing a second project/workspace truth model outside the current discovery and segmentation foundation.

## Business Rules and Program Boundaries

1. **Completed foundations stay completed** — scan hardening, marker-driven segmentation, and the operator-safe preflight slice are inputs to this program, not unfinished scope to redo.
2. **Preflight-first is mandatory** — sensitive project/worktree operations must not bypass the operator-safe gateway.
3. **Boundary truth is reused** — runtime execution must use the existing canonical path and workspace boundary truth instead of creating a parallel model.
4. **Bounded side effects only** — apply behavior is limited to explicitly supported operation classes and allowed surfaces.
5. **Explainability is required** — blocking reasons, warnings, outcomes, and recommended next actions must be operator-facing and inspectable.
6. **Recovery is limited and explicit** — rollback-light is allowed only where metadata supports it; DH does not promise perfect undo.
7. **Maintenance is part of the program** — temp/snapshot/report hygiene is required for program completion, not a later nice-to-have.
8. **Optional worktree support is not the core** — the program can complete successfully without a worktree wrapper.
9. **No parity drift** — every phase must preserve DH's role as an operator-safe bounded layer rather than a full VCS/worktree platform.

## Acceptance Criteria

| ID | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | DH has one documented operator-safe operation model covering preflight, prepare, apply, report, cleanup, and bounded rollback-light semantics | The approved program documentation defines one lifecycle and one contract vocabulary rather than separate per-callsite behavior |
| AC-2 | DH reuses the completed discovery and segmentation assets as the sole workspace/boundary truth for this program | Program artifacts and downstream design do not introduce a parallel workspace identity model |
| AC-3 | The supported bounded operation catalog and unsupported list are explicit | Sensitive operations can be classified as supported, unsupported, advisory-only, or execution-gated without ambiguity |
| AC-4 | Snapshot capability is defined for supported side-effecting operations with bounded metadata expectations | Supported operation classes identify what snapshot metadata must exist before execution can proceed |
| AC-5 | Temp workspace or isolated target handling has a defined lifecycle including create, use, cleanup, and stale handling expectations | The program specifies lifecycle rules, boundary rules, and cleanup expectations for temporary artifacts |
| AC-6 | Bounded apply semantics are defined with `dry_run` / `execute` parity and explicit failure/conflict handling expectations | Supported operation classes do not rely on ad hoc apply behavior at individual callsites |
| AC-7 | Execution reporting is standardized across preflight, prepare, apply, cleanup, warnings, and recommended next actions | Operators can inspect a single report shape for successful, blocked, failed, and degraded outcomes |
| AC-8 | Rollback-light support and its limits are explicit | The program defines when rollback-light is supported, when it is degraded, and when it is unavailable |
| AC-9 | Maintenance utilities are part of the completion criteria for the program | The program includes inspect, prune, and cleanup expectations for operator-safe artifacts |
| AC-10 | The optional worktree wrapper is treated as a post-core go/no-go decision, not a mandatory capability | The core program is complete without requiring worktree wrapper implementation |
| AC-11 | DH program documentation remains factually aligned with current DH reality and does not claim full VCS/worktree parity | Scope and acceptance language consistently describe a bounded operator-safe layer |

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into VCS/worktree parity | The program could expand beyond DH's intended product role | Enforce out-of-scope boundaries and require every phase to justify itself as bounded operator-safe behavior |
| Preflight-only stagnation | DH could stop at advisory checks and never close the execution story | Treat bounded execution, reporting, and maintenance as required program outcomes |
| Contract drift across shared/runtime/diagnostics | Inconsistent naming or result semantics would make the layer hard to use and debug | Keep shared contracts central and require diagnostics to consume rather than invent parallel schemas |
| Maintenance debt from temporary artifacts | Temp, snapshot, and report artifacts can accumulate and degrade operator experience | Include maintenance utilities and cleanup policy as mandatory completion criteria |
| Safety vs ergonomics imbalance | Overly strict blocking harms usability; overly weak guardrails reduce safety value | Use clear risk classes, explainability, and recommended next actions |
| Overcommitting rollback behavior | Implicit promises of full recovery would be misleading and unsafe | Keep rollback-light bounded, explicit, and limited to supported cases |

### Assumptions

1. The two referenced `docs/opencode/` documents are the authoritative planning inputs for this program-level scope.
2. Scan hardening, marker-driven segmentation, and the operator-safe preflight slice are already completed and should be treated as baseline assets.
3. DH still needs a program-level execution model and has not yet completed snapshot, bounded apply, execution reporting, maintenance utilities, or the optional worktree-wrapper decision.
4. DH should preserve a bounded operator-safe posture rather than pursue parity with a dedicated worktree/VCS platform.

## Execution Sequencing Expectations

### Required sequence

1. **Phase 0 — Program alignment and baseline lock**
   - Confirm the completed baseline assets.
   - Confirm ownership, progress reporting expectations, and the first supported operation wave.

2. **Phase 1 — Contract and boundary freeze**
   - Freeze vocabulary, mode semantics, risk classes, reason/warning codes, and the supported operation catalog.
   - Freeze the mapping from workspace truth to operation context.

3. **Phase 2 — Snapshot and rollback-light foundations**
   - Define minimal snapshot expectations.
   - Define rollback-light support boundaries and degraded-state handling.

4. **Phase 3 — Temp workspace / isolated target handling**
   - Define lifecycle rules for temp or isolated execution targets.
   - Define stale artifact handling and cleanup rules.

5. **Phase 4 — Bounded apply execution helpers**
   - Define policy-driven bounded apply behavior.
   - Define `dry_run` / `execute` parity and apply metadata requirements.

6. **Phase 5 — Execution reporting and operator summaries**
   - Freeze the execution report schema and failure classifications.
   - Align diagnostics consumption to that report shape.

7. **Phase 6 — Maintenance utilities**
   - Define inspect, prune, and cleanup expectations against real artifacts produced by the prior phases.

8. **Phase 7 — Optional worktree wrapper decision**
   - Evaluate go/no-go only after the core lifecycle is stable.
   - If approved, constrain it to an optional adapter.

9. **Phase 8 — Validation and closure**
   - Validate at least one full successful bounded flow and the main failure/degraded paths.
   - Close the program only after the full Definition of Done is met.

### Hard sequencing rules

- Do not reopen completed discovery or segmentation work as part of this program.
- Do not expand apply, rollback-light, or reporting behavior before contract freeze is complete.
- Do not treat rollback-light as meaningful until snapshot and apply metadata expectations exist.
- Do not design maintenance utilities in the abstract before real artifacts and report shapes exist.
- Do not begin with an optional worktree wrapper before the internal operator-safe lifecycle is established.
- Do not allow jobs or commands to bypass the operator-safe gateway for supported sensitive operations.

## Handoff Notes for Solution Lead

- Preserve DH reality: the program starts from already completed scan hardening, segmentation, and preflight assets.
- Design for a **program-level bounded operator-safe layer**, not a narrow follow-on slice and not a parity platform.
- Treat these as primary acceptance hotspots:
  - contract freeze,
  - bounded execution lifecycle,
  - snapshot and rollback-light boundaries,
  - temp workspace lifecycle,
  - apply/report parity,
  - maintenance utilities,
  - optional worktree wrapper decision discipline.
- Reject any solution direction that reintroduces a parallel workspace model, lets callsites bypass the gateway, or expands into branch/worktree platform behavior without separate approval.
