---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: TS-BRAIN-LAYER-COMPLETION
feature_slug: ts-brain-layer-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: TS Brain Layer Completion

## Goal

- Complete the TypeScript brain layer as the bounded orchestration and product-behavior layer on top of the existing Rust-backed intelligence foundation and current runtime topology, so operators can truthfully use role-based agent orchestration, current workflow modes, policy and skill controls, session/resume surfaces, and operator-facing reasoning without hidden agency or unsupported capability claims.

## Target Users

- OpenKit operators and maintainers who use the current workflow lanes and knowledge-command surfaces and need the TypeScript layer to behave predictably, inspectably, and honestly.
- Reviewers, QA, and future maintainers who need one explicit product contract for the TS-owned brain layer instead of rediscovering role, policy, session, and reasoning boundaries from scattered implementation details.

## Problem Statement

- The repository already has substantial pieces of the Rust + TypeScript split in place: Rust-backed structural intelligence and evidence services, current workflow-engine semantics, current product-polish rules, bounded knowledge-command support states, and current topology guardrails. What remains incomplete is the single bounded product contract for the TypeScript brain layer that sits on top of those pieces.
- Today, the TypeScript side can still be interpreted too broadly or too vaguely: role boundaries can look like prompt conventions instead of product guarantees, workflow execution can look separate from policy/session behavior, and operator-facing reasoning can overread into “general agency” instead of bounded evidence-backed orchestration.
- This feature closes that gap by defining what TS brain-layer completion means in current repo reality: TypeScript owns orchestration truth, workflow behavior, policy/skill/session surfaces, and operator-visible reasoning contracts; Rust remains the structural intelligence foundation. The feature must complete that split honestly without requiring topology inversion, broad product redesign, or unsupported autonomous behavior.

## In Scope

- Complete the TS-owned brain layer on the current Rust-backed intelligence path and current runtime topology already reflected in the repository.
- First-class agent-role behavior for the current supported roster only:
  - `Master Orchestrator`
  - `Quick Agent`
  - `Product Lead`
  - `Solution Lead`
  - `Fullstack Agent`
  - `Code Reviewer`
  - `QA Agent`
- First-class workflow execution for the current supported modes only:
  - `quick`
  - `migration`
  - `full`
- Preservation and completion of the current lane semantics already documented in the repo, including stage ownership, approval-gate behavior, lane authority, reroute loops, and next-safe-action inspectability.
- TS policy-engine surfaces for the current brain layer, including bounded and inspectable:
  - tool policy
  - answer policy
  - safety policy
  - budget policy
- TS skill-system behavior for the current checked-in skill set, including explicit activation within role and lane boundaries rather than implicit capability expansion.
- TS session-manager behavior for the current product path, including conversation continuity where supported, resume, auditability, and work-item continuity above the structural intelligence layer.
- Bounded operator-facing reasoning on current answer/report surfaces such as the existing knowledge-command path, including evidence-backed result shaping, limitation wording, and truthful supported-versus-unsupported behavior.
- Cross-surface truthfulness between workflow state, policy limits, session continuity, and answer/report output so operators do not have to infer how the TS brain behaved from hidden internals.

## Out of Scope

- Rust-host topology inversion, making Rust the sole orchestration host for this feature, or redefining current host/process ownership as part of this work.
- Multi-language expansion beyond the current Rust foundation plus TS brain split.
- Daemon mode, persistent service mode, remote execution, networked control planes, or distributed orchestration.
- Multi-worker or pooled autonomous orchestration beyond the current bounded role and lane model.
- Open-ended autonomous agency, self-directed long-running planning, or hidden side effects outside the current inspectable workflow and command surfaces.
- Broad redesign of the product, CLI taxonomy, workflow taxonomy, or operator UX beyond what is necessary to complete the current TS brain-layer contract.
- Replacing the Rust-backed structural intelligence foundation with TS-owned structural truth or a second competing source of code-intelligence state.
- New external skill marketplace behavior, unbounded dynamic skill installation, or skill-driven workflow redesign.
- New guarantees of exhaustive reasoning depth, universal concept understanding, or IDE-grade intelligence beyond the bounded supported contract already present in the repo.

