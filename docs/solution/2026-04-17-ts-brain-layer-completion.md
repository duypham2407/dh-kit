---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: TS-BRAIN-LAYER-COMPLETION
feature_slug: ts-brain-layer-completion
source_scope_package: docs/scope/2026-04-17-ts-brain-layer-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: TS Brain Layer Completion

## Recommended Path / Chosen Approach

- Complete the TS brain layer by adding one explicit TypeScript-owned contract for:
  - role orchestration
  - workflow-stage meaning
  - policy and skill activation
  - session/resume/audit continuity
  - operator-facing reasoning and limitation reporting
- Preserve the current repaired topology from `docs/solution/2026-04-17-process-manager-completion.md`: TypeScript remains the practical host/orchestrator on the current path, while Rust remains the authoritative foundation for process/lifecycle evidence, structural code evidence, query/search results, and storage-backed intelligence.
- Normalize canonical brain-layer semantics at the TS boundary instead of performing a broad runtime rewrite:
  - outward/canonical semantics remain `quick`, `migration`, and `full`
  - current internal aliases such as `delivery`, `architect`, `reviewer`, and `tester` may remain as compatibility details where needed during rollout
  - those aliases must not leak as an unlabelled second truth on operator/report/audit surfaces
- Prefer additive normalization and inspectability over ambitious architecture movement. This feature should finish the TS-owned brain contract, not redesign lane law, not invert host ownership, and not introduce daemon/distributed/autonomous behavior.

Why this is enough:

- Adjacent work already completed the critical neighboring contracts:
  - workflow-engine completeness
  - product-polish output rules
  - query/search catalog completion
  - hybrid-search completion
  - current-topology process-manager repair
- The remaining gap is not missing foundational capability. The gap is that TS-owned surfaces still risk telling fragmented or overly broad stories about roles, workflow, policy, session continuity, and reasoning support.
- A single bounded TS brain contract closes that gap without inventing new lanes, new runtime topology, or unsupported agency.

## Impacted Surfaces

### Canonical TS brain-contract and vocabulary surfaces

- `packages/shared/src/types/lane.ts`
- `packages/shared/src/types/stage.ts`
- `packages/shared/src/types/agent.ts`
- `packages/shared/src/types/role-output.ts`
- `packages/shared/src/types/execution-envelope.ts`
- `packages/shared/src/types/session.ts`
- `packages/shared/src/types/session-runtime.ts`
- `packages/shared/src/constants/stages.ts`
- `packages/shared/src/constants/roles.ts`

### Workflow orchestration and handoff surfaces

- `packages/opencode-app/src/workflows/run-lane-command.ts`
- `packages/opencode-app/src/workflows/quick.ts`
- `packages/opencode-app/src/workflows/delivery.ts`
- `packages/opencode-app/src/workflows/migration.ts`
- `packages/opencode-app/src/team/coordinator.ts`
- `packages/opencode-app/src/team/analyst.ts`
- `packages/opencode-app/src/team/architect.ts`
- `packages/opencode-app/src/team/implementer.ts`
- `packages/opencode-app/src/team/reviewer.ts`
- `packages/opencode-app/src/team/tester.ts`
- `packages/runtime/src/workflow/workflow-state-manager.ts`
- `packages/runtime/src/workflow/stage-runner.ts`
- `packages/runtime/src/workflow/gate-evaluator.ts`
- `packages/runtime/src/workflow/handoff-manager.ts`
- `packages/runtime/src/workflow/work-item-planner.ts`
- `packages/runtime/src/workflow/workflow-state-mirror.ts`

### Policy, skill, and enforcement surfaces

- `packages/opencode-app/src/planner/build-execution-envelope.ts`
- `packages/opencode-app/src/planner/choose-skills.ts`
- `packages/opencode-app/src/planner/required-tools-policy.ts`
- `packages/opencode-app/src/registry/skill-registry.ts`
- `packages/opencode-app/src/executor/enforce-skill-activation.ts`
- `packages/opencode-app/src/executor/enforce-tool-usage.ts`
- `packages/opencode-app/src/executor/answer-gating.ts`
- `packages/opencode-app/src/executor/hook-enforcer.ts`
- `packages/runtime/src/hooks/evidence-gate.ts`
- `packages/runtime/src/workflow/quality-gates-runtime.ts`

