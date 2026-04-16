---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: PRODUCT-POLISH
feature_slug: product-polish
source_scope_package: docs/scope/2026-04-16-product-polish.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Product Polish

## Chosen Approach
- Deliver PRODUCT-POLISH as a bounded operator-facing polish pass over existing product surfaces: normalize shared output vocabulary, tighten doctor/readiness summaries, make degraded and override conditions first-class, and improve install/upgrade/uninstall/release usability without changing workflow architecture.
- This is enough because the approved scope is about operator comprehension, inspectability, and next-step guidance across current surfaces, not a new runtime model or broad UX redesign.

## Impacted Surfaces
- Diagnostics and readiness output:
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
- Operator-facing command/help and answer presentation surfaces that already emit guidance:
  - `README.md`
  - existing CLI/runtime output paths for `dh doctor`, `dh --help`, `dh update`, `dh index`, and knowledge/inspection flows that emit operator guidance
- Product/workflow boundary docs:
  - `context/core/runtime-surfaces.md`
  - `context/core/project-config.md`
- Release/install usability docs and lifecycle contract:
  - `docs/operations/release-and-install.md`
  - install/upgrade/uninstall/release-facing script output paths already used in the repo

## Boundaries And Components
- **This feature owns:** operator-visible wording, summary structure, status labeling, degraded/fallback messaging, lifecycle outcome messaging, and next-step guidance across the approved surfaces.
- **This feature does not own:** workflow lane semantics, approval-gate behavior, runtime architecture, broad command redesign, or release automation replacement.
- **Doctor remains** the product/install/workspace health surface; it must not silently become a workflow-state progression surface.
- **Workflow-state and policy inspection remain** lower-level inspection surfaces and should be referenced as follow-up actions when needed, not merged into top-level product-health claims.

## Interfaces And Data Contracts
- Reuse the existing lifecycle condition vocabulary already present in repository reality:
  - `healthy`
  - `degraded`
  - `unsupported`
  - `misconfigured`
- Reuse the existing capability-boundary vocabulary where relevant:
  - `supported`
  - `limited`
  - `fallback-only`
- Use `blocked` only when the operator cannot safely proceed.
- Use explicit lifecycle outcomes such as `completed` and `noop` where the current lifecycle commands already support them.
- Operator-facing success/readiness messaging must visibly distinguish:
  - evidence-backed success
  - degraded success
  - fallback path
  - manual override
  - preview-only behavior

Every polished operator-facing surface should answer, compactly:
- what surface this is
- current condition
- why it has that condition
- what still works or is limited
- next recommended action

## Risks And Trade-offs
- The repository currently mixes product-story wording with shipped `dh` runtime surfaces. Implementation must polish the current operator experience truthfully without inventing unshipped OpenKit behavior.
- Overloading `doctor` with workflow-state or policy internals would blur the boundary the approved scope requires.
- Updating docs without aligning command output would create a polished story but not a polished operator experience.
- Over-expanding this feature into general CLI redesign or runtime refactoring would violate the bounded product-polish scope.

## Recommended Path
- Settle one shared operator vocabulary first, then apply it consistently to doctor/readiness output, degraded/override messaging, and install/upgrade/uninstall/release-facing lifecycle surfaces.
- Preserve the existing product-vs-workflow-state split documented in `context/core/runtime-surfaces.md`, and make lower-level inspection commands a clear follow-up path rather than implicit hidden knowledge.

## Implementation Slices
### Slice 1: shared operator vocabulary and output contract
- **Goal:** normalize the operator-facing condition, capability, and evidence vocabulary across the approved surfaces.
- **Primary surfaces:** `packages/runtime/src/diagnostics/doctor.ts`, `README.md`, `context/core/runtime-surfaces.md`, `context/core/project-config.md`, `docs/operations/release-and-install.md`
- **Details:**
  - Standardize condition wording around `healthy`, `degraded`, `unsupported`, `misconfigured`, and `blocked`.
  - Standardize capability wording around `supported`, `limited`, and `fallback-only`.
  - Standardize evidence wording so operators can see whether a result is evidence-backed, degraded, fallback-based, preview-only, or override-dependent.
  - Keep wording compact and operator-facing rather than maintainer-internal.
- **Validation:** `npm test` with updated targeted assertions where output contracts are exercised; doc consistency review across touched operator-facing docs.

### Slice 2: doctor summary and degraded UX polish
- **Goal:** make `dh doctor` readable as a first-class readiness surface without hidden runtime knowledge.
- **Primary surfaces:** `packages/runtime/src/diagnostics/doctor.ts`, `packages/runtime/src/diagnostics/doctor.test.ts`
- **Details:**
  - Preserve the three current readiness classes: install/distribution, runtime/workspace readiness, and capability/tooling.
  - Make the overall summary clearly communicate `ready`, `ready with known degradation`, or not-ready/blocked state based on the existing status model.
  - Ensure degraded states always state what still works, what is limited/unavailable, and what the next action should be.
  - Preserve existing structured snapshot semantics; this is output polish, not model redesign.
