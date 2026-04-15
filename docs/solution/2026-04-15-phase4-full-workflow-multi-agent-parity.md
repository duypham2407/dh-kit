---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: PHASE4-WORKFLOW-PARITY
feature_slug: phase4-full-workflow-multi-agent-parity
source_scope_package: docs/scope/2026-04-15-phase4-full-workflow-multi-agent-parity.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Phase4 Full Workflow Multi Agent Parity

## Chosen Approach
- Implement the smallest truthful full-delivery workflow slice: one bounded `full` work item that can be started, inspected, advanced, rerouted, and closed using current repo workflow-state and artifact surfaces.
- This is enough for Phase 4 because the approved scope requires minimal operator-visible parity for the documented full lane, not production hardening or broader workflow redesign.

## Impacted Surfaces
- `/delivery`
- `/task` when routing selects `full`
- `.opencode/workflow-state.json`
- `.opencode/work-items/`
- `.opencode/workflow-state.js`
- `docs/scope/`
- `docs/solution/`
- `docs/qa/`
- workflow issue, approval, and verification-evidence state

## Boundaries And Components
- Preserve the documented full stage sequence: `full_intake -> full_product -> full_solution -> full_implementation -> full_code_review -> full_qa -> full_done`.
- Preserve owner boundaries: Master Orchestrator, Product Lead, Solution Lead, Fullstack Agent, Code Reviewer, QA Agent.
- Phase 4 scope is bounded to workflow usability and inspectability for the `full` lane only.
- Do not broaden into quick-lane parity, migration parity, release management, deployment, or Phase 5 reliability hardening.

## Interfaces And Data Contracts
- Operator-visible state must expose, at minimum: `mode`, `current_stage`, `current_owner`, linked artifacts, approval status, and reroute/issue state.
- Full-delivery approvals must remain inspectable at these gates:
  - `product_to_solution`
  - `solution_to_fullstack`
  - `fullstack_to_code_review`
  - `code_review_to_qa`
  - `qa_to_done`
- Required artifact set for parity:
  - scope package: `docs/scope/2026-04-15-phase4-full-workflow-multi-agent-parity.md`
  - solution package: `docs/solution/2026-04-15-phase4-full-workflow-multi-agent-parity.md`
  - QA artifact: `docs/qa/2026-04-15-phase4-full-workflow-multi-agent-parity.md`
- Artifact linkage must be visible from work-item state and compatibility-mirror state, not inferred only from file existence.

## Risks And Trade-offs
- Risk: stage advancement may drift from owner, approval, or artifact state. Mitigation: treat stage/gate/state agreement as a primary validation target.
- Risk: Phase 4 delivers only a happy path. Mitigation: require at least one real backward reroute in the bounded demo.
- Risk: `/delivery` and `/task -> full` diverge into different state behavior. Mitigation: validate both entry paths against the same full-lane state model.
- Trade-off: keep the solution sequential and minimal rather than adding broader multi-worker coordination; this avoids Phase 5 drift.

## Recommended Path
- Deliver one credible operator demo for a single full-delivery work item that proves:
  1. start in `full` mode from `/delivery`
  2. equivalent `full` behavior when `/task` routes to `full`
  3. creation or linkage of required artifacts
  4. inspectable stage and owner progression through the documented full lane
  5. inspectable approval changes at each gate
  6. at least one backward reroute for implementation, design, or requirement findings
  7. visible QA or verification closure evidence

## Implementation Slices
### Slice 1: full-lane entry parity
- **Goal:** `/delivery` and `/task -> full` converge on the same full work-item model.
- **Surfaces:** full-mode start path, active work-item state, compatibility mirror.
- **Validation:** inspect `status`, `show`, `resume-summary`, and `show-work-item <work_item_id>` to confirm matching mode, stage, and owner behavior.

### Slice 2: stage, owner, and approval truthfulness
- **Goal:** advancing the full lane updates stage owner and approval state consistently.
- **Surfaces:** `advance-stage`, `set-approval`, `check-stage-readiness`, work-item state.
- **Validation:** confirm owner and gate changes match the documented full workflow at each stage boundary.

### Slice 3: minimum artifact creation and linkage
- **Goal:** the full lane creates or links the required scope, solution, and QA artifacts at the correct stages.
- **Surfaces:** `scaffold-artifact`, `link-artifact`, work-item artifact refs, compatibility mirror.
- **Validation:** confirm the scope package is present in `full_product`, the solution package in `full_solution`, and QA output in `full_qa` or closure state.

### Slice 4: reroute parity
- **Goal:** implementation issues, design flaws, and requirement gaps route to the correct earlier full-lane stage.
- **Surfaces:** `record-issue`, `route-rework`, issue state, post-reroute stage visibility.
- **Validation:** prove these mappings remain inspectable after reroute:
  - implementation issue -> `full_implementation`
  - design flaw -> `full_solution`
  - requirement gap -> `full_product`

### Slice 5: end-to-end bounded operator demo
- **Goal:** one work item proves start, stage progression, artifact linkage, reroute behavior, and closeout visibility end to end.
- **Surfaces:** all of the above plus `closeout-summary` and recorded verification evidence.
- **Validation:** the demo must leave an inspectable story across state, artifacts, approvals, and reroute/QA evidence.

## Dependency Graph
- Critical path: entry parity -> stage/owner/approval truthfulness -> artifact linkage -> reroute handling -> end-to-end demo.
- Later slices depend on earlier slices because reroute and closeout are only meaningful once the underlying full-lane state model is truthful.

## Parallelization Assessment

- parallel_mode: `none`
- why: Phase 4 is primarily bounded workflow-state and operator-surface parity work. Sequential delivery is the simplest adequate path and avoids Phase 5 drift into broader coordination semantics.
- safe_parallel_zones: []
- sequential_constraints: []
- integration_checkpoint: verify one work item can move through the full lane with matching stage, owner, artifact, approval, and reroute state before any broader concurrency work is considered.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix
- **Entry parity** -> `status`, `show`, `resume-summary`, `show-work-item <work_item_id>`
- **Stage/owner/approval parity** -> `advance-stage`, `set-approval`, `check-stage-readiness`, then inspect state surfaces
- **Artifact parity** -> `scaffold-artifact`, `link-artifact`, then inspect work-item artifact refs
- **Reroute parity** -> `record-issue`, `route-rework`, then inspect new stage and persisted issue state
- **QA/closure parity** -> QA artifact linkage, recorded verification evidence, `closeout-summary <work_item_id>`

Validation must stay inside current repo reality. There is no generic repo-native build/lint/test command for application code, so Phase 4 validation should use existing workflow-state/runtime command coverage and honest state inspection rather than invented commands.

## Integration Checkpoint
- Before handoff to QA, verify one bounded full-delivery work item can:
  - enter `full`
  - show the correct owner at each stage
  - expose required artifacts
  - expose pending vs approved gates
  - reroute backward correctly by finding type
  - retain inspectability after reroute

## Rollback Notes
- If a proposed implementation broadens beyond bounded full-lane parity, reduce back to the smallest operator demo and current documented command/state surfaces.
- If any documented behavior cannot be made truthful in Phase 4, narrow it explicitly in implementation and QA evidence rather than implying unsupported parity.

## Reviewer Focus Points
- Preserve the approved Product Lead scope and avoid Phase 5 hardening drift.
- Confirm `/delivery` and `/task -> full` converge on the same full-lane model.
- Confirm stage, owner, artifact, and approval state agree across operator-visible surfaces.
- Confirm reroute behavior is real and inspectable, not a happy-path-only simulation.
- Confirm the final QA artifact and verification evidence tell the same story as workflow state.