## Main Flows

- **Flow 1 — Quick lane remains a bounded single-owner brain path**
  - Operator starts quick work.
  - TS brain routes the work through the documented quick stages.
  - `Quick Agent` remains the sole stage owner after dispatch.
  - Brain-layer policy, skill, and answer limits may shape the work, but they do not introduce hidden handoffs or extra lane behavior.

- **Flow 2 — Full delivery uses explicit multi-role orchestration**
  - Operator starts or resumes full-delivery work.
  - TS brain preserves the documented handoff chain across Product Lead, Solution Lead, Fullstack Agent, Code Reviewer, and QA Agent.
  - Ownership, approvals, reroutes, and artifacts remain inspectable at each boundary.

- **Flow 3 — Migration stays parity-oriented, not greenfield planning**
  - Operator starts or resumes migration work.
  - TS brain preserves baseline, strategy, upgrade, review, and verify sequencing.
  - Policy, skill, and session behavior support that lane without turning migration into open-ended feature design.

- **Flow 4 — Bounded reasoning on top of Rust evidence**
  - Operator asks a code-understanding or reasoning-heavy question on the current supported product path.
  - TS brain classifies intent, requests Rust-backed evidence using current bridge/intelligence surfaces, applies answer/safety/budget policy, and returns a bounded result.
  - The surfaced result tells the operator what is grounded, what is limited, and what is unsupported.

- **Flow 5 — Resume and audit without hidden memory dependence**
  - Operator or reviewer resumes interrupted work or inspects a prior answer/workflow action.
  - TS brain uses current session/workflow surfaces to restore active work-item context, stage/owner, pending approval, blockers, relevant evidence/issues, and next safe action.
  - Session continuity may help context, but the operator can still inspect the current state without relying on unstated memory.

- **Flow 6 — Unsupported or unsafe brain-layer request is refused honestly**
  - Operator asks for unsupported autonomous behavior, unsupported depth, remote/distributed execution, or other out-of-scope brain-layer behavior.
  - TS brain returns an explicit unsupported or limited outcome.
  - The product does not silently attempt the unsupported behavior or imply support it does not have.

## Business Rules

- Rust remains the authoritative structural-intelligence foundation for code evidence, query/search truth, and bridge-reported capability or degradation signals.
- TypeScript remains the authoritative orchestration layer for role behavior, workflow progression, policy application, skill routing, session continuity, and operator-facing reasoning/report shaping.
- This feature must complete the TS brain layer on the current runtime topology. It must not depend on a Rust-host migration, daemon architecture, remote execution path, or other topology inversion to pass.
- Supported role behavior is limited to the current documented roster. The feature must not imply hidden extra role families or a single super-agent that silently overrides documented role boundaries.
- `Master Orchestrator` remains a procedural controller only. It routes, records state, controls approvals, and escalates per current rules; it does not become the hidden author of product, solution, implementation, or QA content.
- `Quick Agent` remains the sole owner of quick-mode execution after dispatch. Full-delivery and migration work remain handoff-based lanes with explicit stage owners and gates.
- Supported workflow modes remain only `quick`, `migration`, and `full`, with the documented lane-authority behavior and canonical stage sequences already defined in the repo.
- User-explicit lane choice remains authoritative. A detected lane mismatch may produce one advisory warning, but not a silent lane override.
- Tool policy, answer policy, safety policy, and budget policy are first-class brain-layer surfaces. When they constrain behavior, the constrained outcome must remain inspectable.
- Budget policy may limit evidence gathering, answer depth, or tool activity, but a budget-limited result must not be presented as an unlimited or fully grounded answer.
- Skill activation must stay bounded to the current checked-in skill set and remain subordinate to the active role and lane. Skills are reusable procedures, not a new autonomous control plane.
- Session memory may support continuity above the structural intelligence layer, but it must not replace authoritative workflow state or Rust-backed evidence.
- Resume surfaces must be able to explain the next safe action from inspectable state, not from hidden conversation memory alone.
- Audit surfaces must preserve enough lineage to inspect significant stage changes, role ownership changes, reroutes, policy-limited outcomes, overrides, and skill usage relevant to the decision path.
- Operator-facing reasoning must stay bounded to supported intents and repository-grounded evidence on current surfaces; it must not present speculative or purely model-generated conclusions as grounded repository truth.
- For reasoning-heavy outputs on the current supported brain-layer surfaces, the product must distinguish explicit support states already established in repo reality:
  - `grounded`
  - `partial`
  - `insufficient`
  - `unsupported`
