---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: MULTI-LANGUAGE-SUPPORT
feature_slug: multi-language-support
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Multi Language Support

## Goal

- Extend DH from its current truthful TypeScript/JavaScript-centric code-intelligence baseline to a bounded multi-language product contract that covers language adapters, parser/indexer behavior, query behavior, and operator-visible honesty per language and capability without implying universal parity, compiler-grade semantics, or broader architecture changes.

## Target Users

- Operators using DH on mixed-language repositories who need to know which languages and query classes are truly supported, partially supported, best-effort only, or unsupported.
- Maintainers, reviewers, QA, and downstream planners who need one canonical scope package for language coverage instead of rediscovering support boundaries from migration notes, parser design docs, and operator wording scattered across the repo.

## Problem Statement

- Current repo reality is strongest and most truthful around the Rust foundation plus TypeScript operator/reporting split, with the clearest live language coverage centered on the existing TS/JS parser path and explicit warnings not to overclaim broad multi-language support.
- The architecture and parser design docs already define a language priority order and an explicit `LanguageAdapter` concept, but the product behavior for multi-language coverage is not yet a single bounded contract that says what each language can and cannot do across parsing, indexing, querying, and operator reporting.
- Without that contract, implementation risk is high in three ways: the product can overclaim universal support, different layers can surface contradictory support states, and unsupported or partially supported languages can look more complete than the underlying evidence justifies.

## In Scope

- Preserve the current ownership boundary: Rust remains the foundation for parser, indexer, storage, structural query/search evidence, and language-fact truth; TypeScript remains the operator-facing orchestration, reasoning/reporting, and support-state wording layer.
- Preserve the current truthful runtime/topology boundary from adjacent approved work: TypeScript remains the practical host/orchestrator on the current path, and this feature does not require Rust-host inversion, daemon mode, or service-mode expansion.
- Preserve the current supported TS/TSX/JS/JSX baseline instead of weakening or relabeling it during multi-language expansion.
- Add one bounded multi-language contract for the priority language order already established in repository context:
  1. TypeScript / TSX / JavaScript / JSX baseline preservation
  2. Python
  3. Go
  4. Rust
- Define one explicit per-language capability model covering, at minimum:
  - file detection / routing into the correct adapter path
  - parse + diagnostics behavior
  - normalized structural extraction behavior
  - indexing eligibility and stale-fact handling
  - query/search behavior boundaries
  - operator-visible support-state wording
- Require explicit language-adapter-backed behavior for every in-scope code-intelligence language rather than hidden per-language special cases.
- Define how unsupported languages, partially implemented adapters, recoverable parse problems, and fatal adapter/grammar failures surface to operators.
- Define which query/search behaviors count as supported, partial, best-effort, or unsupported by language for this release.

## Out of Scope

- Universal or equal feature parity across all languages.
- Compiler-grade semantic resolution, type-checker-level binding, macro expansion, or runtime-execution understanding for every language.
- Broadening the language list beyond the priority set above; Java, C#, Ruby, PHP, and other later-priority languages remain outside this feature.
- Guaranteeing every existing query/search class for every language.
- Rewriting the current Rust/TypeScript ownership split, inverting the host/process topology, or expanding into daemon/service mode, distributed orchestration, or remote execution.
- Broad agent-behavior redesign, open-ended autonomy, or hidden side effects.
- Presenting repository-level document retrieval as proof that an unsupported language has parser-backed code-intelligence support.
- Any claim that this feature alone completes all future language expansion work.

## Main Flows

- **Flow 1 — Operator inspects multi-language support before trusting results**
  - Operator works in a repository containing multiple language families.
  - DH surfaces support per language and capability instead of one blanket “multi-language supported” claim.
  - Operator can tell what is supported, partial, best-effort, or unsupported before over-trusting a query result.

- **Flow 2 — Supported baseline language keeps current strong behavior**
  - Operator indexes or queries TS/TSX/JS/JSX files.
  - DH preserves the current baseline parser/indexer/query behavior for those files.
  - Output remains bounded and truthful, especially for best-effort relations such as unresolved calls or non-compiler-grade binding.

