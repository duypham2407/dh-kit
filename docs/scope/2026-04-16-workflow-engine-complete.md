---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: WORKFLOW-ENGINE-COMPLETE
feature_slug: workflow-engine-complete
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Workflow Engine Complete

## Goal
- Complete the workflow engine as an operator-trustworthy product surface so OpenKit can consistently govern the current three-lane workflow with first-class roster ownership, stage and gate progression, issue routing, and resumable session state.

## Target Users
- OpenKit operators who need to start, inspect, route, resume, and advance work items without guessing how workflow state behaves.
- Maintainers who need a truthful, inspectable workflow engine aligned to the current architecture and documented workflow contract.

## Problem Statement
- The repository already has working workflow behavior, runtime state, and parity-oriented workflow support, but the workflow engine is not yet clearly complete as a single operator-visible capability aligned to the architecture.
- Operators can use parts of lane flow, approvals, routing, and state inspection today, but it is still ambiguous which workflow behaviors are guaranteed first-class and reliable. This feature closes that bounded gap for the current repo reality without expanding into broad product redesign.

## In Scope
- Operator-visible workflow-engine completeness for the current documented workflow model.
- First-class workflow support for the current runtime modes only:
  - `quick`
  - `migration`
  - `full`
- First-class representation of current stage ownership by lane, including the current role roster already defined in `context/core/workflow.md`.
- Clear operator-visible distinction between procedural workflow ownership and content-owning roles.
- First-class support for canonical lane stage sequencing and lane authority behavior, including:
  - `user_explicit`
  - `orchestrator_routed`
- First-class support for current approval-gate behavior by lane, including inspectable blocked versus ready state.
- First-class workflow routing for the current feedback loops and issue classes already implied by the live contract, including routing for:
  - implementation issues / bugs
  - solution or design flaws
  - product scope or requirement gaps
  - migration parity or compatibility issues
- First-class resumable work-item state so operators can determine:
  - active work item
  - current stage
  - current owner
  - pending gate or blocker
  - next safe action
- Clear workflow-engine coverage for linked artifacts, issues, approvals, and verification evidence as inspectable workflow state.
- Scope bounded to workflow-engine completeness against the current documented model, not a new workflow model.

## Out of Scope
- New lanes, renamed modes, or a redesigned workflow taxonomy.
- Broad redesign of OpenKit product surfaces, command vocabulary, or operator UX beyond what is needed to make workflow behavior inspectable and trustworthy.
- New role families, approval models, or issue taxonomies not grounded in current repository reality.
- Broad platform expansion outside workflow-engine scope, including unrelated MCP, background execution, or runtime-foundation work.
- Expanding task-board behavior beyond the bounded support already present in the live full-delivery contract.
- New application-stack, build, lint, or test commitments beyond the repository’s current validation reality.
- Reassigning architecture ownership across workflow engine, policy engine, and session manager rather than clarifying the workflow-engine boundary.

## Main Flows
- An operator starts or resumes a work item and can inspect the active lane, stage, owner, and blockers without reading hidden implementation details.
- An operator advances work through the current lane sequence and can see which approval gate is pending before progression.
- Review or QA findings reroute the work to the correct earlier stage, and the reroute remains inspectable in workflow state.
- An operator resumes interrupted work and can determine the next safe action from current workflow state surfaces.

## Business Rules
- “Workflow engine complete” in this feature means truthful operator-visible completeness for the current documented workflow model, not broad roadmap completion.
- The workflow engine is the authoritative product layer for roster ownership, lane behavior, stage progression, gate status, rerouting, and resumable work-item state.
- Only the current documented modes `quick`, `migration`, and `full` are in scope.
- Stage ownership must align to the current workflow contract and remain inspectable by operators.
- Lane authority behavior must remain explicit: user-selected lanes are not silently overridden, and orchestrator-routed lanes may follow current escalation rules.
- Stage advancement must be explainable from inspectable workflow state rather than operator guesswork.
- Workflow routing must respect current role boundaries; implementation, solution, product, review, and QA concerns must not be silently collapsed.
- If the product cannot truthfully support a claimed workflow behavior in the current repo, the scope must be narrowed explicitly rather than implying completeness.