- Operator-visible messaging must keep health/readiness state, workflow progression state, and answer-support state conceptually separate. One surface must not silently imply another.
- The product must not promise autonomous open-ended agency, unlimited planning depth, remote or distributed execution, or hidden side effects as part of TS brain-layer completion.

## Acceptance Criteria Matrix

- **Given** a quick-lane work item has been dispatched, **when** its stage and owner are inspected, **then** `Quick Agent` is the only stage owner for the remainder of the quick flow and no full-delivery or migration handoff chain is implied.
- **Given** a full-delivery work item is inspected at any stage, **when** owner and gate state are surfaced, **then** the current owner and pending approval align with the documented full-lane handoff chain instead of collapsing into one hidden planner role.
- **Given** a migration work item is inspected, **when** its stage path is surfaced, **then** the TS brain preserves the documented baseline/strategy/upgrade/review/verify model and does not represent migration as a greenfield feature-planning lane.
- **Given** lane authority is `user_explicit`, **when** the system detects that another lane might fit better, **then** it issues at most one advisory warning and does not silently reroute the work.
- **Given** a supported skill is activated or a policy decision materially changes execution behavior, **when** the work is later inspected through the current state or audit path, **then** the activation or decision is inspectable and remains subordinate to the active role and lane.
- **Given** tool policy or safety policy blocks or narrows an action, **when** the outcome is surfaced, **then** the product explicitly states the limitation and does not perform hidden side effects anyway.
- **Given** answer policy or budget policy limits evidence collection, answer depth, or tool activity, **when** the result is surfaced, **then** the limitation is explicit and the outcome is not presented as a fully grounded, unlimited answer.
- **Given** a supported reasoning request is handled on the current knowledge-command or equivalent brain-layer surface, **when** the answer is returned, **then** the result surfaces evidence/inspection context and an explicit support state of `grounded`, `partial`, `insufficient`, or `unsupported`.
- **Given** a reasoning request exceeds supported depth or asks for unsupported behavior such as autonomous open-ended planning, remote execution, daemon-only behavior, or distributed multi-worker orchestration, **when** the product handles that request, **then** it returns an explicit unsupported or limited outcome and does not silently attempt the unsupported behavior.
- **Given** a code-understanding answer is produced by the TS brain layer, **when** reviewers inspect the surfaced result, **then** grounded claims are traceable to Rust-backed evidence or to explicit degraded/insufficient limitation wording rather than a hidden TS-only structural truth source.
- **Given** interrupted work or a prior session is resumed, **when** the operator uses the current resume/state surfaces, **then** they can determine the active work item, mode, stage, owner, pending gate, blockers, next safe action, and relevant issue/evidence context without relying on hidden conversation memory.
- **Given** a stage change, reroute, manual override, degraded policy path, or similar significant event occurs, **when** state or audit surfaces are inspected, **then** the event remains inspectable enough to explain what changed and why.
- **Given** this feature is presented as completion of the TS brain layer, **when** docs or operator-visible output describe the capability, **then** the description remains honest about the current Rust-foundation + TS-brain split and current runtime topology and does not claim Rust-host inversion, broad multi-language expansion, or broad product redesign as part of this feature.

## Edge Cases