### Session, resume, persistence, and audit surfaces

- `packages/runtime/src/session/session-manager.ts`
- `packages/runtime/src/session/session-resume.ts`
- `packages/runtime/src/session/session-run-state.ts`
- `packages/runtime/src/session/session-summary.ts`
- `packages/runtime/src/session/session-bootstrap-log.ts`
- `packages/runtime/src/session/knowledge-command-session-bridge.ts`
- `packages/runtime/src/session/knowledge-command-runtime-persistence.ts`
- `packages/runtime/src/workflow/workflow-audit-service.ts`
- `packages/runtime/src/diagnostics/audit-query-service.ts`
- `packages/storage/src/sqlite/repositories/workflow-state-repo.ts`
- `packages/storage/src/sqlite/repositories/sessions-repo.ts`
- `packages/storage/src/sqlite/repositories/session-runtime-events-repo.ts`
- `packages/storage/src/sqlite/repositories/session-summary-repo.ts`
- `packages/storage/src/sqlite/repositories/session-checkpoints-repo.ts`
- `packages/storage/src/sqlite/repositories/knowledge-command-sessions-repo.ts`
- `packages/storage/src/sqlite/repositories/knowledge-command-summary-repo.ts`
- `packages/storage/src/sqlite/repositories/knowledge-command-runtime-events-repo.ts`
- `packages/storage/src/sqlite/repositories/tool-usage-audit-repo.ts`
- `packages/storage/src/sqlite/repositories/skill-activation-audit-repo.ts`
- `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts`
- `packages/storage/src/sqlite/repositories/quality-gate-audit-repo.ts`
- `packages/storage/src/sqlite/db.ts`

### Operator-facing reasoning and reporting surfaces

- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` only if TS needs additive bridge metadata already supported by current Rust surfaces
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/lane-workflow.ts`
- `README.md`
- `docs/user-guide.md`

### Upstream contracts this feature must preserve rather than redesign

- `docs/solution/2026-04-17-process-manager-completion.md`
- `docs/solution/2026-04-16-workflow-engine-complete.md`
- `docs/solution/2026-04-16-product-polish.md`
- `docs/solution/2026-04-16-query-and-search-catalog-completion.md`
- `docs/solution/2026-04-16-hybrid-search-completion.md`

## Risks And Trade-offs

- **Canonical-vs-compatibility vocabulary drift**
  - Current TS runtime code still uses internal terms such as `delivery`, `architect`, and `tester`, while approved workflow/docs use `full`, `Solution Lead`, and `QA Agent`.
  - Mitigation: add one explicit compatibility mapping contract first; do not let both vocabularies leak without explanation.

- **Quick-lane truthfulness risk**
  - Current quick runtime surfaces do not yet express the full approved quick semantics as clearly as the scope requires, especially around sole ownership and inspectable brainstorm/plan behavior.
  - Mitigation: quick surfaces must either adopt canonical outward semantics directly or persist explicit brainstorm/plan artifacts so the quick path is inspectable without hidden extra roles.

- **Policy-overclaim risk**
  - Tool and answer gating already exist, but “safety” and “budget” are partly implicit in current code.
  - Mitigation: surface current bounded policy behavior honestly instead of implying a broader autonomous policy engine than the repo actually has.

- **Session-memory overclaim risk**
  - Current continuity surfaces include summaries, checkpoints, last-input persistence, and runtime events. Those are useful, but they are not permission to present hidden memory as authoritative truth.
  - Mitigation: workflow/session state plus evidence/audit remain authoritative; summaries and continuation text remain helper context only.

- **Architecture aspiration drift**
  - `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md` describes a stronger Rust-host / TS-worker aspiration than the current repaired topology.
  - Mitigation: follow the ownership split from that architecture doc, but preserve the current-topology repair from `process-manager-completion` as the live execution truth for this feature.

- **Scope-expansion risk**
  - It is easy to let “brain layer completion” expand into daemon mode, distributed workers, multi-language support, or open-ended autonomy.
  - Mitigation: reject those expansions explicitly in code, docs, and presenter wording.