- **Flow 3 — New in-scope language gets bounded structural support**
  - Operator indexes Python, Go, or Rust files using constructs inside the release boundary.
  - DH routes the file to the language adapter, parses it, extracts normalized structural facts, indexes them, and allows only the query/search classes promised for that language.
  - Results remain useful without implying TS/JS parity.

- **Flow 4 — Partial or best-effort capability is surfaced honestly**
  - Operator asks for a capability that exists only partially or best-effort for a language, such as deeper reference/call/flow behavior.
  - DH may return limited evidence when it truly has some, but it must label the capability and the answer as degraded rather than pretending the language is fully supported for that class.

- **Flow 5 — Unsupported language is handled explicitly**
  - Operator includes files from an unsupported language.
  - DH may still inventory or retrieve those files as repository documents where existing search surfaces allow, but it does not present parser-backed definition/reference/dependency intelligence for that language.
  - The operator sees an explicit unsupported language/capability outcome.

- **Flow 6 — Parse or adapter failure does not create false confidence**
  - Operator indexes an in-scope language file with recoverable syntax damage or a fatal adapter/grammar problem.
  - Recoverable cases may yield partial facts plus diagnostics.
  - Fatal cases do not leave stale facts looking current, and the surfaced state explains the degradation.

## Business Rules

- Multi-language support in this feature is adapter-backed and bounded. The product may not claim language support unless that language has an explicit adapter contract and an explicit operator-visible support state.
- Capability-state and answer-state are separate concepts and must not be collapsed:
  - **language/capability state** for this feature: `supported`, `partial`, `best-effort`, `unsupported`
  - **answer/result support state** already used on operator reasoning surfaces: `grounded`, `partial`, `insufficient`, `unsupported`
- Repository-level retrieval of a file from any language does not, by itself, make that language parser/indexer/query supported.

### Support-State Definitions

| State | Meaning for this feature |
| --- | --- |
| `supported` | Explicitly guaranteed for the language/capability in this release. Operators may rely on it as a first-class bounded capability. |
| `partial` | Available for the language, but narrower than the supported baseline. Known construct or depth limits are expected and must be surfaced. |
| `best-effort` | DH may return useful results when evidence exists, but completeness or stable resolution is not guaranteed. The product must say so explicitly and must not market it as parity support. |
| `unsupported` | Not promised in this release. DH must not imply support and must surface the limitation clearly. |

### Priority Order For This Feature

1. Preserve current TS/TSX/JS/JSX support without regression.
2. Add bounded Python support.
3. Add bounded Go support.
4. Add bounded Rust support.
5. Keep all other languages explicitly unsupported in this release.

### Required Language Coverage And Capability Boundaries

| Language family | Parse / diagnostics | Structural extraction + indexing | Query/search release boundary | Key limitations that must stay explicit |
| --- | --- | --- | --- | --- |
| TS / TSX / JS / JSX | `supported` | `supported` | Current bounded baseline remains `supported` for direct structural queries built on indexed facts; deeper relation quality may still be `best-effort` where current docs already say so | No compiler-grade type resolution; no universal semantic certainty; current bounded query/search limits remain in force |
| Python | `supported` for `def`, `async def`, `class`, module-scope assignments, imports, base classes, direct calls, and identifier/attribute references inside the supported subset | `supported` for normalized symbols/imports/exports-or-equivalent structural facts, chunks, diagnostics, and index writes for the supported subset | `supported` for symbol search, parser-backed definition lookup, direct dependency/dependent lookup, and other direct structural retrieval built from indexed facts; `partial` for reference/usage depth; `unsupported` for full parity claims and deep flow/impact reconstruction | No monkey patching parity, no full star-import resolution claim, no dynamic runtime import parity |
| Go | `supported` for package declarations, functions, receiver methods, structs, interfaces, imports, selector calls, and test functions | `supported` for normalized structural facts and indexing, with same-package awareness required inside the supported subset | `supported` for symbol search, parser-backed definition lookup, and direct dependency/dependent lookup; `partial` for reference/usage depth; `best-effort` for call-oriented reasoning; `unsupported` for deep trace/impact parity | No reflection/code-generation parity claim; no universal cross-package semantic resolution claim |
| Rust | `supported` for `fn`, `struct`, `enum`, `trait`, `type`, `impl`, `use`, and module declarations in the supported subset | `supported` for normalized structural facts and indexing in the supported subset | `supported` for symbol search, parser-backed definition lookup, and direct dependency/dependent lookup; `partial` for reference/usage depth; `best-effort` for macro- or trait-heavy call-oriented reasoning; `unsupported` for deep trace/impact parity | No macro-expansion parity, no compiler-grade trait resolution claim, no promise that every macro-like edge resolves cleanly |
| All other languages | `unsupported` | `unsupported` | `unsupported` for parser-backed code-intelligence classes; repository-level file/path retrieval may still exist where other product surfaces already support it | Must not be marketed as supported multi-language code intelligence |