- A user-explicit lane choice conflicts with the system’s recommended lane, but the work must continue in the user-chosen lane unless the user authorizes a change.
- A reasoning request is valid, but semantic or other higher-signal inputs are unavailable, leaving a bounded partial or insufficient answer instead of a fully grounded one.
- A budget limit is reached after some relevant evidence is collected, requiring the product to return a narrowed answer with explicit limitation wording.
- A supported skill exists but is not applicable to the active role, lane, or stage, so the work continues without implying that the skill was used.
- A session has useful conversation history, but authoritative workflow state or Rust evidence is missing or stale, so resume must rely on inspectable state rather than hidden memory.
- A work item is resumed at a handoff boundary with a pending approval gate and prior issues, requiring next-safe-action clarity before any new execution.
- A request mixes a supported reasoning class with an unsupported deeper ask, requiring the answer to separate what is supported from what is outside the bounded contract.
- Current repo reality and older architecture aspirations differ on host/topology details; this feature must preserve truthful current-topology wording instead of inheriting broader architecture claims.

## Error And Failure Cases

- The feature fails if the product still implies one hidden general-purpose super-agent instead of the current bounded role model.
- The feature fails if workflow, policy, session, and answer surfaces tell conflicting stories about owner, stage, blockers, support state, or next action.
- The feature fails if tool, safety, answer, or budget policy silently limits behavior without surfacing that limitation.
- The feature fails if unsupported requests are executed anyway, produce hidden side effects, or are described as supported.
- The feature fails if grounded reasoning claims cannot be traced to surfaced Rust-backed evidence or explicit limitation wording.
- The feature fails if session resume depends on hidden conversation context alone rather than inspectable workflow/session state.
- The feature fails if audit surfaces omit critical reroute, override, skill, or policy-limited events needed to explain the decision path.
- The feature fails if TS brain-layer completion is described in a way that actually depends on Rust-host inversion, daemon/service mode, distributed orchestration, or broad product redesign.

## Open Questions

- None blocking at Product Lead handoff.
- If implementation evidence shows any brain-layer behavior above cannot be supported truthfully on the current repo surfaces, Solution Lead must narrow the claim explicitly in the solution package rather than hiding the limitation.

## Success Signal

- Operators can trust the TS brain layer to execute the current role and workflow model, apply policy/skill/session behavior in bounded ways, and explain what happened without hidden assumptions.
- Reasoning-heavy outputs tell an honest story about evidence, limitation, and support state instead of implying open-ended intelligence or agency.
- Current repo surfaces tell one consistent truth about what the TypeScript brain owns versus what the Rust foundation owns.
- Solution Lead can design implementation without inventing role boundaries, workflow semantics, policy behavior, session-resume rules, or operator-facing reasoning guarantees.

## Handoff Notes For Solution Lead

- Preserve the approved foundation split: Rust owns structural intelligence and evidence truth; TypeScript owns orchestration truth, workflow behavior, policy/skill/session behavior, and operator-facing reasoning contracts.
- Preserve current topology honesty. Complete the brain layer on the current runtime path; do not solve this feature by smuggling in Rust-host topology inversion or daemon/distributed orchestration.
- Reuse the already-approved boundaries from adjacent work (`workflow-engine-complete`, `product-polish`, `query-and-search-catalog-completion`, `hybrid-search-completion`, and `process-manager-completion`) instead of redesigning those contracts from scratch.
- Prefer the smallest cross-surface solution that makes agent roles, workflow execution, policy limits, session/resume, auditability, and reasoning support states tell one coherent story.
- Keep support-state and limitation wording explicit on reasoning-heavy surfaces. If exact data shapes differ in implementation, the surfaced product behavior must still preserve `grounded` / `partial` / `insufficient` / `unsupported` distinctions.
- Keep policy and budget effects inspectable. No silent answer trimming, silent unsupported behavior, or hidden side effects are acceptable.
- Keep session memory secondary to inspectable workflow state and Rust-backed evidence.
- If any desired behavior would require new lanes, broad UX redesign, open-ended agency, remote/distributed execution, multi-worker autonomy, or topology inversion, treat it as a future feature rather than expanding this one.
