---
artifact_type: solution_package
version: 1
status: solution_lead_handoff
feature_id: LANGUAGE-DEPTH-HARDENING
feature_slug: language-depth-hardening
source_scope_package: docs/scope/2026-04-18-language-depth-hardening.md
owner: SolutionLead
approval_gate: solution_to_fullstack
---

# Solution Package: Language Depth Hardening

## Chosen Approach

- Start with an **evidence-first baseline reconciliation** of the current Rust capability matrix, bridge summaries, parser/query behavior, and TypeScript fixtures before any outward upgrade.
- Keep the architecture boundary unchanged:
  - **Rust owns** parser/indexer/query depth, `resolve_imports`, `bind_references`, `bind_call_edges`, relation evidence, and language-capability truth evolution.
  - **TypeScript owns** operator-visible support-state reporting, degraded/retrieval-only wording, and strict separation between answer/result state and language/capability state.
- Deepen only the direct relation families already approved in scope:
  - `graph_definition`
  - `graph_relationship_dependencies`
  - `graph_relationship_dependents`
  - `graph_relationship_usage` / references
- Use a strict hardening order:
  1. **forward truth first** (`resolve_imports`, same-package/module awareness, unresolved-edge visibility)
  2. **reverse truth second** (`dependents` only from real forward truth)
  3. **reference truth third** (`bind_references` only for bounded explicit subsets)
- Preserve TS/JS as the strongest current baseline and treat Python, Go, and Rust upgrades as **pair-specific** rather than language-wide.
- If proof is incomplete, keep the outward state at `partial`, `best-effort`, or `unsupported`; do not upgrade by wording alone and do not promise compiler-grade semantic resolution.

Why this is enough:

- The repo already has the right high-level contracts in place:
  - Rust `LanguageCapabilityEntry` / `LanguageCapabilitySummary`
  - bridge-level `languageCapabilityMatrix` and `languageCapabilitySummary`
  - TS-side answer-state vs capability-state separation
- The remaining gap is not missing product topology or missing language onboarding. The gap is uneven direct relation depth and at least one visible truth-drift risk between current matrix claims and bounded implementation evidence.
- The smallest honest path is therefore: **freeze truth, harden bounded relation depth, then re-upgrade only exact pairs that now have evidence**.

## Impacted Surfaces

### Rust relation-truth and binding surfaces

- `rust-engine/crates/dh-query/src/lib.rs`
- `rust-engine/crates/dh-engine/src/bridge.rs`
- `rust-engine/crates/dh-parser/src/lib.rs`
- `rust-engine/crates/dh-parser/src/adapters/common.rs`
- `rust-engine/crates/dh-parser/src/adapters/python.rs`
- `rust-engine/crates/dh-parser/src/adapters/go.rs`
- `rust-engine/crates/dh-parser/src/adapters/rust.rs`
- `rust-engine/crates/dh-parser/tests/multi_language_adapters.rs`

### Rust tests and capability-proof surfaces

- `rust-engine/crates/dh-query/src/lib.rs` _(existing in-file tests)_
- `rust-engine/crates/dh-engine/src/bridge.rs` _(existing in-file tests)_

### TypeScript operator-honesty and reporting surfaces

- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
- `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.ts`
- `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
- `apps/cli/src/presenters/knowledge-command.ts`
- `apps/cli/src/presenters/knowledge-command.test.ts`
- `packages/runtime/src/diagnostics/doctor.ts`
- `packages/runtime/src/diagnostics/doctor.test.ts`

### Preserve-only runtime/index surfaces

- `rust-engine/crates/dh-indexer/src/lib.rs`

Preserve-only note:

- `dh-indexer` is not a primary hardening target, but stale-fact cleanup and failed-file rewrite behavior must remain intact. Touch it only if new binding-failure propagation requires persisted failure/degradation changes.

### Upstream truth surfaces this feature must preserve

- `docs/scope/2026-04-18-language-depth-hardening.md`
- `docs/solution/2026-04-18-multi-language-support.md`
- `docs/migration/deep-dive-01-indexer-parser.md`
- `docs/solution/2026-04-17-ts-brain-layer-completion.md`

## Boundaries And Components

| Surface | Rust owns | TypeScript owns | Must not become |
| --- | --- | --- | --- |
| Capability truth by language/pair | `LanguageCapabilityEntry`, reasons, `parser_backed`, pair-level upgrade/narrow decisions | consuming and presenting that truth | a TS-derived second source of capability truth |
| Definition/dependency/dependent/reference execution | parser-backed symbol extraction, import/use/package resolution, reverse-edge derivation, bound/unresolved evidence | operator limitations, guidance, and retrieval-only labeling | retrieval hits or name-only heuristics marketed as parser-backed certainty |
| Answer/result support | `AnswerState`, evidence packets, gaps, direct query outcome | `supportState`, limitation wording, result rendering | collapse of answer-state into language-state |
| Operator-facing relation summaries | bridge `languageCapabilitySummary` for exact question class | presenter and workflow rendering | a top-line language status treated as proof of every relation family |
| Doctor/install health output | bounded language-health input from Rust capability matrix | compact install/workspace wording and next-step guidance | a full relation-matrix explainer or a hidden relation overclaim surface |

### Architecture boundary to preserve

- Rust remains authoritative for parser/indexer/query depth and capability truth evolution.
- TS remains authoritative for operator-visible reporting only.
- TS must not strengthen a claim because:
  - a local mock fixture says so
  - grammar availability exists
  - retrieval found a relevant file
  - another capability for the same language is stronger

### Product boundary to preserve

- No new languages.
- No universal parity claim.
- No compiler-grade semantic resolution.
- No retrieval-as-proof behavior.
- No automatic upgrade of `graph_call_hierarchy`, `graph_trace_flow`, or `graph_impact`.

## Interfaces And Data Contracts

### 1. Baseline reconciliation contract

- `dh_query::language_capability_for(...)` remains the only outward capability truth source.
- Before any outward upgrade lands, Fullstack must reconcile all of these to one state:
  - Rust capability matrix
  - bridge `languageCapabilityMatrix`
  - bridge `languageCapabilitySummary`
  - TS tests/mocks/fixtures
  - presenter and doctor wording
- If these disagree, the implementation must **narrow first**, then re-upgrade only after proof exists.

Current repo-reality note that drives this feature:

- Current surfaces already show a truth-drift risk around **Go definition depth**:
  - Rust capability code currently reports stronger direct definition support.
  - TS-side fixtures/mocks already contain “partial until same-package awareness is complete” expectations.
- Slice 1 must resolve that drift explicitly instead of coding past it.

### 2. Primary outward-upgrade candidates in this feature

These are the only capability pairs approved for possible outward strengthening in this feature.

| Language / pair | Handoff default | Possible outward upgrade in this feature | Required Rust-side proof before upgrade |
| --- | --- | --- | --- |
| Python `graph_relationship_dependencies` | `partial` | `supported` for explicit `import` / `from ... import ...` subset | `resolve_imports` resolves explicit subset, unresolved imports remain visible, query returns grounded direct dependencies for positive case, degraded case remains partial with gaps |
| Python `graph_relationship_dependents` | `partial` | `supported` for reverse edges derived from resolved explicit imports only | forward dependency proof first, reverse-edge tests prove no overclaim when forward resolution is missing |
| Go `graph_definition` | **hold-default `partial` until same-package proof exists** | `supported` for same-package-aware direct definition lookup in bounded subset | multi-file same-package fixture, direct definition query uses real package-aware truth, degraded ambiguous case remains partial, unsupported cross-package/non-structural case stays narrow |
| Go `graph_relationship_dependencies` | `partial` | `supported` for same-package-aware and directly imported package relationships in bounded subset | package-aware forward resolution across files, unresolved package/import cases remain visible |
| Go `graph_relationship_dependents` | `partial` | `supported` only when reverse edges come from proven same-package/import truth | forward dependency truth first, reverse-edge tests prove no unsupported inheritance from weak forward edges |
| Rust `graph_relationship_dependencies` | `partial` | `supported` for explicit `use` / module / bounded impl path subset | `resolve_imports` binds explicit `use` / module subset, unresolved macro/trait-heavy paths remain partial |
| Rust `graph_relationship_dependents` | `partial` | `supported` only when reverse edges derive from real Rust forward truth | reverse-edge evidence tied to resolved `use` / module truth, unresolved or macro-heavy paths stay degraded |

### 3. Hold-default pairs in this feature

These pairs may deepen internally, but they are **not approved for automatic outward upgrade** unless the full evidence package lands. Default behavior is to keep them narrow.

| Language / pair | Handoff default | Hold rule |
| --- | --- | --- |
| Python `graph_relationship_usage` / references | `partial` | keep `partial` unless `bind_references` proves bounded identifier/attribute target binding with positive + degraded + unsupported cases |
| Go `graph_relationship_usage` / references | `partial` | keep `partial` unless same-package and direct-import reference binding produces real target binding rather than syntax-only reads |
| Rust `graph_relationship_usage` / references | `partial` | keep `partial` unless explicit path-based and bounded impl/use binding resolves targets while macro/trait-heavy cases remain narrow |
| Go `graph_call_hierarchy` | `best-effort` | preserve current best-effort only; do not upgrade in this feature |
| Rust `graph_call_hierarchy` | `best-effort` | preserve current best-effort only; do not upgrade in this feature |
| Python `graph_call_hierarchy` | `unsupported` | remain unsupported |
| Python `graph_trace_flow` / `graph_impact` | `unsupported` | remain unsupported |
| Go `graph_trace_flow` / `graph_impact` | `unsupported` | remain unsupported |
| Rust `graph_trace_flow` / `graph_impact` | `unsupported` | remain unsupported |

### 4. Preserve-only supported pairs

These are not outward upgrade targets for this feature. They are regression-protection targets.

| Language / pair | Required preservation rule |
| --- | --- |
| TS / TSX / JS / JSX direct definition, dependencies, dependents, references | keep current strongest baseline at least as strong as today; do not narrow without new evidence |
| Python direct definition for explicit named symbols | preserve only for bounded direct symbol lookup; do not broaden to dynamic or star-import semantics |
| Rust direct definition for explicit bounded symbols | preserve only for explicit structural subset; do not imply macro/trait/re-export parity |

### 5. Evidence package required before any outward state change

For every pair that may move outward, implementation must land all of the following before changing the Rust matrix state:

1. **Parser/adapter proof**
   - at least one positive supported-subset fixture
   - at least one degraded/unresolved fixture
   - at least one out-of-scope/unsupported fixture
2. **Binding proof tied to the correct adapter contract**
   - `resolve_imports` for dependency truth
   - `bind_references` for reference truth
   - `bind_call_edges` only when needed to keep call-edge provenance honest after import/reference changes
3. **Query proof**
   - grounded positive case when the pair claims `supported`
   - partial/insufficient case with explicit gaps when the edge is unresolved
   - no reverse-edge claim stronger than its forward-edge proof
4. **Bridge proof**
   - `languageCapabilitySummary` matches the upgraded pair
   - unsupported classes still short-circuit correctly
5. **TS/report proof**
   - `supportState` remains answer-state only
   - `languageCapabilitySummary` reflects Rust truth only
   - retrieval-only outputs remain retrieval-only

### 6. Operator-reporting contract for this feature

- `supportState` stays answer/result state only: `grounded | partial | insufficient | unsupported`
- `languageCapabilitySummary` stays language/pair state only: `supported | partial | best-effort | unsupported`
- `doctor` stays a product/install/workspace surface, not a relation-query surface.
- If `doctor` continues deriving top-line language support from broad capabilities like `definition_lookup` / `structural_indexing`, its wording must not imply that all relation families are equally strong for that language.

## Risks And Trade-offs

- **Baseline truth drift risk**
  - Current matrix, bridge behavior, and TS fixtures are not guaranteed to agree for every pair.
  - Mitigation: baseline and narrow first.

- **Definition overclaim risk**
  - Name-based definition lookup can look stronger than real package/module-aware resolution.
  - Mitigation: require bounded context-aware proof before any stronger outward claim, especially for Go.

- **Reverse-edge overclaim risk**
  - `dependents` can easily outrun `dependencies` if reverse edges are inferred from weak or unresolved forward truth.
  - Mitigation: reverse edges upgrade only after forward truth is real.

- **Reference-scope explosion risk**
  - `bind_references` can quickly turn into a compiler project.
  - Mitigation: keep reference hardening on explicit identifier/attribute/selector/path subsets only.

- **Doctor overcompression risk**
  - a single per-language status can accidentally read like full relation parity.
  - Mitigation: keep doctor compact and clearly secondary to per-query capability summaries.

- **TS/JS regression risk**
  - shared query or adapter changes can weaken the strongest current path.
  - Mitigation: TS/JS regression protection is a hard gate for every slice.

- **Stale-fact trust risk**
  - deeper binding logic can fail in ways that leave stale facts looking current.
  - Mitigation: preserve failed-file rewrite and degraded-state surfacing; do not bypass existing atomic rewrite behavior.

## Dependencies

- Approved upstream scope package:
  - `docs/scope/2026-04-18-language-depth-hardening.md`
- Prior solution contract to preserve:
  - `docs/solution/2026-04-18-multi-language-support.md`
- Adapter and binding behavior reference:
  - `docs/migration/deep-dive-01-indexer-parser.md`
- TS reporting boundary reference:
  - `docs/solution/2026-04-17-ts-brain-layer-completion.md`
- Real repo-native validation commands available now:
  - from repo root: `npm run check`
  - from repo root: `npm test`
  - from `rust-engine/`: `cargo test --workspace`
- No repo-native lint command exists; do not invent one.
- No new operator environment variables are required for the recommended path.
- Preferred implementation discipline for this full-delivery feature: add failing Rust/TS tests for each pair before upgrading its outward state.

## Recommended Path

- **Step 1: reconcile current truth before hardening depth.**
  - Freeze the current pair matrix, identify drift, and narrow any unsupported claim first.
- **Step 2: harden forward relation truth in Rust.**
  - Implement bounded `resolve_imports` / same-package / module-aware resolution first.
- **Step 3: derive definition and reverse-edge behavior from that truth.**
  - Direct definition and dependents must ride on real forward proof, not on optimistic name search.
- **Step 4: harden references only for the explicit structural subset.**
  - Use `bind_references` for direct, bounded cases only; otherwise keep `partial`.
- **Step 5: align TS operator surfaces after Rust truth is settled.**
  - Update presenters, knowledge-command output, fixtures, and doctor wording to match Rust exactly.

This is the simplest adequate path because it keeps one truth source, upgrades only a few exact pairs, and uses narrowing as the honest fallback instead of broad feature creep.

## Implementation Flow

1. **Write failing proof tests for each candidate pair before changing outward state.**
2. **Reconcile the current capability matrix and narrow any unsupported pair claims.**
3. **Implement forward resolution in adapters (`resolve_imports`) for the bounded subsets.**
4. **Harden definition/dependency/dependent behavior in query + bridge from that forward truth.**
5. **Implement bounded reference binding (`bind_references`) only where exact proof exists.**
6. **Update TS reporting, fixtures, and doctor wording to match the final Rust truth.**
7. **Run one cross-language integration checkpoint before handoff.**

## Implementation Slices

### Slice 1: Baseline reconciliation and truth freeze

- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
- **Goal:** make the current outward pair story match the real baseline before any hardening upgrade begins.
- **Validation Command:** `cargo test --workspace && npm run check && npm test`
- **Details:**
  - add or update failing tests that expose current pair-level drift
  - explicitly reconcile Go definition truth; default to `partial` until same-package proof exists
  - preserve TS/JS current baseline as the regression anchor
  - reviewer focus: this slice may narrow claims; narrowing is correct if proof is missing

### Slice 2: Harden forward resolution and unresolved-edge truth

- **Files:**
  - `rust-engine/crates/dh-parser/src/lib.rs`
  - `rust-engine/crates/dh-parser/src/adapters/common.rs`
  - `rust-engine/crates/dh-parser/src/adapters/python.rs`
  - `rust-engine/crates/dh-parser/src/adapters/go.rs`
  - `rust-engine/crates/dh-parser/src/adapters/rust.rs`
  - `rust-engine/crates/dh-parser/tests/multi_language_adapters.rs`
- **Goal:** make direct forward relation truth real for the bounded subset by hardening `resolve_imports` and related same-package/module-aware context.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - Python: explicit `import` / `from ... import ...` subset only
  - Go: same-package-aware symbol/package context across files before stronger definition/dependency claims
  - Rust: explicit `use` / module / bounded impl-path subset only
  - unresolved edges must stay explicit; silent omission is not acceptable
  - reviewer focus: no dynamic-import, reflection, macro-expansion, or trait-dispatch parity claims

### Slice 3: Tie definition, dependencies, and dependents to proven forward truth

- **Files:**
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
  - `rust-engine/crates/dh-parser/tests/multi_language_adapters.rs`
- **Goal:** make `graph_definition`, `graph_relationship_dependencies`, and `graph_relationship_dependents` reflect real direct relation proof rather than optimistic symbol-name behavior.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - definition upgrades require bounded context-aware proof for the language pair
  - dependents must not upgrade ahead of dependencies
  - bridge summaries must match the exact pair state and remain honest for unsupported classes
  - reviewer focus: reverse-edge truth may only be as strong as forward-edge truth

### Slice 4: Bounded reference hardening with hold-default partial behavior

- **Files:**
  - `rust-engine/crates/dh-parser/src/adapters/python.rs`
  - `rust-engine/crates/dh-parser/src/adapters/go.rs`
  - `rust-engine/crates/dh-parser/src/adapters/rust.rs`
  - `rust-engine/crates/dh-query/src/lib.rs`
  - `rust-engine/crates/dh-engine/src/bridge.rs`
- **Goal:** improve reference binding depth for explicit structural cases without upgrading outwardly unless full evidence exists.
- **Validation Command:** `cargo test --workspace`
- **Details:**
  - `bind_references` is the main hardening lever for this slice
  - `bind_call_edges` may be touched only to preserve honest call-edge provenance after import/reference changes
  - if reference targets remain unresolved in common supported-subset cases, keep the outward pair at `partial`
  - reviewer focus: do not let reference improvements silently upgrade call hierarchy or other adjacent surfaces

### Slice 5: Align TS reporting, presenter wording, and doctor boundaries to final Rust truth

- **Files:**
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.ts`
  - `packages/opencode-app/src/bridge/dh-jsonrpc-stdio-client.test.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.ts`
  - `packages/opencode-app/src/workflows/run-knowledge-command.test.ts`
  - `apps/cli/src/presenters/knowledge-command.ts`
  - `apps/cli/src/presenters/knowledge-command.test.ts`
  - `packages/runtime/src/diagnostics/doctor.ts`
  - `packages/runtime/src/diagnostics/doctor.test.ts`
