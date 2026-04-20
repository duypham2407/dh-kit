---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: LANGUAGE-DEPTH-HARDENING
feature_slug: language-depth-hardening
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Language Depth Hardening

Deepen truthful per-language relation depth for already in-scope languages after `MULTI-LANGUAGE-SUPPORT` by hardening parser-backed definition, dependency, dependent, and reference behavior where current quality is still partial, best-effort, or evidence-gated. This feature must improve real Rust-owned resolution and binding depth plus TypeScript-owned operator honesty for degraded and unresolved outcomes, while keeping the language list, architecture split, and parity limits unchanged.

## Goal

- Improve trustworthy depth for already in-scope relation capabilities without adding languages or claiming universal parity.
- Let operators trust that direct definition, dependency, dependent, and reference results are either parser-backed and evidence-backed or visibly degraded, unresolved, or unsupported.

## Target Users

- Operators using OpenKit/DH on mixed-language repositories who need to know whether a relation result is truly parser-backed for the relevant language.
- Maintainers, reviewers, and QA who need one explicit contract for when a capability may be upgraded outwardly versus when it must remain partial or best-effort.
- Solution Lead and Fullstack implementers who need a bounded product target for depth hardening without reopening language expansion, topology, or parity scope.

## Problem Statement

- `MULTI-LANGUAGE-SUPPORT` established the bounded language list, the Rust-truth / TS-reporting ownership split, and an honest capability vocabulary, but it intentionally left residual depth limits and downgrade guards around relation-quality behavior.
- The remaining gap is not “support more languages.” The gap is that direct relation surfaces can still be narrower than operators expect, especially where adapter import resolution, reverse-edge construction, same-package/module awareness, and reference binding are incomplete or only partially trustworthy.
- Without a dedicated hardening scope, the product risks two failure modes:
  - overclaiming relation support because a top-line language entry looks stronger than the underlying binding evidence
  - under-explaining degraded or unresolved outcomes, leaving operators unable to tell whether a result is parser-backed, partially bound, retrieval-only, or unsupported
- This feature needs one explicit contract for which residual capability areas are candidates for hardening, what proof is required before any outward upgrade, and when a capability must stay partial or best-effort even after this work.

## In Scope

- Preserve the current architecture boundary:
  - Rust owns parser, indexer, query, adapter, resolution, binding, and capability-depth truth.
  - TypeScript owns operator-visible support-state wording, degraded-state reporting, and answer-state separation.
- Preserve the currently in-scope language set only:
  - TS / TSX / JS / JSX baseline
  - Python
  - Go
  - Rust
- Preserve TS/JS as the strongest current path and do not weaken it while hardening other languages.
- Focus this feature on already approved relation families and their truthful outward reporting:
  - `graph_definition`
  - `graph_relationship_dependencies`
  - `graph_relationship_dependents`
  - `graph_relationship_usage` / reference behavior
- Improve or clarify the bounded Rust adapter/query depth that drives those capabilities, including the resolution and binding expectations already described by the `LanguageAdapter` contract (`resolve_imports`, `bind_references`, and dependent parser/indexer/query truth).
- Define explicit upgrade rules for when a capability may move outwardly from `partial` or `best-effort` to a stronger state.
- Define explicit hold rules for when a capability must remain `partial`, `best-effort`, or `unsupported` even if adjacent cases improve.
- Require operator-visible degraded-state honesty during and after upgrades, including mixed-language, unresolved-edge, and retrieval-only cases.

### Candidate hardening areas in this feature

- **Python**
  - direct definition lookup for explicit module/class/function symbols in the supported subset
  - direct dependency and dependent behavior for explicit imports and resolved module relationships
  - direct reference binding for identifier and attribute references in the supported subset
- **Go**
  - same-package-aware definition, dependency, and dependent behavior across files in the same package
  - direct reference binding for package-local and directly imported symbols in the supported subset
- **Rust**
  - explicit `use` / module / impl-driven definition, dependency, and dependent behavior in the supported subset
  - direct reference binding for explicit path-based and structurally resolvable references in the supported subset
- **TS operator surfaces for all in-scope languages**
  - truthful outward reporting of which of the above are parser-backed, partial, best-effort, unresolved, or retrieval-only
  - honest separation between language/capability state and answer/result support state

## Out of Scope

- Adding languages beyond the already approved TS/JS, Python, Go, and Rust set.
- Promising universal or equal parity across TS/JS, Python, Go, and Rust.
- Reclassifying a capability as stronger on operator surfaces before implementation evidence is real.
- Compiler-grade semantic resolution for:
  - Python star imports, `__import__`, monkey patching, runtime metaprogramming, or other dynamic/runtime-generated cases
  - Go reflection, generated code, or broad cross-package semantic certainty beyond the supported subset
  - Rust macro-heavy, trait-heavy, or compiler-only semantic cases outside bounded structural truth
  - TS/JS compiler-grade type-checker parity beyond the current truthful baseline