- **Cross-surface integration risk**
  - Shared types, workflow state, audits, presenters, and user docs all depend on the same vocabulary and support-state model.
  - Mitigation: keep execution sequential and require one integration checkpoint before handoff.

## Boundaries And Components

| Surface | TypeScript owns | Rust / foundation boundary to preserve | Must not become |
| --- | --- | --- | --- |
| Role orchestration | role mapping, handoff meaning, stage owner visibility, work-item planning, lane/report shaping | no TS-owned replacement for structural evidence or process truth | a hidden super-agent |
| Workflow execution | stage semantics, gate application, handoff payloads, reroute visibility, lane-lock truth | process/lifecycle truth remains grounded in current bridge/process surfaces | a new lane model or silent rerouter |
| Policy hooks | tool policy, answer gating, bounded safety decisions, bounded budget decisions, skill/MCP activation reasons | raw capability/degradation signals come from real runtime/evidence surfaces | an invisible autonomous control plane |
| Session/resume/audit | continuity, checkpoints, work-item context, audit timeline, next-safe-action derivation | workflow/evidence state stays authoritative over conversational memory | hidden memory-based truth |
| Operator reasoning/reporting | support-state selection, limitation wording, provider labeling, next-step guidance, refusal wording | query/search/process evidence remains Rust/retrieval/bridge-backed when claimed as grounded | speculative “AI knows everything” messaging |

### Rust foundation boundary

- Rust remains the authoritative source for:
  - process/lifecycle evidence and health truth on the current bridge path
  - structural query/search results and capability/degradation signals used by knowledge commands
  - storage-backed evidence and bridge-reported method/capability truth
- TypeScript must not create a second structural-truth source or present model-generated structure as if Rust had proven it.

### TypeScript brain boundary

- TypeScript owns:
  - orchestration truth
  - stage/role meaning at the product boundary
  - policy/skill/session reasoning surfaces
  - operator-visible limitation and support-state wording
  - refusal of unsupported brain-layer requests
- TypeScript may normalize or translate internal compatibility aliases, but it must never hide that translation from inspection surfaces.

### Current-topology rule

- Preserve the repaired current topology from `process-manager-completion`.
- This feature must not depend on:
  - Rust-host inversion
  - daemon/service mode
  - remote or distributed orchestration
  - long-running hidden autonomy

### Supported-brain boundary

- Supported role roster remains only:
  - `Master Orchestrator`
  - `Quick Agent`
  - `Product Lead`
  - `Solution Lead`
  - `Fullstack Agent`
  - `Code Reviewer`
  - `QA Agent`
- Supported workflow modes remain only:
  - `quick`
  - `migration`
  - `full`
- Supported reasoning/reporting remains bounded to current knowledge-command and workflow/report surfaces already present in the repo.

## Interfaces And Data Contracts

### 1. Canonical outward role contract with explicit compatibility aliases

| Canonical outward role | Current TS compatibility alias | Required rule |
| --- | --- | --- |
| `Quick Agent` | `quick-agent` / role `quick` | quick lane remains single-owner after dispatch |
| `Master Orchestrator` | `coordinator` only where used for routing/bootstrap/handoff | must remain procedural only; not the hidden author of content |
| `Product Lead` | `analyst` when producing problem/scope/acceptance output | outward reporting must show product-scope ownership clearly |
| `Solution Lead` | `architect` when producing solution/work-item output | outward reporting must show technical-direction ownership clearly |
| `Fullstack Agent` | `implementer` | implementation owner only |
| `Code Reviewer` | `reviewer` | review gate only |
| `QA Agent` | `tester` | verification owner only |

Contract rule:

- Internal aliases may remain temporarily for compatibility, but the TS brain must expose one clear outward role story on workflow, audit, presenter, and resume surfaces.
- Quick lane is stricter: no visible extra planner/reviewer/tester chain may be implied after quick dispatch.

### 2. Canonical lane and stage meaning contract

Outward lane contract:

- canonical outward vocabulary: `quick | migration | full`
- current compatibility alias: `delivery` may remain internal only as the current TS implementation alias for `full`
- no fourth lane, no hidden “brain mode,” no separate autonomy lane

Stage compatibility rules:

| Canonical outward meaning | Current compatibility alias / constraint |
| --- | --- |
| `full_product` | current `delivery_analysis` meaning must map here |
| `full_solution` | current `delivery_solution` meaning must map here |
| `full_implementation` | current `delivery_execute` meaning must map here |
| `full_code_review` | current `delivery_review` meaning must map here |
| `full_qa` | current `delivery_verify` meaning must map here |
| `full_done` | current `delivery_complete` meaning must map here |
| `migration_upgrade` | current `migration_execute` meaning must map here |
| `migration_code_review` | current `migration_review` meaning must map here |
| `migration_done` | current `migration_complete` meaning must map here |
| quick brainstorm/plan/implement/test/done semantics | may use compatibility internals, but the brain layer must make brainstorm choice, execution plan, implementation step, and verification evidence inspectable rather than silently collapsing them |

Internal-only planning sub-stages such as `delivery_task_split` or `migration_task_split` may remain as implementation details only if:

- they are clearly subordinate to the approved stage law
- they do not appear as a new public lane or contradictory stage sequence
- resume/report surfaces can still explain the canonical stage and next safe action

### 3. Lane authority and lane-lock contract

- For current command-driven TS product paths, explicit lane command selection plus persisted lane lock is the minimum inspectable authority contract.
- If the runtime recommends a different lane, that recommendation must be surfaced as an advisory note only; it must not silently reroute work.
- If OpenKit-compatible routing metadata is projected into these TS surfaces, it must remain additive and inspectable, not a hidden second controller.

### 4. Policy and skill contract

Execution-envelope and audit surfaces should carry, directly or by linked audit records, at minimum:

- `activeSkills`
- `activeMcps`
- `requiredTools`
- `evidencePolicy`
- hook decisions with `hookName`, `decision`, `reason`, `payloadIn`, `payloadOut`
- skill activation reason
- tool-usage status
- quality-gate availability/result/evidence/limitations

Policy interpretation for this feature must stay bounded to current repo reality:

- **tool policy**
  - enforce structured-tool requirements and banned-tool substitutions already present
- **answer policy**
  - use required-tool presence plus evidence thresholds to allow, retry, or degrade
- **safety policy**
  - keep blocked tools, lane-lock boundaries, browser-verification requirements, and unsupported request refusal inspectable
  - do not imply a broader hidden safety control plane than this
- **budget policy**
  - budget is limited to current real caps such as bounded result limits, evidence thresholds, compaction/truncation boundaries, and bounded restart/retry rules
  - if a result is narrowed by these caps, the answer must say so through limitations/reporting instead of appearing unlimited

Skill-system rule:

- Skills remain checked-in, role-scoped, lane-scoped reusable procedures.
- Skills must not appear to grant open-ended capability beyond the active role/lane/stage.

### 5. Session/resume/audit contract

Minimum inspectable state for the TS brain layer:

- active session id
- active lane / canonical outward lane meaning
- current stage / canonical outward stage meaning
- current owner / canonical outward owner meaning
- lane-lock or equivalent lane-authority state
- pending gate or gate-equivalent readiness state
- blockers
- active work-item context when present
- latest summary/checkpoint linkage
- recent runtime events
- recent role outputs
- recent skill/tool/MCP/hook/quality-gate audit
- next safe action derivable from persisted state

Continuity rule:

- persisted workflow/session/audit state remains authoritative
- continuation summaries, last-input persistence, and resumed conversation context remain secondary helpers only

### 6. Bounded reasoning/report contract

`packages/opencode-app/src/workflows/run-knowledge-command.ts` already carries the right shape to become the canonical TS reasoning/report envelope. The completed brain layer should preserve and normalize this operator-visible contract rather than inventing a separate one.

Required reasoning/report fields:

- `answer`
- `answerType`
- `catalogClass`
- `supportState`
- `supportDepth`
- `provider`
- `evidence[]`
- `limitations[]`
- `inspection`
- `processEvidence`
- `bridgeEvidence`
- `guidance[]`
- `sessionId`
- `resumed`
- `compaction`
- `persistence`