- **Validation:** `npm test -- packages/runtime/src/diagnostics/doctor.test.ts`

### Slice 3: evidence/readiness truthfulness and boundary clarity
- **Goal:** prevent operator-facing success output from hiding degraded, fallback, or manual conditions.
- **Primary surfaces:** doctor/readiness summaries, README/operator guidance, product/workflow boundary docs
- **Details:**
  - Ensure product-health output does not imply workflow progression or policy satisfaction unless it explicitly says so.
  - When deeper inspection is needed, direct operators to the correct lower-level surface instead of embedding workflow-state detail into doctor.
  - Make manual override, fallback-path, and preview-only wording explicit where those states are already possible.
- **Validation:** `npm test`; review touched operator docs and output strings for boundary consistency with `context/core/runtime-surfaces.md`.

### Slice 4: install/upgrade/uninstall/release usability polish
- **Goal:** make lifecycle flows end with understandable outcomes and next commands.
- **Primary surfaces:** `docs/operations/release-and-install.md` and the corresponding install/upgrade/uninstall/release-facing output paths already used in the repo
- **Details:**
  - Normalize lifecycle completion/failure messaging so operators can tell what happened and what to run next.
  - Preserve existing release artifact verification, rollback, and platform-support constraints.
  - Keep release/install guidance aligned with real repository commands and supported paths only.
- **Validation:** `npm test` for any existing lifecycle-output coverage; consistency review against `docs/operations/release-and-install.md` and touched lifecycle messaging.

## Dependency Graph
- Critical path: `Slice 1 -> Slice 2 -> Slice 3 -> Slice 4`
- Slice 1 must land first because it defines the shared vocabulary and output contract used by all later slices.
- Slice 4 may run in parallel with late Slice 2/3 implementation only after Slice 1 wording is settled.

## Parallelization Assessment
- parallel_mode: `limited`
- why: vocabulary/doctor work and lifecycle-doc/output polish can overlap only after the shared terminology contract is fixed; before that, parallel work risks inconsistent operator wording.
- safe_parallel_zones:
  - `packages/runtime/src/diagnostics/`
  - `docs/operations/`
  - `context/core/`
  - `README.md`
- sequential_constraints:
  - `TASK-VOCAB -> TASK-DOCTOR -> TASK-EVIDENCE-BOUNDARY`
  - `TASK-VOCAB -> TASK-LIFECYCLE-USABILITY`
- integration_checkpoint: review all touched operator-facing strings together before handoff to QA so terminology and boundary language are consistent.
- max_active_execution_tracks: `2`

## Validation Matrix
- **Acceptance target:** operator can distinguish install/workspace health from workflow-state inspection.
  - **Validation path:** review touched output and docs against `context/core/runtime-surfaces.md`; ensure doctor/readiness wording does not claim workflow progression.
- **Acceptance target:** degraded, fallback, preview-only, and manual conditions are surfaced honestly.
  - **Validation path:** targeted `doctor` tests and output assertions; manual review of touched lifecycle and guidance strings.
- **Acceptance target:** `dh doctor` provides understandable ready/degraded/blocked guidance and next steps.
  - **Validation path:** `npm test -- packages/runtime/src/diagnostics/doctor.test.ts`
- **Acceptance target:** install/upgrade/uninstall/release-facing flows end with actionable next-step guidance.
  - **Validation path:** existing lifecycle validation where present plus operator-doc consistency review against `docs/operations/release-and-install.md`.

## Integration Checkpoint
- Before code review and QA, compare all touched operator-facing summaries and lifecycle endings in one pass.
- Confirm the same vocabulary is used consistently across doctor output, degraded-state wording, README/operator guidance, and release/install docs.
- Confirm product-health messaging never hides degraded/manual/override conditions and never claims workflow-state progress implicitly.

## Rollback Notes
- If a wording or summary change makes operator state less truthful or blurs the product/workflow boundary, roll back to the prior message structure rather than preserving polished-but-misleading output.
- Preserve existing machine-readable snapshot fields and current lifecycle status enums; do not ship polish that breaks established consumers.

## Reviewer Focus Points
- Preserve the boundary between product/install/workspace health and workflow-state or policy inspection.
- Reject any wording that presents degraded, fallback, preview-only, or manual-override states as equivalent to healthy/evidence-backed success.
- Reject scope drift into runtime redesign, workflow redesign, or broad command-family changes.
- Verify that every touched operator-facing surface states the current condition and a plausible next action in operator language.