- Treating retrieval, semantic search, or file discovery as proof of parser-backed definition, dependency, dependent, or reference support.
- Broadening into:
  - daemon/service mode
  - host-topology inversion
  - distributed orchestration
  - open-ended agent behavior
- Making `graph_call_hierarchy`, `graph_trace_flow`, or `graph_impact` primary upgrade targets for this feature.

## Main Flows

- **Flow 1 — Operator asks a direct relation question in a bounded supported subset**
  - Operator targets a Python, Go, or Rust file that stays inside the already approved language subset.
  - DH returns parser-backed definition, dependency, dependent, or reference behavior only where Rust-owned resolution/binding truth exists.
  - Operator sees the language/capability state that matches the real depth of that result.

- **Flow 2 — Capability is improved only after proof exists**
  - Maintainer strengthens adapter resolution or query depth for a specific language/capability pair.
  - DH upgrades outward wording only after the strengthened behavior is backed by inspectable evidence.
  - If proof is incomplete, the outward state does not move.

- **Flow 3 — Mixed strong and weak cases remain honest**
  - Operator asks for relation behavior across files that combine supported, partial, and unresolved cases.
  - DH may return useful direct results for the resolvable portion.
  - The unresolved or weaker portion remains labeled `partial`, `best-effort`, or retrieval-only instead of being silently promoted.

- **Flow 4 — Unsupported or out-of-reach constructs stay narrow**
  - Operator queries dynamic, macro-heavy, trait-heavy, reflection-heavy, star-import-heavy, or runtime-generated cases.
  - DH does not fabricate full semantic confidence.
  - The operator sees explicit degraded or unsupported language/capability behavior.

- **Flow 5 — Retrieval-only results stay retrieval-only**
  - A file or concept search finds relevant files even when parser-backed relation depth is absent or unresolved.
  - DH may still surface the retrieval result.
  - The product wording makes clear that retrieval did not upgrade parser-backed language support.

## Business Rules

### Ownership and truth-source rules

- Rust remains the only source of truth for language-capability depth, adapter routing, parse/index status, import resolution, reverse-edge construction, and reference binding quality.
- TypeScript may summarize or present Rust truth, but it must not derive a stronger language-capability story from local grammar availability, retrieval hits, or optimistic heuristics.
- Language/capability state and answer/result support state are separate and must remain separate:
  - language/capability state: `supported`, `partial`, `best-effort`, `unsupported`
  - answer/result support state: `grounded`, `partial`, `insufficient`, `unsupported`

### Candidate hardening matrix

| Capability family | Candidate hardening boundary in this feature | Eligible languages | Capability must remain partial / best-effort when... |
| --- | --- | --- | --- |
| `graph_definition` | direct symbol-to-definition behavior for explicit, parser-resolvable symbols in the already approved supported subset | Python, Go, Rust | resolution depends on dynamic imports, star imports, reflection, macro expansion, trait-dispatch-only semantics, generated code, unresolved re-exports, or other non-structural/runtime-only behavior |
| `graph_relationship_dependencies` | direct forward relation edges backed by resolved imports or structurally explicit module/use/package relationships | Python, Go, Rust | the dependency edge cannot be bound by parser-backed import/use resolution, or only retrieval/text inference is available |
| `graph_relationship_dependents` | direct reverse relation edges derived from real resolved dependency truth | Python, Go, Rust | forward dependency truth is unresolved, incomplete, or narrowed to best-effort, so reverse edges would overclaim certainty |
| `graph_relationship_usage` / references | direct reference binding for structurally explicit identifier, attribute, selector, or path-based references in the bounded supported subset | Python, Go, Rust | the reference depends on runtime behavior, ambiguous aliasing, interface/trait inference beyond bounded truth, macro expansion, generated code, or an unresolved target |

### Evidence required before any outward capability upgrade

A language/capability pair may upgrade outwardly only when all of the following are true:

- The improved behavior is produced by Rust-owned parser/indexer/query logic, not by TS wording changes alone.
- The relevant adapter or query layer can show explicit resolution/binding behavior for that capability, including the `LanguageAdapter`-style responsibilities that apply to it.
- Inspectable validation exists for all of the following for that language/capability pair:
  - at least one positive supported-subset case
  - at least one degraded or unresolved case
  - at least one out-of-scope or unsupported case that remains narrow
