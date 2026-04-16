---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: WORKFLOW-ENGINE-COMPLETE
feature_slug: workflow-engine-complete
source_scope_package: docs/scope/2026-04-16-workflow-engine-complete.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Workflow Engine Complete

## Chosen Approach
- Complete the workflow engine by normalizing one authoritative workflow-state contract for the current `quick`, `migration`, and `full` lanes, then align runtime behavior, workflow-state CLI surfaces, and companion documentation to that contract.
- This is sufficient because the approved scope is bounded to operator-trustworthy completeness of the existing workflow model, not a new workflow taxonomy or broader runtime redesign.

## Impacted Surfaces
- `.opencode/work-items/` as the managed per-item source of truth
- `.opencode/workflow-state.json` as the active compatibility mirror
- `.opencode/workflow-state.js`
- `context/core/workflow.md`
- `context/core/approval-gates.md`
- `context/core/issue-routing.md`
- `context/core/session-resume.md`
- `context/core/workflow-state-schema.md`
- `context/core/runtime-surfaces.md`
- `context/core/project-config.md`
- Any runtime workflow/policy/session modules that currently split these responsibilities

## Boundaries And Components
- **Workflow engine owns:** lane roster, canonical stage sequencing, stage owner visibility, approval-gate progression, reroute destinations, blocked/ready state, and next-safe-action derivation.
- **Policy engine owns:** lane-selection rules, lane-authority behavior, escalation rules, and readiness/reroute policy decisions used by the workflow engine.
- **Session manager owns:** active work-item selection, resumability metadata, and continuity of operator context across interruptions.
- This feature must clarify those boundaries without reassigning architecture ownership or broadening into platform/foundation redesign.

## Interfaces And Data Contracts
- The authoritative workflow model remains the current documented lanes only: `quick`, `migration`, and `full`.
- Stage ownership must remain inspectable for the current roster only:
  - `Master Orchestrator`
  - `Quick Agent`
  - `Product Lead`
  - `Solution Lead`
  - `Fullstack Agent`
  - `Code Reviewer`
  - `QA Agent`
- Lane authority remains first-class and inspectable:
  - `user_explicit` -> no silent override; advisory warning only
  - `orchestrator_routed` -> documented routing/escalation rules may apply
- Workflow state must let operators inspect, at minimum:
  - active work item
  - mode
  - current stage
  - current owner
  - linked artifacts
  - approval status
  - issue state
  - verification evidence
  - blocking reason
  - next safe action
- `.opencode/work-items/` is the managed source of truth; `.opencode/workflow-state.json` remains the active compatibility mirror for the current work item.

## Risks And Trade-offs
- The main risk is semantic drift between runtime state, CLI output, and docs even if individual workflow behaviors already work.
- Approval and reroute behavior may be partially enforced today but not surfaced uniformly enough for operator trust.
- Session resume may expose current stage without a normalized explanation of blockers and next safe action.
- To stay inside scope, the work should prefer normalization and gap-closing over new runtime capabilities.

## Recommended Path
- Make workflow-state outputs, stored state, and workflow docs tell the same story about ownership, blockers, approvals, reroutes, and resumability.
- Treat the workflow-state CLI as the primary workflow inspection/control surface, while keeping product install/health concerns on `openkit run` and `openkit doctor`.
- Normalize issue routing and approval behavior to the current documented feedback loops instead of redesigning them.

## Implementation Slices
### [x] Slice 1: Canonical workflow-engine contract
- **Files**: `context/core/workflow.md`, `context/core/approval-gates.md`, `context/core/issue-routing.md`, `context/core/session-resume.md`, `context/core/workflow-state-schema.md`, runtime workflow/state modules as needed
- **Goal**: Define one execution contract for roster ownership, lanes, stages, gates, reroutes, and resumability based on the approved scope package and current repo reality.
- **Validation Command**: Use documented workflow-state inspection commands only; no new repo-native app validation command exists.
- **Details**:
  - Lock the feature to the current modes `quick`, `migration`, and `full`.
  - Preserve current role boundaries and canonical stage sequences from `context/core/workflow.md`.
  - Ensure the workflow-engine boundary is explicit relative to policy engine and session manager.

### [x] Slice 2: Authoritative state-model normalization
- **Files**: `.opencode/workflow-state.js`, `.opencode/workflow-state.json`, `.opencode/work-items/`, `context/core/workflow-state-schema.md`, `context/core/runtime-surfaces.md`
- **Goal**: Make managed work-item state plus the compatibility mirror sufficient to explain owner, blocker, approval, issues, evidence, and next safe action without hidden implementation knowledge.
- **Validation Command**: `node .opencode/workflow-state.js status`, `node .opencode/workflow-state.js show`, `node .opencode/workflow-state.js resume-summary`, `node .opencode/workflow-state.js check-stage-readiness`
- **Details**:
  - Normalize source-of-truth vs compatibility-mirror language and runtime behavior.
  - Ensure blocked-versus-ready state is inspectable through runtime surfaces instead of inferred from docs.
  - Keep linked artifacts, issues, and verification evidence aligned with current work-item state.