Support-state rule remains exactly:

- `grounded`
- `partial`
- `insufficient`
- `unsupported`

Truthfulness rules:

- retrieval-only fallback must remain visibly partial/insufficient when bridge-grounded evidence is absent
- unsupported brain-layer asks must return explicit limited/unsupported outcomes
- unsupported asks include, at minimum:
  - open-ended autonomous planning
  - hidden side effects
  - daemon/service orchestration claims
  - remote/distributed orchestration claims
  - broad multi-language support claims not implemented in current repo reality

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-17-ts-brain-layer-completion.md`
- Adjacent solution packages to preserve:
  - `docs/solution/2026-04-17-process-manager-completion.md`
  - `docs/solution/2026-04-16-workflow-engine-complete.md`
  - `docs/solution/2026-04-16-product-polish.md`
  - `docs/solution/2026-04-16-query-and-search-catalog-completion.md`
  - `docs/solution/2026-04-16-hybrid-search-completion.md`
- Architecture ownership reference to preserve, with current-topology caution:
  - `docs/migration/2026-04-13-system-architecture-analysis-rust-ts.md`
- Existing repo-native validation commands:
  - `npm run check`
  - `npm test`
  - `cargo test --workspace` from `rust-engine/` when Rust bridge/query surfaces are touched
- No new external packages, service processes, daemon modes, remote infrastructure, or environment variables are required for the recommended path.

## Implementation Flow

1. **Freeze one explicit TS brain contract first**
   - normalize canonical lane/role/stage/support vocabulary and label compatibility aliases
2. **Align workflow execution and handoff surfaces to that contract**
   - make quick/full/migration ownership and gate meaning inspectable without hidden extra roles
3. **Make policy and skill behavior first-class and inspectable**
   - record why tools, answers, skills, or budget limits changed execution behavior
4. **Normalize session/resume/audit continuity onto persisted state**
   - make next safe action derivable from stored state and audit, not hidden memory
5. **Align reasoning/report outputs with the same bounded contract**
   - keep `grounded/partial/insufficient/unsupported`, provider truth, lifecycle evidence, and limitations consistent
6. **Run one cross-surface integration checkpoint before handoff**
   - compare workflow state, audit records, presenters, and docs for one consistent brain-layer story

## Implementation Slices

### Slice 1: Freeze the canonical TS brain contract and compatibility vocabulary

- **Files:**
  - `packages/shared/src/types/lane.ts`
  - `packages/shared/src/types/stage.ts`
  - `packages/shared/src/types/agent.ts`
  - `packages/shared/src/types/role-output.ts`
  - `packages/shared/src/types/execution-envelope.ts`
  - `packages/shared/src/types/session.ts`
  - `packages/shared/src/types/session-runtime.ts`
  - `packages/shared/src/constants/stages.ts`
  - `packages/shared/src/constants/roles.ts`
- **Goal:** define one inspectable outward vocabulary for lanes, stages, roles, support states, and policy/session/reporting semantics.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - add explicit canonical-vs-compatibility alias handling for `full`/`delivery` and named roles vs current internal aliases
  - preserve current internal compatibility where necessary, but do not let compatibility names leak without labels
  - define how internal-only `*_task_split` stages remain subordinate and non-public
  - reviewer focus: no new lane, no hidden role family, no silent second truth source

### Slice 2: Align role orchestration and workflow execution to the approved brain-layer semantics

- **Files:**
  - `packages/opencode-app/src/workflows/run-lane-command.ts`
  - `packages/opencode-app/src/workflows/quick.ts`
  - `packages/opencode-app/src/workflows/delivery.ts`
  - `packages/opencode-app/src/workflows/migration.ts`
  - `packages/opencode-app/src/team/coordinator.ts`
  - `packages/opencode-app/src/team/analyst.ts`
  - `packages/opencode-app/src/team/architect.ts`
  - `packages/opencode-app/src/team/implementer.ts`
  - `packages/opencode-app/src/team/reviewer.ts`
  - `packages/opencode-app/src/team/tester.ts`
  - `packages/runtime/src/workflow/workflow-state-manager.ts`
  - `packages/runtime/src/workflow/stage-runner.ts`
  - `packages/runtime/src/workflow/gate-evaluator.ts`
  - `packages/runtime/src/workflow/handoff-manager.ts`
  - `packages/runtime/src/workflow/work-item-planner.ts`
- **Goal:** make role/stage ownership, lane authority, handoffs, and gate semantics match the approved quick/migration/full contract at the TS brain boundary.
- **Validation Command:** `npm run check && npm test -- packages/opencode-app/src/workflows/workflows.test.ts packages/runtime/src/session/session-resume.test.ts`
- **Details:**
  - quick lane must remain single-owner after dispatch and must not imply a hidden full/migration handoff chain
  - full-delivery outward semantics must clearly map product scope -> solution -> implementation -> review -> QA
  - migration outward semantics must clearly map baseline -> strategy -> upgrade -> review -> verify
  - retain current compatibility aliases only where they remain explicit and non-contradictory
  - reviewer focus: `Master Orchestrator` stays procedural only; no silent lane override; no hidden extra owners

### Slice 3: Make policy hooks and skill composition first-class and inspectable

- **Files:**
  - `packages/opencode-app/src/planner/build-execution-envelope.ts`
  - `packages/opencode-app/src/planner/choose-skills.ts`
  - `packages/opencode-app/src/planner/required-tools-policy.ts`
  - `packages/opencode-app/src/registry/skill-registry.ts`
  - `packages/opencode-app/src/executor/enforce-skill-activation.ts`
  - `packages/opencode-app/src/executor/enforce-tool-usage.ts`
  - `packages/opencode-app/src/executor/answer-gating.ts`
  - `packages/opencode-app/src/executor/hook-enforcer.ts`
  - `packages/runtime/src/hooks/evidence-gate.ts`
  - `packages/runtime/src/workflow/quality-gates-runtime.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