- **Goal:** keep all operator-visible support-state reporting in lock-step with Rust truth while preserving answer-state separation.
- **Validation Command:** `npm run check && npm test`
- **Details:**
  - TS fixtures/mocks must stop carrying stronger or weaker pair stories than Rust
  - `supportState` remains answer-state only
  - `languageCapabilitySummary` remains capability-state only
  - `doctor` must not imply that a top-line per-language summary proves every relation family
  - reviewer focus: no TS-derived upgrade, no retrieval-as-proof wording, no answer-state collapse into capability-state

## Dependency Graph

- Critical path:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- Why sequential:
  - Slice 1 defines the truthful baseline and may narrow claims.
  - Slice 2 creates the forward resolution truth every later slice depends on.
  - Slice 3 cannot honestly upgrade definition/dependency/dependent behavior before Slice 2 lands.
  - Slice 4 depends on the same import/module/package truth from Slices 2-3.
  - Slice 5 must consume the final Rust truth, not intermediate assumptions.

## Parallelization Assessment

- parallel_mode: `none`
- why: this feature depends on one shared Rust capability matrix, one shared adapter contract, one shared bridge summary path, and one shared TS reporting contract. Partial overlap would create a high risk of contradictory support claims.
- safe_parallel_zones: []
- sequential_constraints:
  - `SLICE-1 -> SLICE-2 -> SLICE-3 -> SLICE-4 -> SLICE-5`
