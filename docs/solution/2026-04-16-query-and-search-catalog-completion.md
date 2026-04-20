---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: QUERY-AND-SEARCH-CATALOG-COMPLETION
feature_slug: query-and-search-catalog-completion
source_scope_package: docs/scope/2026-04-16-query-and-search-catalog-completion.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Query And Search Catalog Completion

## Chosen Approach

- Complete the catalog on the existing `dh` knowledge-command surfaces rather than introducing a new UI or product path.
- Make the query/search catalog explicit in the knowledge-command contract, presenter output, and operator docs so operators can inspect what is supported without inferring it from implementation details.
- Use one shared answer-state and evidence envelope across the guaranteed classes, while keeping each class honest about supported depth.
- Reuse existing repo reality: `dh ask`, `dh explain`, `dh trace`, the current bridge-backed query methods, the retrieval/search packages, and the repo test tooling (`npm run check`, `npm test`, Rust-side tests where touched).

Why this is enough:

- The repository already has real public operator surfaces (`docs/user-guide.md` documents `dh ask`, `dh explain`, and `dh trace`).
- The current app workflow already exposes a bounded question classifier and bridge-backed answer contract in `packages/opencode-app/src/workflows/run-knowledge-command.ts` and `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`.
- The remaining gap is catalog completion, inspectability, and truthful boundaries, not a need for broad retrieval or workflow redesign.

## Impacted Surfaces

- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- presenter/output surfaces under `apps/cli/src/presenters/`
- retrieval/search adapters under `packages/retrieval/src/query/` and `packages/retrieval/src/semantic/`
- bounded Rust bridge/query surfaces under `rust-engine/` only where required to support the approved classes truthfully
- `docs/user-guide.md` and any adjacent operator-facing docs/help text that enumerate supported knowledge capabilities

## Boundaries And Components

### First-Class Query Classes Guaranteed In This Feature

The completed catalog must surface these query classes as explicit first-class product-visible capabilities:

1. definition lookup
2. reference / usage lookup
3. dependency lookup
4. dependent lookup
5. call hierarchy lookup
6. trace / flow query
7. bounded impact-oriented query

### First-Class Search Classes Guaranteed In This Feature

The completed catalog must surface these search classes as explicit first-class product-visible capabilities:

1. symbol search
2. file / path search
3. code pattern / structural search
4. bounded concept / relevance-oriented repository search

### Operator-Visible Surface Shape

- `dh ask` remains the general catalog entry path.
- `dh explain` remains the symbol/definition-oriented inspection path.
- `dh trace` remains the trace/flow-oriented inspection path.
- structured presenter/report output is the canonical place where class, support state, evidence, and limitations are exposed.
- operator-facing docs/help must enumerate the catalog and its support boundaries explicitly enough that operators do not need to inspect raw internals.

### Truthful Support Boundary For Bounded Classes

- **call hierarchy**: first-class, but bounded to direct or otherwise narrowly grounded caller/callee relationships only; no IDE-grade deep hierarchy claim.
- **trace / flow**: first-class, but bounded to static, inspectable, repository-grounded flow assembled from direct supported relationships; no runtime execution tracing or unbounded flow reconstruction claim.
- **impact-oriented query**: first-class, but bounded to direct references, direct dependents, direct dependencies, and any explicitly supported narrow flow/call neighbors; no broad blast-radius prediction claim.
- **concept / relevance-oriented search**: first-class, but bounded to repository-indexed relevance/semantic support available in current repo reality; weak or unavailable semantic support must degrade to `partial`, `insufficient`, or `unsupported` instead of implying universal concept coverage.

### Explicit Non-Goals

- no broad retrieval redesign
- no ranking redesign
- no LLM behavior redesign
- no new UI or editor integration
- no IDE-grade parity claim
- no autonomous planning, remediation, or code modification behavior
- no workflow-lane or platform redesign
- no performance or scale commitments beyond current repo reality

## Interfaces And Data Contracts

### Shared Result Envelope

Every first-class class should surface a consistent operator-visible envelope:

- `catalogClass`: exact query/search class being invoked
- `answerType`: concrete result type for the returned answer
- `supportState`: `grounded` | `partial` | `insufficient` | `unsupported`
- `supportDepth`: explicit depth label for bounded classes where depth matters
- `answer`: concise conclusion or direct response
- `evidence`: bounded list of supporting evidence entries
- `limitations`: explicit gaps, ambiguity notes, or unsupported-depth wording
- `provider`: source family used (bridge graph query, symbol search, structural search, semantic/relevance search, etc.)
- `inspection`: minimal request/classification metadata needed for reviewer and QA traceability

### Minimum Evidence Entry

Each surfaced evidence entry should include:

- `filePath`
- `lineStart` / `lineEnd` when available
- `symbol` or relationship label when available
- `reason`
- `sourceMethod`
- optional `snippet`
- optional `score`

### Answer-State Rules

- `grounded`: the answer is directly supported by surfaced evidence.
- `partial`: some grounded evidence exists, but coverage or depth is incomplete.
- `insufficient`: the class is valid, but the invocation did not produce enough evidence for a safe answer.
- `unsupported`: the class or requested depth falls outside the supported release boundary.

The implementation must not collapse `partial`, `insufficient`, and `unsupported` into one vague failure mode.

## Risks And Trade-offs

- **Catalog drift risk:** implementation could broaden some classes while docs or presenter output still describe the older narrower surface. Mitigation: freeze the exact class list and answer-state model first, then align code and docs to that contract.
- **Overclaim risk for trace/impact/concept search:** adjacent capabilities are easy to imply more broadly than current repo evidence supports. Mitigation: require per-class support-depth wording and explicit unsupported-depth outcomes.
- **Surface blending risk:** query and search classes could remain operator-visible but vague and undifferentiated. Mitigation: encode class identity in the result envelope and docs, not only in internal routing.
- **Contract mismatch risk across TS/Rust paths:** presenter, workflow classification, and bridge methods all touch the same narrow surface. Mitigation: keep work sequential and validate the shared envelope before QA handoff.

## Recommended Path

- Freeze the exact query/search catalog and the shared answer-state contract before expanding any provider behavior.
- Route `dh ask`, `dh explain`, and `dh trace` through explicit catalog classes rather than a narrower implicit subset.
- Add only the bounded bridge/query/search support needed to make each guaranteed class truthful and inspectable.
- Align presenter output and operator docs to the same catalog and limitation vocabulary.

## Implementation Slices

### Slice 1: Freeze the catalog and answer-state contract

- **Goal:** define the exact first-class classes, per-class support boundaries, and shared result envelope before touching provider depth.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - shared/presenter-facing types where the result envelope is defined or consumed
  - relevant presenter/output surfaces under `apps/cli/src/presenters/`
- **Validation Command:** `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts && npm run check`
- **Details:**
  - make query classes and search classes explicitly enumerable
  - add `grounded` / `partial` / `insufficient` / `unsupported` as the operator-visible state model
  - define per-class support-depth wording for call hierarchy, trace, impact, and concept/relevance search
  - reviewer focus: no hidden class support and no vague merged limitation state

### Slice 2: Map the catalog onto current operator-visible surfaces

- **Goal:** make `dh ask`, `dh explain`, and `dh trace` expose the broader catalog as the public product surface.
- **Files:**
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - presenter/output surfaces under `apps/cli/src/presenters/`
  - any CLI command/help text files that define operator wording
- **Validation Command:** `npm test -- packages/opencode-app/src/workflows/run-knowledge-command.test.ts && npm run check`
- **Details:**
  - keep the existing CLI entry surfaces rather than introducing a new operator path
  - make class selection and surfaced support boundaries inspectable in output
  - reviewer focus: catalog breadth is product-visible, not merely implementation-visible

### Slice 3: Fill bounded provider gaps without redesign drift

- **Goal:** support the approved classes truthfully using the existing bridge/retrieval architecture.
- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - retrieval/search adapters under `packages/retrieval/src/query/` and `packages/retrieval/src/semantic/`
  - bounded Rust bridge/query surfaces under `rust-engine/` only where needed