- **Goal:** surface tool/answer/safety/budget policy and skill activation as explicit, bounded brain-layer behavior.
- **Validation Command:** `npm run check && npm test -- packages/opencode-app/src/executor/hook-enforcer.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`
- **Details:**
  - preserve current checked-in skill registry as the supported skill universe for this feature
  - keep skill activation subordinate to role/lane/stage
  - record policy reasons when a tool is blocked, an answer is retried/degraded, browser evidence is required, or a request is unsupported
  - express current budget policy only through real repo caps already present; do not invent token-budget or autonomy-budget machinery that does not exist
  - reviewer focus: no hidden side effects, no invisible skill escalation, no overclaim of policy depth

### Slice 4: Normalize session, resume, and audit continuity on persisted state

- **Files:**
  - `packages/runtime/src/session/session-manager.ts`
  - `packages/runtime/src/session/session-resume.ts`
  - `packages/runtime/src/session/session-run-state.ts`
  - `packages/runtime/src/session/session-summary.ts`
  - `packages/runtime/src/session/session-bootstrap-log.ts`
  - `packages/runtime/src/session/knowledge-command-session-bridge.ts`
  - `packages/runtime/src/session/knowledge-command-runtime-persistence.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/runtime/src/diagnostics/audit-query-service.ts`
  - `packages/runtime/src/workflow/workflow-state-mirror.ts`
  - `packages/storage/src/sqlite/repositories/workflow-state-repo.ts`
  - related session/audit repos under `packages/storage/src/sqlite/repositories/`
  - `packages/storage/src/sqlite/db.ts`
- **Goal:** make interrupted-work recovery and audit inspection explainable from persisted state and event lineage rather than hidden conversation memory.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - resume must expose current work, current owner, current stage, blockers, pending gate/readiness, latest evidence, and next safe action
  - session summaries, checkpoints, compaction summaries, and persisted last-input text remain helper context only
  - audit must preserve role outputs, tool usage, skill activation, MCP route, quality gate, hook decision, and runtime-event lineage relevant to decision making
  - do not create a third hidden state source; compatibility mirrors remain mirrors
  - reviewer focus: no “memory-only” resume behavior and no ambiguous state authority