- Query output or operator inspection can distinguish parser-backed results from retrieval-only results.
- Unresolved edges are surfaced as unresolved or degraded rather than silently omitted or marked as resolved.
- Fatal parse, adapter, or binding failures do not leave stale facts presented as current truth.
- TS operator-visible wording is updated to reflect the same state Rust exposes.

### Hold rules: when capability must stay partial or best-effort

- A capability must stay `partial` when it works for a bounded explicit subset but known common cases inside the language family still fail or degrade in ways the product must disclose.
- A capability must stay `best-effort` when DH can often return useful results but completeness, stable binding, or false-positive avoidance is not yet good enough for a `supported` claim.
- A capability must not inherit a stronger state from adjacent capabilities. For example:
  - strong definition lookup does not automatically make references supported
  - strong dependency edges do not automatically make dependents supported if reverse construction is incomplete
  - strong direct relation behavior does not automatically upgrade call hierarchy, trace flow, or impact
- If evidence is mixed, the outward state must follow the weakest truthful state for that capability/language pair.
- If a stronger state exists only in narrow tests but not yet across the approved supported subset, the capability stays partial or best-effort.

### Operator-visible wording and degraded-state honesty rules

- Operator-visible language/capability wording must use only the approved vocabulary: `supported`, `partial`, `best-effort`, `unsupported`.
- Operator-visible answer/result wording must continue using only: `grounded`, `partial`, `insufficient`, `unsupported`.
- When a capability is degraded or unresolved, operator-facing output must explain:
  - what surface this is
  - the current condition
  - why that condition applies
  - what still works versus what is limited
  - the next recommended action when one exists
- Retrieval hits, file discovery, or semantic search must be labeled as retrieval-only when parser-backed relation support is absent.
- Unsupported or unresolved outcomes must stay visible even if the overall answer remains useful.

### Unsupported and unresolved behavior rules

- Unresolved relation edges must never be surfaced as resolved edges.
- Missing parser-backed evidence must never be replaced by model inference or optimistic wording.
- Recoverable parse problems may still yield partial relation behavior when that is safe, but the file/capability state must reflect the degradation.
- Fatal parser, adapter, or binding failures must prevent stale relation facts from looking current.
- Unsupported languages remain unsupported for parser-backed relation capabilities even if other repo-level retrieval surfaces can still mention them.

## Acceptance Criteria Matrix

- **AC1** — **Given** TS/TSX/JS/JSX direct definition, dependency, dependent, and reference behavior that is already within the current truthful baseline, **when** this feature is implemented, **then** those baseline behaviors remain at least as strong and no operator surface relabels them more narrowly without new evidence.
- **AC2** — **Given** a Python, Go, or Rust language/capability pair targeted for upgrade, **when** Solution Lead or downstream reviewers inspect the shipped evidence, **then** the capability is upgraded outwardly only if Rust-owned implementation evidence exists for positive, degraded, and unsupported cases for that exact pair.
- **AC3** — **Given** a Python file using only the already approved supported subset, **when** the operator queries direct definition, dependency, dependent, or reference behavior that the shipped implementation can truly bind, **then** the result is surfaced as parser-backed and the language/capability state reflects the real bound depth.
- **AC4** — **Given** a Go file whose relation behavior depends on same-package awareness, **when** that same-package binding is not real for the queried case, **then** definition, dependency, dependent, or reference behavior does not upgrade outwardly to `supported` for that case and remains partial or best-effort with an explicit reason.
- **AC5** — **Given** a Rust file whose relation behavior crosses macro-heavy, trait-heavy, or otherwise out-of-reach cases, **when** the operator queries definition, dependency, dependent, or reference behavior, **then** the product does not imply compiler-grade certainty and keeps the affected capability at the weaker truthful state.
- **AC6** — **Given** a relation result that mixes resolvable and unresolved edges, **when** the operator inspects the outcome, **then** the unresolved portion remains explicitly unresolved or degraded and is not silently promoted by the stronger portion.
- **AC7** — **Given** a retrieval hit or file discovery result for a language/case where parser-backed relation depth is absent, **when** that result is shown to the operator, **then** the output labels it retrieval-only or otherwise non-proof and does not use it to claim parser-backed support.
- **AC8** — **Given** an outward capability upgrade for definition, dependencies, dependents, or references, **when** the same language/capability pair is surfaced in TypeScript presenters, doctor/support summaries, or knowledge-command reporting, **then** those surfaces match Rust truth and keep language/capability state separate from answer/result support state.
- **AC9** — **Given** a recoverable parse or binding problem, **when** indexing or querying completes, **then** DH may preserve partial results but must surface the relevant language/file/capability as degraded rather than fully supported for that run.
- **AC10** — **Given** a fatal parser, adapter, or binding failure, **when** indexing completes, **then** stale relation facts are not presented as current truth and the affected file/capability is surfaced as failed, degraded, or unsupported.
- **AC11** — **Given** `graph_call_hierarchy`, `graph_trace_flow`, or `graph_impact` behavior that remains outside this feature’s primary hardening scope, **when** adjacent implementation touches those surfaces, **then** they do not receive stronger outward claims unless separately evidenced and explicitly approved.
- **AC12** — **Given** the completed scope package, **when** Solution Lead begins design, **then** they can identify the candidate hardening surfaces, evidence thresholds, hold rules, and honesty requirements without inventing new product behavior.

