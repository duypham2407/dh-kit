# Scope Package: Minimal Plugin / Extension Contract Hardening (DH)

Date: 2026-04-12
Owner: DH runtime / orchestration team
Execution driver:
- `docs/opencode/minimal-plugin-extension-contract-hardening-analysis-dh.md`

---

DH currently has internal extension-like behavior across planner, executor, registry, and workflow surfaces, but it does not yet have a formal minimal extension contract layer. That leaves room for policy drift, inconsistent metadata shape, and non-deterministic enforcement as new internal extension points are added. This scope defines the next selective-port task as **minimal plugin / extension contract hardening only**: establish deterministic contracts, metadata, reason-coded guardrails, and sequencing expectations for internal extension handling in DH. It does **not** introduce a full plugin loading platform, external packaging/distribution model, marketplace features, or upstream plugin subsystem parity.

## Problem Statement

- DH already has the runtime surfaces where extension behavior can affect execution:
  - shared SDK type surfaces,
  - app-layer registry/planner/executor/workflow boundaries.
- DH does **not** yet have a formal minimal extension contract layer that defines:
  - stable extension metadata,
  - contract version expectations,
  - capability declarations,
  - deterministic selection / ordering rules,
  - stable reason-coded allow/block behavior.
- Without that layer, future internal extension points are at risk of becoming ad hoc:
  - metadata shape can diverge across call sites,
  - planner and executor can explain decisions inconsistently,
  - runtime behavior can become harder to verify and audit,
  - policy intent can drift from implementation.
- The problem to solve is **formalizing a minimal deterministic extension contract and guardrail model for DH internal use**, without broadening into a full plugin platform.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Extension contract layer | No formal minimal extension contract layer yet | One explicit minimal contract defines required metadata, versioning, capability declaration, and decision vocabulary |
| Extension metadata | Internal extension-related metadata is not yet standardized as a dedicated contract | Metadata shape is explicit, stable, and shared across planning and execution surfaces |
| Planner/executor explainability | Selection and enforcement reasoning can remain implementation-local | Reason-coded decisions are explicit and stable across selection and enforcement |
| Ordering behavior | No guaranteed contract-level deterministic ordering for multiple extensions | Ordering rules are deterministic and inspectable |
| Change awareness | No formal minimal fingerprint/change-state contract | Minimal change-detection expectations are defined, with runtime state kept optional and bounded |
| Scope ambition | Internal extension behavior exists without a formal contract | Hardening of deterministic contract/metadata/guardrails only |
| Platform ambition | No full plugin platform today | Still no full plugin platform, packaging, marketplace, or external ecosystem scope |

## In Scope

1. **Minimal extension contract definition**
   - Define the minimum shared contract language for DH internal extensions.
   - Cover at least extension identity, contract version, entry reference, capability declaration, and decision/reason vocabulary.

2. **Reason-coded decision model**
   - Define stable allow/block/modify-style decision outputs and stable reason codes for common rejection or restriction paths.
   - Include at least contract/version mismatch, missing entry, and capability-denied style failure classes.

3. **Deterministic ordering and guardrail expectations**
   - Define how multiple extensions must be ordered deterministically.
   - Define guardrail expectations for lane/role/capability enforcement.

4. **Registry / planner / executor contract alignment**
   - Scope the contract so registry metadata, planner candidate selection, and executor enforcement all use the same shared vocabulary.
   - Keep workflow consumption dependent on standardized decisions rather than extension-specific local logic.

5. **Minimal metadata hardening**
   - Define the minimum metadata fields and optional change-detection/fingerprint expectations needed for deterministic behavior.
   - Keep runtime metadata/state intentionally minimal and bounded to DH’s current needs.

6. **Execution sequencing expectations for downstream implementation**
   - Define the expected implementation order so contract definition lands before enforcement/runtime hardening.

## Out of Scope

- Full plugin loading platform parity with upstream.
- Dynamic plugin discovery, installation, package resolution, file/npm source handling, or plugin lifecycle orchestration parity.
- External plugin ecosystem support, packaging, remote distribution, publishing, or marketplace features.
- Theme, asset, or UI plugin lifecycle support.
- Runtime isolation, trust/auth models, or broad third-party plugin security architecture.
- Broad retry/orchestration machinery beyond the minimum deterministic contract and guardrails needed for DH internal use.
- Replacing DH planner/executor/registry/workflow architecture with an upstream-style plugin subsystem.

## Business Rules and Scope Boundaries

1. **DH currently has no formal minimal extension contract layer** — this task starts from that factual baseline.
2. **Deterministic internal extension handling is the goal** — this scope is about stable contracts, metadata, and enforcement guardrails for DH internal extension points.
3. **Selective-port by pattern, not parity** — upstream plugin ideas are reference input for lifecycle staging, reason-coded failures, metadata, and guardrails, not a blueprint to port wholesale.
4. **No platform broadening** — this task must not expand into full plugin loading, packaging, marketplace, or external ecosystem support.
5. **Explainability is mandatory** — selection and enforcement outcomes must use stable reason-coded outputs rather than implicit behavior.
6. **Deterministic ordering is mandatory** — when more than one extension candidate applies, order must be stable and inspectable.
7. **Metadata stays minimal** — only metadata needed for contract enforcement and bounded change awareness belongs in scope.
8. **Workflow files should consume standardized decisions** — extension-specific logic must not spread deeply into workflow orchestration as part of this task.

## User Stories