### Parser / Indexer / Query Behavior Rules

- Every in-scope language must have one inspectable adapter contract that covers detection/routing, parse behavior, diagnostics behavior, normalized structural facts, and declared capability boundaries.
- Adapter outputs must remain normalized structural facts rather than raw parser internals on operator-facing or cross-layer surfaces.
- Recoverable syntax errors may produce partial facts plus diagnostics when that is safe.
- Fatal grammar mismatch, fatal adapter failure, or similarly unsafe extraction failure must not leave stale facts presented as current truth.
- Indexing and query behavior must be consistent with language support state. A language cannot be reported as query-supported for a capability if the indexed facts needed for that capability are absent or explicitly degraded.
- Query/search behavior for this feature is bounded to parser-backed structural intelligence. The product must not use model inference or optimistic wording to fill gaps in missing language facts.
- Direct structural retrieval classes may be broader than deeper flow reasoning. Definition, symbol, and direct dependency/dependent behaviors are allowed to reach `supported` before call hierarchy, trace, or impact do.
- `best-effort` relation behavior is allowed only when the product also surfaces why it is best-effort.

### Operator-Visible Wording Rules

- Operator-facing language support messaging must remain truthful per language and per capability, not just per repository.
- Operator-facing wording must keep these distinct:
  - language/capability support state
  - answer/result support state
  - workflow/process/lifecycle state
- When a language or capability is degraded, the product must explain what still works, what is limited, and why.
- When an unsupported language appears in a result because repository-level file/path or retrieval behavior found it, the product must not imply parser-backed support for that language.
- Product docs, presenters, and review notes must not describe this feature as “full multi-language support,” “all-language parity,” or equivalent wording.

## Acceptance Criteria Matrix

- **Given** a mixed-language repository containing TS/JS, Python, Go, Rust, and at least one out-of-scope language, **when** the operator inspects language coverage, **then** DH surfaces separate support states per language/capability instead of one blanket multi-language claim.
- **Given** TS/TSX/JS/JSX files that were already within current truthful support, **when** this feature lands, **then** those languages remain the supported baseline and are not downgraded or relabeled as merely experimental.
- **Given** a Python file that uses only the supported subset for this release, **when** it is parsed and indexed, **then** DH treats Python parse/index behavior as supported and allows the release-defined direct structural query/search classes for that file.
- **Given** a Go file that uses only the supported subset for this release, **when** it is parsed and indexed, **then** DH treats Go parse/index behavior as supported, preserves same-package structural awareness in the supported subset, and allows the release-defined direct structural query/search classes for that file.
- **Given** a Rust file that uses only the supported subset for this release, **when** it is parsed and indexed, **then** DH treats Rust parse/index behavior as supported and allows the release-defined direct structural query/search classes for that file without claiming macro- or trait-perfect semantic parity.
- **Given** a Python, Go, or Rust request for a capability marked `partial` or `best-effort`, **when** DH returns a result, **then** the surfaced outcome makes that limitation explicit instead of implying the language has TS/JS-equivalent support for that capability.
- **Given** an out-of-scope language file, **when** it appears through repository-level file/path retrieval or another non-parser-backed surface, **then** DH does not present that language as parser/indexer/query supported and does not surface parser-backed definition/reference/dependency claims for it.
- **Given** a recoverable parse problem in an in-scope language file, **when** indexing completes, **then** DH may preserve partial facts plus diagnostics and must surface the file/capability as degraded rather than fully supported for that run.
- **Given** a fatal grammar mismatch, adapter failure, or unsafe extraction failure for an in-scope language file, **when** indexing completes, **then** DH does not present stale facts as current and surfaces the relevant language/file capability as failed, degraded, or unsupported for that file.
- **Given** an operator-facing answer or doc references multi-language capability, **when** reviewers inspect it, **then** the wording distinguishes language/capability state from answer-support state and does not claim universal parity, compiler-grade semantics, daemon/service expansion, or Rust-host inversion.
- **Given** the feature is handed to Solution Lead, **when** they design implementation, **then** they do not need to invent which languages are in scope, what the priority order is, what “supported vs partial vs best-effort vs unsupported” means, or how unsupported/degraded language behavior must be surfaced.