- integration_checkpoint: verify one coherent pair-level story across Rust capability truth, parser/query evidence, bridge summaries, knowledge-command output, presenter text, and doctor wording.
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
| pair-level baseline is reconciled before upgrades | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm run check && npm test`; targeted bridge/workflow/presenter fixtures must agree with Rust matrix |
| Python direct dependencies/dependents upgrade only if explicit import subset is truly resolved | from `rust-engine/`: `cargo test --workspace`; parser fixtures must include positive, degraded, and unsupported Python import cases |
| Go definition/dependencies/dependents do not overclaim before same-package awareness is real | from `rust-engine/`: `cargo test --workspace`; multi-file same-package fixtures and degraded ambiguous cases required |
| Rust dependencies/dependents upgrade only for explicit `use` / module subset | from `rust-engine/`: `cargo test --workspace`; macro-heavy / trait-heavy cases must stay degraded or unsupported |
| references remain partial unless bounded binding proof is real | from `rust-engine/`: `cargo test --workspace`; unresolved references must surface partial evidence and gaps |
| unsupported/best-effort adjacent surfaces stay narrow | from `rust-engine/`: `cargo test --workspace`; bridge relation handlers must still short-circuit unsupported classes correctly |
| answer-state and language/capability state remain separate | from repo root: `npm run check && npm test`; `run-knowledge-command` and presenter tests must show both separately |
| retrieval-only results do not imply parser-backed support | from repo root: `npm run check && npm test`; retrieval fallback tests and presenter wording must remain explicit |
| doctor wording stays bounded and does not market full relation parity | from repo root: `npm run check && npm test`; doctor tests must confirm top-line language summary remains bounded |
| TS/JS strongest baseline is preserved | from `rust-engine/`: `cargo test --workspace`; from repo root: `npm test`; no regression in existing TS/JS relation behavior |

Validation reality notes:

- Use real commands only: `cargo test --workspace`, `npm run check`, `npm test`.
- No repo-native lint command exists.
- For any pair that is upgraded outwardly, failing tests should exist first and pass only after the upgrade work lands.

## Integration Checkpoint

Before handoff to `Fullstack Agent` is considered complete, the implemented path should satisfy all of the following in one combined review pass:

- the Rust capability matrix, bridge summaries, TS fixtures, and presenters all tell the same story for every touched pair
- Go definition no longer drifts across surfaces; if same-package proof is missing, it stays `partial` everywhere
- Python, Go, and Rust dependencies only look `supported` where forward resolution is real
- dependents never look stronger than their forward dependency proof
- references remain `partial` unless direct target binding is genuinely proven
- Go/Rust call hierarchy does not inherit stronger claims from improved import/reference binding
- Python call hierarchy and all trace/impact out-of-scope surfaces remain narrow
- mixed-language queries keep stronger TS/JS results visible while still surfacing the weakest relevant capability truth for the weaker language
- retrieval-only hits remain retrieval-only
- degraded or fatal parse/binding conditions do not leave stale facts looking current

## Rollback Notes

- If baseline evidence does not support an existing claim, **narrow the claim first** instead of forcing the implementation to match the earlier story in one jump.
- If Go same-package awareness does not land cleanly, keep Go definition/dependencies/dependents at `partial`.
- If Python or Rust forward resolution remains unresolved in common supported-subset cases, keep dependencies/dependents at `partial`.
- If `bind_references` remains mostly unresolved, keep references at `partial` and make degraded reasons clearer instead of shipping a misleading upgrade.
- If doctor cannot express the bounded story cleanly, keep it as a top-level language-health surface and avoid turning it into a relation capability dashboard.
- If TS/JS baseline regresses, stop the hardening rollout and restore the TS/JS path before shipping any broader language claim.

## Reviewer Focus Points

- Preserve the architecture split:
  - Rust = relation depth truth and capability evolution
  - TypeScript = reporting only
- Reject any implementation that upgrades a pair because TS wording changed while Rust proof did not.
- Reject any implementation where `dependents` become stronger than `dependencies`.
- Reject any implementation that markets Go same-package definition support before same-package proof exists.
- Reject any reference upgrade that does not show real bounded target binding.
- Verify unsupported and best-effort adjacent surfaces stay narrow.
- Verify retrieval-only and parser-backed outputs remain explicitly distinct.
- Verify doctor/top-line summaries do not become a hidden overclaim surface for relation parity.

### Preservation notes by downstream role

- **Fullstack Agent must preserve:**
  - baseline reconciliation before upgrade
  - one Rust-authored pair matrix
  - TS/JS strongest baseline
  - no call hierarchy/trace/impact scope creep
- **Code Reviewer must preserve:**
  - no second TS-owned truth source
  - no reverse-edge overclaim
  - no supported reference claims without binding evidence
  - no doctor/presenter wording that hides degraded or retrieval-only state
- **QA Agent must preserve:**
  - positive, degraded, and unsupported coverage for every upgraded pair
  - mixed-language scenario coverage
  - explicit verification that stale facts are not left current after degraded/fatal runs