## Edge Cases

- A mixed-language request touches a strong TS/JS path plus a weaker Python, Go, or Rust path, and the overall answer must surface the weakest relevant capability without erasing the stronger one.
- A Go package spreads definitions across multiple files in the same package, so file-local truth would understate or misstate the real bounded support.
- A Rust file mixes structurally resolvable `use` paths with macro-expanded or trait-dispatched behavior that should not inherit the stronger direct edge state.
- A Python file is mostly in the supported subset but also includes star imports, `__import__`, or monkey-patched symbols that make some edges unresolved.
- A reverse-dependent result would appear correct only if the forward dependency edge was bound correctly first.
- A rename, deletion, or fatal parse failure would otherwise leave old definition or relation facts in storage unless stale-fact cleanup stays correct.
- Retrieval surfaces find relevant files from unsupported languages or unsupported constructs near otherwise supported relation results.

## Error And Failure Cases

- The feature fails if it upgrades a language/capability outwardly because wording changed while underlying Rust resolution/binding evidence did not.
- The feature fails if unresolved or retrieval-only relation behavior is displayed as parser-backed support.
- The feature fails if direct dependency truth is weak but dependents are still marketed as supported.
- The feature fails if references are shown as strongly bound when the target symbol is actually unresolved or inferred only heuristically.
- The feature fails if operator-visible wording collapses language/capability state into answer/result support state.
- The feature fails if partial or best-effort results are surfaced without explaining the limitation.
- The feature fails if fatal parser, adapter, or binding failures leave stale facts visible as current truth.
- The feature fails if implementation broadens into new languages, daemon/service mode, topology inversion, distributed orchestration, or open-ended agent behavior in order to satisfy this scope.

## Open Questions

- None blocking at Product Lead handoff.
- Solution Lead must establish the real post-`MULTI-LANGUAGE-SUPPORT` evidence baseline for each targeted language/capability pair before proposing any outward upgrade. If current implementation evidence is weaker than the existing product story, the solution must preserve or narrow the outward state rather than assume upgrade readiness.

## Success Signal

- Operators can inspect direct relation behavior for already in-scope languages and understand whether each result is parser-backed, partial, best-effort, unresolved, retrieval-only, or unsupported.
- Python, Go, and Rust relation depth improves where real evidence exists, while unchanged weak areas stay explicitly partial or best-effort.
- TS/JS remains the strongest current path and is not weakened by the hardening work.
- Reviewers and QA can verify capability upgrades against explicit evidence thresholds instead of subjective claims.
- Solution Lead can design from one bounded hardening contract without rediscovering feature limits from multiple earlier documents.

## Handoff Notes For Solution Lead

- Preserve the architecture split already approved in `docs/solution/2026-04-18-multi-language-support.md` and `docs/solution/2026-04-17-ts-brain-layer-completion.md`:
  - Rust owns relation-depth truth.
  - TypeScript owns operator-visible wording and support-state presentation.
- Use `docs/migration/deep-dive-01-indexer-parser.md` as the behavioral reference for adapter responsibilities, especially the resolution and binding expectations that underpin definition, dependency, dependent, and reference truth.
- Start by baselining which targeted language/capability pairs are truly partial, best-effort, or already strong in the current repo reality. Do not assume the top-line matrix alone is sufficient proof.
- Focus on the smallest set of outward upgrades that can be honestly evidenced. This feature passes if it improves truthful depth for bounded cases and keeps the rest narrow; it does not require broad parity.
- Preserve these hard stops unless new explicit scope approval changes them:
  - no new languages
  - no topology/daemon/distributed expansion
  - no compiler-grade semantic promises
  - no retrieval-as-proof behavior
  - no automatic upgrade of call hierarchy, trace flow, or impact
- Ensure the solution package includes explicit upgrade criteria, explicit hold rules, and explicit degraded-state wording for every targeted capability/language pair.