## Edge Cases

- A repository mixes supported and unsupported languages, so some results are parser-backed while others are document-only retrieval.
- A Python file uses supported syntax overall but also relies on monkey patching, `__import__`, or star-import-heavy behavior beyond the bounded release claim.
- A Go package distributes important symbols across multiple files in the same package, requiring package-aware handling inside the bounded supported subset.
- A Rust file relies heavily on macros or complex trait impl behavior, producing useful but incomplete call/reference evidence.
- A file is identified by shebang or unconventional extension and still needs deterministic language routing rules.
- A language is supported for parse/index and direct definition lookup but only partial or best-effort for reference/call-oriented queries.
- A repository-level concept/relevance or file/path search finds a file from an unsupported language even though parser-backed structural support for that language is unavailable.
- Mixed-language answers need to reflect the weakest relevant language/capability rather than inheriting the strongest one automatically.

## Error And Failure Cases

- The feature fails if DH markets this release as broad or universal multi-language support without per-language/per-capability boundaries.
- The feature fails if unsupported languages are silently treated as supported because they appear in search or retrieval results.
- The feature fails if parser-backed support is claimed for a language that lacks the required adapter-backed capability contract.
- The feature fails if `supported`, `partial`, `best-effort`, and `unsupported` collapse into vague degraded wording.
- The feature fails if recoverable versus fatal parser/indexer failures are not surfaced distinctly enough for operators to understand what happened.
- The feature fails if stale facts remain visible as current truth after a fatal adapter or grammar failure.
- The feature fails if TypeScript operator/report surfaces imply stronger language support than the Rust foundation actually produced.
- The feature fails if implementation broadens into host inversion, daemon/service mode, distributed orchestration, or open-ended agent behavior in order to satisfy this feature.

## Open Questions

- None blocking at Product Lead handoff.
- If implementation evidence shows that one of the newly in-scope languages cannot honestly reach the release-defined `supported` baseline for parse/index plus direct structural query behavior, the guarantee must be narrowed explicitly in solution work rather than hidden behind generic multi-language wording.

## Success Signal

- Operators can inspect language coverage and immediately understand which languages and capability classes are supported, partial, best-effort, or unsupported.
- TS/JS baseline behavior remains intact while Python, Go, and Rust gain bounded structural code-intelligence support without false parity claims.
- Unsupported languages and degraded parser/indexer states are surfaced honestly enough that operators do not confuse document retrieval with parser-backed intelligence.
- Solution Lead, Code Reviewer, and QA can verify the feature against one explicit language/capability contract instead of reconstructing product intent from migration and architecture docs.

## Handoff Notes For Solution Lead

- Preserve the current Rust-foundation / TypeScript-operator split. Rust owns structural language truth; TypeScript owns operator-visible wording, support-state presentation, and degraded/unsupported guidance.
- Preserve the current topology truth from adjacent approved work: no daemon/service expansion, no Rust-host inversion, no remote/distributed orchestration.
- Treat TS/JS baseline preservation as first priority. Multi-language expansion does not justify regression or relabeling of the current strongest path.
- Design around the approved language priority order and the exact release boundary above instead of inventing a broader language list.
- Keep language/capability state separate from answer-support state. A best-effort language capability may still yield a partial answer; an unsupported language file may still be retrievable by path. Do not collapse those distinctions in product behavior.
- If any capability cannot be supported truthfully for a language, narrow that language/capability state explicitly rather than masking the gap with vague “multi-language support” wording.
- Preserve the existing bounded query/search catalog from adjacent approved work; this feature extends language coverage inside that bounded catalog and does not re-open every query/search class for universal parity.