### [x] Slice 3: Approval and stage-readiness normalization
- **Files**: `.opencode/workflow-state.js`, `context/core/approval-gates.md`, `context/core/workflow.md`, readiness-related runtime modules as needed
- **Goal**: Align gate names, statuses, and advancement checks with the documented lane contracts so advancement never appears to skip required workflow conditions.
- **Validation Command**: `node .opencode/workflow-state.js check-stage-readiness`, `node .opencode/workflow-state.js set-approval ...`, `node .opencode/workflow-state.js advance-stage ...`
- **Details**:
  - Preserve current full, migration, and quick gate names.
  - Make missing approval, missing artifact, unresolved issue, or missing evidence visible as explicit blocker reasons where the current contract requires them.
  - Keep `.opencode/workflow-state.json` aligned after gate changes.

### [x] Slice 4: Issue routing and approval-loop normalization
- **Files**: `.opencode/workflow-state.js`, `context/core/issue-routing.md`, `context/core/workflow.md`, issue/routing runtime modules as needed
- **Goal**: Make current feedback loops first-class and inspectable across full and migration modes, including lane-authority-sensitive reroute behavior.
- **Validation Command**: `node .opencode/workflow-state.js record-issue ...`, `node .opencode/workflow-state.js route-rework ...`, `node .opencode/workflow-state.js show`, `node .opencode/workflow-state.js resume-summary`
- **Details**:
  - Normalize routing for implementation issues, design flaws, product requirement gaps, and migration parity/compatibility issues.
  - Preserve the rule that `user_explicit` lanes are not silently changed.
  - Ensure reroute destinations remain inspectable after work moves backward.

### [x] Slice 5: Operator-facing runtime/docs closure
- **Files**: `context/core/runtime-surfaces.md`, `context/core/project-config.md`, `context/core/workflow.md`, related operator-facing docs if they currently overclaim
- **Goal**: Close documented-vs-runtime gaps so operators know which surfaces are authoritative for install/doctor, workflow inspection, and resume.
- **Validation Command**: Documentation cross-check against the real runtime commands listed in `context/core/project-config.md`
- **Details**:
  - Keep product install/health on `openkit run` and `openkit doctor`.
  - Keep workflow inspection/control on `node .opencode/workflow-state.js ...`.
  - Keep `.opencode/work-items/` as authoritative state storage and `.opencode/workflow-state.json` as compatibility mirror.

## Dependency Graph
- Critical path: `contract -> state normalization -> gate/readiness normalization -> reroute normalization -> docs closure`
- Keep these slices sequential; they share the same workflow-state contract and operator vocabulary.

## Parallelization Assessment

- parallel_mode: `none`
- why: The slices share the same state contract, gate semantics, and operator-facing workflow vocabulary, so parallel implementation would create unnecessary integration risk.
- safe_parallel_zones: []
- sequential_constraints: ["SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5"]
- integration_checkpoint: Verify that `status`, `show`, `resume-summary`, and `check-stage-readiness` report one consistent story for the active work item before code review begins.
- max_active_execution_tracks: 1

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix
- **Acceptance: inspectable mode/stage/owner/artifacts/approvals/issues/evidence/next action**
  - Validate with `node .opencode/workflow-state.js status`, `show`, `resume-summary`, and `check-stage-readiness`.
- **Acceptance: only `quick`, `migration`, `full` represented with canonical stage sequences**
  - Validate against `context/core/workflow.md` and workflow-state schema/runtime outputs.
- **Acceptance: lane authority remains inspectable and truthful**
  - Validate `user_explicit` vs `orchestrator_routed` behavior through state inspection and reroute scenarios.
- **Acceptance: reroutes remain inspectable and map to the correct earlier stage**
  - Validate via issue recording plus `route-rework` flows for implementation, design, product-gap, and migration-parity cases.
- **Acceptance: workflow-engine completeness claim remains bounded**
  - Validate that docs and runtime do not introduce new lanes, role families, or broader platform claims.
- **Validation reality note**
  - No new repo-native application build/lint/test command should be invented; use existing workflow-state/runtime validation surfaces only and document any missing automated coverage honestly.

## Integration Checkpoint
- Before handoff to `Fullstack Agent` completion review, confirm that the active work item exposes consistent answers for: where the work is, who owns it, what is blocking it, which approval is pending, what issues/evidence exist, and what the next safe action is.

## Rollback Notes
- If implementation reveals that a documented behavior cannot be supported truthfully in current repo reality, narrow the claim and the docs instead of implying unsupported completeness.
- Avoid rollback into a second competing source of truth; preserve `.opencode/work-items/` as authoritative and `.opencode/workflow-state.json` as mirror.

## Reviewer Focus Points
- No new lanes, renamed modes, or redesigned workflow taxonomy.
- No silent override of `user_explicit` lane authority.
- No collapse of implementation, solution, product, review, and QA boundaries in reroute behavior.
- No claim that `.opencode/workflow-state.json` is the sole source of truth.
- No invented build, lint, or test commands beyond current repository reality.
