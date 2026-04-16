---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: PHASE4-WORKFLOW-PARITY
feature_slug: phase4-full-workflow-multi-agent-parity
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Phase4 Full Workflow Multi Agent Parity

## Goal
- Enable a bounded, truthful full-delivery workflow experience so operators can start full-lane work, observe multi-role handoffs, and inspect stage, artifact, approval, and reroute state end to end.

## Target Users
- OpenKit operators using `/delivery` or `/task` when work routes into the full-delivery lane.
- Maintainers validating whether the repo truly supports its documented full-delivery workflow contract.

## Problem Statement
- Phase 3 improved `dh ask` graph, query, search, and evidence capability, but that does not yet prove the repo can run its own structured multi-agent delivery workflow. Phase 4 closes that gap by making the documented full-delivery lane minimally usable and inspectable as a real operator-visible product surface.

## In Scope
- Operator-visible full-delivery workflow capability beyond Phase 3.
- Minimal, truthful parity for the documented `full` lane in this repo.
- Full-delivery stage progression and ownership across:
  - Master Orchestrator
  - Product Lead
  - Solution Lead
  - Fullstack Agent
  - Code Reviewer
  - QA Agent
- Working operator paths for:
  - `/delivery`
  - `/task` when it routes to `full`
- Inspectable workflow state for current stage, current owner, linked artifacts, approvals, and reroute status.
- Scope, solution, and QA artifact tracking required by the full-delivery lane.
- Reroute behavior for implementation issues, design flaws, and requirement gaps.

## Out of Scope
- Quick-lane parity expansion.
- Migration-lane parity expansion.
- Production hardening, scale, or reliability work beyond bounded workflow correctness.
- New capabilities unrelated to full-delivery workflow parity.
- Broad redesign of operator UX or command vocabulary.
- Release management, deployment, or external integration work as a required part of this phase.
- Redefining the workflow contract instead of implementing the current documented one.

## Main Flows
- Operator starts work with `/delivery` and the work item enters `full` mode.
- Operator starts work with `/task`, routing selects `full`, and the work item follows the same full-delivery stage model.
- Work advances through Product Lead -> Solution Lead -> Fullstack Agent -> Code Reviewer -> QA Agent with inspectable ownership and approval changes.
- Review or QA findings reroute the work to the correct earlier stage instead of closing falsely.

## Business Rules
- “Full workflow / multi-agent parity” in Phase 4 means minimal, truthful parity for the existing full-delivery lane only.
- Workflow claims must align with current repository reality and the documented contract in `context/core/workflow.md`.
- Stage ownership, artifacts, approvals, and reroutes must be inspectable by operators; they must not depend on implicit log reading.
- Requirement gaps route back to product scope; design flaws route back to solution definition; implementation issues route back to implementation.
- This phase is bounded to workflow usability and inspectability, not production-grade hardening.

## Acceptance Criteria Matrix
- An operator can initiate a full-delivery work item through `/delivery`, and the work enters `full` mode with inspectable full-delivery stage state.
- An operator can initiate work through `/task`, and when routing selects `full`, the resulting work item follows the same full-delivery stage model.
- The full-delivery path supports these stage owners in sequence with inspectable ownership changes: Master Orchestrator, Product Lead, Solution Lead, Fullstack Agent, Code Reviewer, and QA Agent.
- During `full_product`, the workflow can produce and track a scope-package artifact for the work item.
- During `full_solution`, the workflow can produce and track a solution-package artifact for the same work item.
- During QA or closure, the workflow can produce and track QA or verification output expected by the full-delivery lane.
- Approval gates between full-delivery stages are inspectable in workflow state and reflect pending versus approved status.
- If review or QA identifies an implementation issue, the workflow can route the work back to implementation.
- If review or QA identifies a design flaw, the workflow can route the work back to solution definition.
- If QA identifies a requirement gap, the workflow can route the work back to product scope definition.
- An operator can inspect current work-item state and determine mode, current stage, current owner, linked artifacts, approval status, and reroute or issue status.
- Phase 4 success does not require production hardening, but the repo must truthfully demonstrate the bounded full workflow it claims to support.

## Edge Cases
- A work item has the correct mode but missing expected artifact linkage for the current stage.
- A work item reaches review or QA but cannot show the approval or ownership state needed to explain progress.
- A rerouted work item must remain inspectable after moving backward to an earlier stage.

## Error And Failure Cases
- The workflow appears to advance stages without updating inspectable owner, artifact, or approval state.
- The full-delivery path supports only a happy path and cannot truthfully reroute requirement, design, or implementation findings.
- Operator-visible surfaces disagree about the current stage, owner, or artifact set for the same work item.

## Open Questions
- What is the smallest operator demonstration that proves full-delivery parity credibly without drifting into later-phase hardening?
- Which operator-facing command and status surfaces are required for parity versus merely useful for maintainer diagnostics?
- What minimum artifact set must be auto-created versus manually linked to keep the workflow inspectable and truthful?
- What minimum reroute evidence is sufficient to prove real multi-agent workflow behavior rather than a linear happy path only?
- Are any documented full-delivery behaviors currently too broad to include in Phase 4 without explicit narrowing by Solution Lead?

## Success Signal
- A bounded verification path can show one full-delivery work item entering the full lane, producing the expected planning artifacts, progressing through review and QA stages, and either closing or rerouting with visible state.
- Operator-facing state surfaces tell the same stage, owner, artifact, and approval story as the documented full-delivery workflow.
- The repo can truthfully claim minimal full-delivery multi-agent parity with its current workflow contract.

## Handoff Notes For Solution Lead
- Preserve the bounded interpretation of “full workflow / multi-agent parity”: this phase is about minimal full-delivery parity, not all-lane parity and not Phase 5 hardening.
- Preserve the current documented full-delivery stage sequence and role boundaries unless repository reality forces explicit narrowing.
- Focus the solution on operator-usable, inspectable workflow behavior: start path, stage ownership, artifact tracking, approvals, and reroute handling.
- If any currently documented behavior cannot be made truthful in this phase, narrow it explicitly rather than implying broader parity than the repo can actually support.