## Acceptance Criteria Matrix
- **Given** a current work item in any supported lane, **when** an operator inspects workflow state, **then** the operator can determine the mode, current stage, current owner, linked artifacts, approval status, issue state, and next safe action.
- **Given** the workflow engine claims to support the current workflow model, **when** operators inspect lane behavior, **then** only the documented modes `quick`, `migration`, and `full` are represented and each uses its canonical stage sequence.
- **Given** a work item is in a stage with a defined owner, **when** the workflow is inspected, **then** the current owner is visible and consistent with the role ownership documented in `context/core/workflow.md`.
- **Given** a work item cannot advance, **when** an operator inspects its state, **then** the blocking reason is inspectable as missing approval, missing artifact, unresolved issue, missing evidence, or other explicit workflow-state condition required by the current contract.
- **Given** lane authority is `user_explicit`, **when** workflow behavior is inspected after a lane-mismatch concern appears, **then** the system preserves the user-selected lane unless the user explicitly authorizes a change.
- **Given** lane authority is `orchestrator_routed`, **when** a qualifying routing or escalation condition occurs, **then** workflow behavior follows the documented routing rules for that lane authority.
- **Given** review or QA identifies an implementation issue, **when** the work is rerouted, **then** the reroute returns the work to the implementation stage path appropriate to the current lane and remains inspectable.
- **Given** review or QA identifies a design flaw or requirement gap in full delivery, **when** the work is rerouted, **then** the reroute returns the work to `full_solution` or `full_product` respectively and remains inspectable.
- **Given** QA or review identifies a migration parity or compatibility issue, **when** the work is rerouted, **then** the reroute follows the documented migration feedback path and remains inspectable.
- **Given** interrupted work is resumed, **when** an operator uses the runtime state surfaces, **then** the operator does not need hidden implementation knowledge to determine what happens next.
- **Given** this feature is declared complete, **when** the resulting workflow-engine product claim is reviewed, **then** it remains bounded to workflow-engine completeness and does not depend on unrelated platform or product redesign work.

## Edge Cases
- A work item has the correct lane but incomplete artifact, approval, issue, or evidence state for its current stage.
- A rerouted work item moves backward to an earlier stage and must remain inspectable after the reroute.
- A resumed work item has enough state to identify ownership and blockers but not to advance until missing workflow requirements are satisfied.
- A lane-mismatch concern appears on a user-explicit lane and must surface as advisory rather than silent rerouting.

## Error And Failure Cases
- The feature fails if operators still need to infer stage ownership, blockers, or reroute state from scattered docs or hidden internals.
- The feature fails if stages appear to advance without inspectable owner, gate, artifact, issue, or evidence state where the current contract requires it.
- The feature fails if reroutes bypass current product, solution, implementation, review, or QA boundaries.
- The feature fails if user-explicit lane authority is silently overridden.
- The feature fails if workflow-engine product claims exceed what the current repository actually supports.

## Open Questions
- What is the smallest solution that makes workflow-engine completeness operator-visible without expanding into adjacent runtime or platform work?
- Where should the practical product boundary be drawn between workflow engine, policy engine, and session manager so responsibilities are complete but not duplicated?
- Which current workflow behaviors are already complete enough to formalize versus which require additional work to meet the acceptance bar?
- What is the minimum inspectable surface needed so operators can see blocked, ready, and reroute state without relying on internal knowledge?
- Are there any current gaps between documented workflow behavior and actual runtime behavior that must be resolved before this feature can pass?
- Which degraded or partial states, if any, are acceptable as visible limitations rather than reasons to fail the feature?

## Success Signal
- Operators can trust workflow state to answer where the work is, who owns it, what is blocking it, and what happens next.
- The workflow engine can be truthfully described as the complete product layer for the current OpenKit workflow model: roster ownership, lane behavior, approvals, routing, and resumable state.
- Solution design can proceed without rediscovering or redefining product intent for workflow-engine completeness.

## Handoff Notes For Solution Lead
- Preserve the bounded interpretation of “workflow engine complete”: this is about truthful completeness for the current documented workflow model, not broad product redesign.
- Preserve the current role roster, lane model, gate model, and feedback-loop semantics unless repository reality forces explicit narrowing.
- Keep the solution focused on operator-visible inspectability and reliability: ownership, stage progression, gate status, reroutes, and resumability.
- Do not solve this by expanding scope into unrelated runtime/platform work.
- If any documented behavior cannot be made truthful within the current repo reality, narrow the claim explicitly rather than implying broader completeness.