### Slice 5: Finish the bounded reasoning/reporting contract on knowledge-command surfaces

- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts` only if additive bridge metadata is required for current truthful reporting
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/lane-workflow.ts`
- **Goal:** make operator-facing reasoning/reporting tell the same truthful story as workflow, policy, session, and process surfaces.
- **Validation Command:** `npm run check && npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts`
- **Details:**
  - preserve and normalize `grounded` / `partial` / `insufficient` / `unsupported`
  - preserve explicit bridge-backed vs retrieval-backed distinction
  - preserve process evidence separately from answer support state
  - refuse unsupported autonomy, remote/distributed orchestration, daemon-only, or hidden-side-effect requests explicitly
  - reviewer focus: no answer may look fully grounded when Rust-backed evidence or explicit bounded fallback wording is absent

### Slice 6: Operator-facing wording and docs closure for the completed TS brain layer

- **Files:**
  - `README.md`
  - `docs/user-guide.md`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/lane-workflow.ts`
  - only the minimal adjacent docs/help surfaces needed for consistency
- **Goal:** make the shipped product story match the implemented TS brain-layer contract and current topology truth.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - explain current supported role/lane/knowledge-command behavior without implying host inversion or unsupported brain-layer autonomy
  - explain canonical outward semantics vs compatibility aliases where that distinction still exists
  - keep health/readiness state, workflow state, and answer support state separate in operator language
  - reviewer focus: docs must not promise daemon/distributed orchestration, hidden memory authority, or broader language/runtime support than the repo ships

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- Slice 1 must land first because every other slice depends on one stable outward vocabulary.
- Slice 2 depends on Slice 1.
- Slice 3 depends on Slices 1-2 because policy/skill behavior must align to the finalized role/lane/stage contract.
- Slice 4 depends on Slices 1-3 because resume and audit need stable role/stage/policy vocabulary.
- Slice 5 depends on Slices 1-4 and on preserved behavior from query/search/hybrid/process-manager adjacent features.
- Slice 6 depends on Slices 2-5 so docs/presenters reflect final behavior, not interim compatibility guesses.

## Parallelization Assessment

- parallel_mode: `none`
- why: shared type definitions, role/stage aliases, audit vocabulary, and support-state wording cut across every touched surface; partial parallel work would create high contradiction risk and weaken the core value of this feature.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5 -> SLICE-6`
- integration_checkpoint: verify that workflow state, role outputs, hook/audit logs, session resume, and knowledge-command presenters all tell one consistent story for quick/full/migration work and for grounded/partial/insufficient/unsupported reasoning outcomes.
- max_active_execution_tracks: `1`

Notes:

- `safe_parallel_zones` should be repo-relative artifact path-prefix allowlists such as `src/billing/` or `src/ui/settings/`.
- The current runtime evaluates `safe_parallel_zones` against task `artifact_refs` for `parallel_limited` overlap control.
- If a task falls outside declared zone coverage, it should remain sequential or the solution package should be updated before overlap is allowed.
- `sequential_constraints` should use ordered task-chain strings such as `TASK-API -> TASK-CONSUMER -> TASK-QA`.
- The current runtime applies `sequential_constraints` to full-delivery task boards as effective dependency overlays.
- Tasks named later in a chain should stay queued until the earlier task order is satisfied.

## Validation Matrix

| Target | Validation path |
| --- | --- |
| canonical lane/role/stage story is consistent | `npm run check`; `npm test`; workflow-focused coverage in `packages/opencode-app/src/workflows/workflows.test.ts`; presenter/output inspection for canonical outward semantics |
| quick lane stays single-owner and full/migration handoffs remain inspectable | `npm test -- packages/opencode-app/src/workflows/workflows.test.ts packages/runtime/src/session/session-resume.test.ts`; manual review of outward role/stage mapping in presenter/resume output |
| policy and skill effects are inspectable and bounded | `npm test -- packages/opencode-app/src/executor/hook-enforcer.test.ts packages/runtime/src/diagnostics/audit-query-service.test.ts`; audit record inspection against role/lane/stage scope |
| session/resume/audit do not depend on hidden memory | `npm test`; session/audit repository tests; inspect persisted summary/checkpoint/runtime-event lineage where touched |
| knowledge-command support states remain truthful | `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts apps/cli/src/presenters/knowledge-command.test.ts`; manual check that unsupported/autonomy requests surface explicit refusal/limitation wording |
| current topology truth is preserved | compare implemented wording/fields against `docs/solution/2026-04-17-process-manager-completion.md`; if bridge metadata changes, also run `cargo test --workspace` from `rust-engine/` |
| implementation stays inside scope | Code Reviewer and QA confirm no daemon/service mode, no remote/distributed orchestration, no hidden side effects, no multi-language expansion, and no Rust-host inversion claim were introduced |