- As a DH maintainer, I want a formal minimal extension contract, so that internal extension points use one shared deterministic shape instead of ad hoc metadata.
- As a DH runtime operator, I want reason-coded extension decisions, so that allow/block behavior is explainable and reviewable.
- As a downstream Solution Lead or implementer, I want clear phase sequencing for contract hardening, so that registry, planner, and executor changes happen in a safe order without broadening into full plugin platform work.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | The scope and downstream solution treat this task as minimal extension contract hardening only | No approved implementation path requires full plugin loading parity, packaging, marketplace, or external ecosystem work |
| AC-2 | DH defines one explicit minimal extension contract vocabulary for internal use | The approved solution includes a shared contract covering extension identity, contract version, entry reference, capability declaration, and decision/reason outputs |
| AC-3 | The contract defines stable reason-coded outcomes for selection/enforcement decisions | The approved solution names stable allow/block/modify-style decisions and stable reason codes for invalid or denied cases |
| AC-4 | The contract defines deterministic ordering expectations for multiple applicable extensions | The approved solution specifies an ordering rule that is stable and inspectable rather than implementation-order dependent |
| AC-5 | Registry, planner, and executor are aligned to one shared contract vocabulary | The approved solution does not leave each layer to invent its own metadata or reason schema independently |
| AC-6 | Capability and compatibility guardrails are part of the contract boundary | The approved solution includes contract-version and capability/lane/role guard expectations before activation/enforcement |
| AC-7 | Any metadata hardening beyond the core contract remains minimal and bounded | Fingerprint or change-state behavior, if included, is explicitly limited to minimal DH needs and does not become a full plugin metadata subsystem |
| AC-8 | Workflow orchestration is kept downstream of standardized extension decisions | The approved solution keeps extension-specific decision logic out of deep workflow-local branching wherever the shared planner/executor contract can own it |
| AC-9 | Execution sequencing is explicit and starts with contract definition before runtime hardening | The approved solution phases work as contract/types first, then registry/planner alignment, then executor enforcement, with later metadata state only if justified |
| AC-10 | The scope remains aligned with DH reality that no formal minimal extension contract exists today | The scope and solution do not assume an existing loader/platform layer that DH does not yet have |

## Edge / Failure Cases

- An extension spec declares an unsupported contract version.
- An extension spec is missing a required entry reference.
- An extension requests a capability that is not allowed for the active lane or role.
- Multiple extensions are eligible and would otherwise execute in non-deterministic order.
- Extension metadata changes between runs and requires bounded change detection or explicit reporting.
- An extension candidate is known to the registry but cannot pass compatibility or policy checks.
- A workflow attempts to rely on extension-specific branching without a standardized planner/executor decision surface.

## Risks / Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into full plugin platform work | Would turn a deterministic hardening slice into a much larger subsystem effort | Hold planning and review against the out-of-scope list and DH reality constraints |
| Over-design of the contract | A contract that is too broad would add complexity before DH needs it | Keep the contract minimal and tied only to current internal extension guardrail needs |
| Under-specified reason model | Weak decision codes would reduce auditability and make enforcement inconsistent | Require stable reason-coded outcomes as a core acceptance boundary |
| Planner/executor drift continues | A contract on paper only would not reduce behavior divergence | Treat cross-layer vocabulary alignment as core scope, not optional cleanup |
| Metadata scope expands unnecessarily | Full metadata persistence/parity would add operational burden without current value | Limit fingerprint/change-state requirements to optional minimal bounded use |

### Assumptions

1. `docs/opencode/minimal-plugin-extension-contract-hardening-analysis-dh.md` is the authoritative analysis input for this scope.
2. DH currently has internal extension-like surfaces but does not yet have a formal minimal extension contract layer.
3. The primary product need is deterministic internal extension handling, not third-party plugin distribution.
4. A minimal contract can be introduced incrementally across SDK types and app-layer policy/execution boundaries.
5. Runtime metadata state beyond the minimum contract may be deferred unless justified by concrete change-detection needs.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Contract baseline and scope freeze**
   - Confirm current DH extension-related surfaces and freeze the task to deterministic contract/metadata/guardrails only.
   - Confirm that full plugin platform parity is out of scope.

2. **Phase 1 — Minimal contract definition**
   - Define the shared extension contract vocabulary in the SDK/type boundary.
   - Finalize contract version semantics, capability declaration shape, and stable reason-code vocabulary.

3. **Phase 2 — Registry and planner alignment**
   - Align registry metadata to the shared contract.
   - Make planner outputs explainable through standardized candidate/rejection reasons.

4. **Phase 3 — Executor hardening**
   - Enforce contract version, capability/lane/role guardrails, and deterministic ordering.
   - Ensure blocked or modified decisions use the standardized reason model.

5. **Phase 4 — Optional bounded metadata state and verification**
   - Add minimal fingerprint/change-state handling only if needed for current DH verification value.
   - Verify decision evidence across allowed and blocked cases.

### Hard sequencing rules
- Do not begin by designing a full plugin loader or package/distribution mechanism.
- Do not let registry, planner, or executor each define separate contract vocabularies.
- Do not treat deterministic ordering or reason-coded failures as optional.
- Do not introduce external ecosystem assumptions into this slice.
- Do not make optional metadata persistence a prerequisite for core contract hardening success.

## Handoff Notes for Solution Lead

- Preserve DH reality: there is currently no formal minimal extension contract layer, only extension-related behavior across existing runtime surfaces.
- Keep the design narrow: formal minimal contract, reason codes, deterministic ordering, capability/version guardrails, and cross-layer vocabulary alignment.
- Treat the main acceptance hotspots as: shared contract definition, reason-coded explainability, deterministic multi-extension behavior, and explicit rejection of full plugin-platform scope creep.
- If a later task needs dynamic loading, packaging, or external ecosystem features, treat that as a separate scope package rather than expanding this hardening slice.