- **Validation Command:** `npm test && npm run check && cargo test --workspace`
- **Details:**
  - add only the narrow provider behavior needed for the guaranteed classes
  - preserve truthful downgrade paths for weak or absent support
  - reviewer focus: no retrieval/ranking/LLM redesign and no IDE-grade parity drift

### Slice 4: Align presenter output and docs to the completed catalog

- **Goal:** ensure operators and maintainers can inspect the completed catalog directly from product-visible surfaces.
- **Files:**
  - presenter/output surfaces under `apps/cli/src/presenters/`
  - `docs/user-guide.md`
  - adjacent operator-facing docs/help text as needed
- **Validation Command:** `npm test && npm run check`
- **Details:**
  - enumerate supported classes and bounded support expectations
  - keep output language consistent across supported, partial, insufficient, and unsupported results
  - reviewer focus: docs and surfaced output must not promise more than the runtime actually supports

### Slice 5: Integration checkpoint for honest catalog completion

- **Goal:** prove the broader catalog is explicit, bounded, and inspectable before QA handoff.
- **Files:** implementation surfaces above plus downstream QA artifact under `docs/qa/`
- **Validation Command:** `npm test && npm run check && cargo test --workspace`
- **Details:**
  - verify each guaranteed class is explicitly enumerable on the product surface
  - verify at least one positive grounded case for supported classes where current repo reality can truthfully ground one
  - verify partial / insufficient / unsupported paths for adjacent or over-depth requests
  - verify trace, impact, and concept/relevance wording stays bounded and honest

## Dependency Graph

- Critical path: `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Slice 1 must happen first because the catalog contract and answer-state model determine the rest of the implementation and review surface.
- Slice 2 should precede provider-gap work so the public surface is frozen before deeper support is added.
- Slice 5 is the integration checkpoint before code review and QA.

## Parallelization Assessment

- parallel_mode: `none`
- why: workflow classification, bridge/provider behavior, presenter output, and operator docs all define one shared catalog contract; parallel execution would create drift risk across the same narrow surface.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: prove explicit catalog enumeration, one consistent answer-state model, and honest bounded handling for trace, impact, and concept/relevance-oriented search before QA handoff.
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
| exact query/search catalog is explicit | targeted workflow/presenter tests assert explicit class enumeration and surfaced class identity |
| query classes remain distinct from search classes | workflow classification tests and presenter output tests assert separate class families |
| result states are truthful | targeted tests cover `grounded`, `partial`, `insufficient`, and `unsupported` outputs |
| trace/impact stay bounded | tests and reviewer checklist confirm bounded depth wording and rejection/downgrade of over-depth requests |
| concept/relevance search stays honest | retrieval/workflow tests verify downgrade behavior when semantic support is weak, unavailable, or insufficient |
| operator-visible docs match runtime claims | doc/help updates reviewed against actual surfaced behavior; no broader claims than implementation supports |
| implementation stays inside scope | Code Reviewer and QA confirm no retrieval redesign, ranking redesign, LLM redesign, or new UI/editor path is required for acceptance |

## Integration Checkpoint

- Before `full_code_review`, confirm the product-visible surfaces can do all of the following without contradiction:
  - enumerate the guaranteed query/search classes
  - return a consistent answer/evidence envelope
  - distinguish `grounded`, `partial`, `insufficient`, and `unsupported`
  - expose bounded wording for call hierarchy, trace/flow, impact, and concept/relevance search
  - avoid implying broader support than current repo reality justifies

## Rollback Notes

- If provider-gap work threatens to drift into broader retrieval or graph redesign, revert to the last state where the public catalog contract is still explicit and truthful, then narrow the provider guarantee rather than widening scope.
- If a guaranteed class cannot be supported truthfully at implementation time, route back to `full_solution` so the guarantee is narrowed explicitly instead of being silently overclaimed.

## Reviewer Focus Points

- Preserve the exact first-class catalog defined in this package.
- Reject any implementation that implies broader trace, impact, or concept/relevance support than evidence justifies.
- Confirm query classes and search classes remain visibly distinct.
- Confirm weak support appears as `partial` or `insufficient`, not as a confident grounded answer.
- Confirm docs/help text and surfaced runtime output describe the same support boundaries.