Validation reality notes:

- Use real repo-native commands only: `npm run check`, `npm test`, and `cargo test --workspace` from `rust-engine/` when Rust surfaces are touched.
- No repo-native lint command is defined; do not invent one.

## Integration Checkpoint

Before handoff to `Fullstack Agent`, the completed TS brain-layer path should satisfy all of the following in one combined review pass:

- a representative quick workflow shows one outward owner (`Quick Agent`) and does not imply hidden full/migration handoffs
- a representative full/delivery workflow shows a clear outward chain for product scope, solution, implementation, review, and QA
- a representative migration workflow shows baseline/strategy/upgrade/review/verify meaning rather than greenfield feature planning
- session or resume inspection can identify current owner, current stage, blockers, next safe action, and relevant recent evidence/audit without hidden memory
- hook/audit inspection can explain why tools, skills, MCPs, or answer gating changed behavior
- knowledge-command output distinguishes:
  - grounded vs partial vs insufficient vs unsupported
  - bridge-backed vs retrieval-backed behavior
  - answer support state vs process/lifecycle state
- product-facing wording does not imply:
  - Rust-host inversion
  - daemon/service mode
  - remote/distributed orchestration
  - multi-worker autonomy
  - hidden side effects
  - multi-language support beyond current truthful scope

## Rollback Notes

- If canonical outward renaming creates compatibility breakage, keep internal aliases as labelled compatibility fields and narrow outward claims rather than forcing a big-bang rename.
- If quick-lane semantics cannot yet support a truthful outward brainstorm/plan story, preserve a narrower explicit quick claim and route back for solution narrowing instead of silently overclaiming quick completeness.
- If “budget” or “safety” behavior cannot be surfaced beyond current concrete caps and gates, keep the coarser truthful wording; do not invent deeper policy machinery.
- If additive bridge metadata would destabilize current process/query behavior, keep the TS-layer limitation wording and defer the bridge expansion.
- If any resume/audit path still depends on hidden memory, roll back that claim and keep persisted-state authority explicit.

## Reviewer Focus Points

- Preserve the approved architecture split:
  - Rust = process/query/search/storage/evidence foundation
  - TypeScript = orchestration/policy/skill/session/reporting brain layer
- Reject any implementation that introduces a hidden super-agent, silent lane override, or new lane/mode.
- Reject any operator-facing wording that implies daemon mode, distributed orchestration, remote execution, hidden side effects, or broad autonomous agency.
- Verify compatibility aliases are either normalized or explicitly labelled; they must never leak as an unexplained second workflow truth.
- Verify `grounded`, `partial`, `insufficient`, and `unsupported` stay distinct and that process/lifecycle evidence remains separate from answer support state.
- Verify session/resume depends on persisted workflow/audit/evidence state rather than hidden conversation memory.
- Verify the current topology repair from `process-manager-completion` is preserved and not silently replaced by Rust-host inversion claims.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - additive normalization over broad rewrite
  - current-topology honesty
  - explicit policy/skill/session/audit inspectability
  - bounded unsupported behavior with no hidden side effects
- **Code Reviewer must preserve:**
  - one coherent outward role/lane/stage story
  - no hidden policy or skill escalation
  - no unsupported autonomy or topology claims
  - truthful bridge-backed vs fallback reporting
- **QA Agent must preserve:**
  - representative quick/full/migration scenario verification
  - representative supported/limited/unsupported reasoning scenario verification
  - explicit confirmation that resume/audit surfaces explain the next safe action from persisted state
