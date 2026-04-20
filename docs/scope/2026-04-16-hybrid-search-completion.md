---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: HYBRID-SEARCH-COMPLETION
feature_slug: hybrid-search-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Hybrid Search Completion

## Goal
- Complete the bounded hybrid search product surface so operators can run one search path that truthfully combines keyword, structural, and semantic evidence with intent-aware ranking, while clearly reporting when semantic support is degraded, partial, insufficient, or unsupported.

## Target Users
- Operators and maintainers using `dh ask` and adjacent knowledge-search surfaces to locate relevant code by exact text, structure, repository meaning, or a bounded mix of those signals.
- Downstream Solution Lead, Code Reviewer, and QA as consumers of a scope package that defines the product contract for hybrid search completion without requiring them to infer behavior from architecture notes.

## Problem Statement
- The previous catalog-completion work defines what query/search classes exist and how answer states should be expressed, but it does not yet fully define the next-step product contract for hybrid search itself.
- Operators need a single bounded search capability that can combine exact text, structural repository knowledge, and semantic relevance when available, rather than forcing one narrow retrieval mode to stand in for all discovery tasks.
- Without a clear hybrid-search scope, the product risks either underdelivering on the intended catalog or overclaiming semantic/intelligence depth beyond what the current repository truthfully supports.

## In Scope
- Make hybrid search a first-class bounded search capability on the current operator-facing product surface.
- Define hybrid search as a combination of these search inputs:
  - keyword signals
  - structural signals
  - semantic/relevance signals when available
- Include intent-aware ranking behavior for bounded operator intents where different signal mixes are appropriate, such as:
  - lookup-oriented requests
  - explain/understanding-oriented requests
  - debug/investigation-oriented requests
- Ensure hybrid search produces operator-visible outcomes that stay aligned with the catalog-completion state model:
  - grounded
  - partial
  - insufficient
  - unsupported
- Require operator-visible evidence and limitation wording so users can tell why a result ranked the way it did and what support was unavailable or bounded.
- Cover degraded runtime states where semantic search is disabled, unavailable, stale, unhealthy, or otherwise not usable, while preserving truthful fallback behavior.
- Keep this feature aligned with the product boundary that intelligence/search/evidence live in the Rust-owned intelligence layer and workflow/brain/operator-facing behavior live in the TypeScript-owned layer.

## Out of Scope
- Broad LLM redesign, prompt redesign, or planner redesign.
- New UI, editor, IDE, or external integration surfaces.
- Unbounded natural-language search or claims of general semantic understanding across any repository question.
- Performance, latency, throughput, or large-scale index guarantees beyond current bounded product reality.
- Workflow-lane redesign or changes to role/stage semantics.
- Autonomous remediation, autonomous code modification, or agent self-execution behavior based on search results.
- Broad retrieval, graph, or storage rearchitecture beyond what is necessary to make the bounded hybrid-search product contract truthful.
- Any claim of IDE-grade search parity, compiler-grade semantic reasoning, or exhaustive ranking quality.

## Main Flows
- As an operator, I can issue a repository search request through the current product surface and receive hybrid-ranked results instead of being limited to a single narrow retrieval signal.
- As an operator, I can understand whether my request was handled with keyword-only, keyword+structural, or full hybrid support including semantic contribution when available.
- As an operator, I can see explicit limitations when semantic support is unavailable, stale, disabled, or not strong enough to justify a confident result.
- As an operator, I can use the same bounded hybrid-search surface for different intents and get appropriately weighted results without the product pretending that one ranking strategy fits every request equally well.
- As a maintainer, I can inspect the surfaced result and understand the support state, evidence basis, and limitations without reverse-engineering internal implementation details.

## Business Rules
- Hybrid search is a search capability, not a replacement for all query classes or all answer-generation behavior.
- Hybrid search must remain bounded to repository-grounded evidence from supported search inputs; it must not present speculative or purely LLM-generated ranking as grounded search.
- Keyword, structural, and semantic signals remain distinct inputs even when combined into one search result.
- Intent-aware ranking may change weighting or ordering across supported intents, but it must stay within the same bounded search contract and must not invent unsupported search depth.
- If semantic support is unavailable, disabled, stale, unhealthy, or otherwise unusable, the product must degrade truthfully rather than silently implying full hybrid capability.
- If hybrid search falls back to a narrower mode, the surfaced result must make that limitation inspectable.
- A result may be marked `grounded` only when the returned ranking and evidence are directly supported by available repository signals.
- A result must be marked `partial` when some relevant signals or evidence exist but one or more expected hybrid inputs are missing, degraded, or incomplete.
- A result must be marked `insufficient` when the search request is valid but the available evidence is not strong enough for a safe, useful result.
- A result must be marked `unsupported` when the request or requested depth falls outside the bounded hybrid-search contract for this release.
- Limitation wording must be explicit enough that operators can distinguish:
  - semantic unavailable vs semantic weak
  - bounded fallback vs true full hybrid support
  - valid request with insufficient evidence vs unsupported request
- The product contract must stay honest about current architecture boundaries: Rust owns intelligence/search/evidence capabilities, while TypeScript owns workflow classification, operator-facing behavior, and presentation of support/limitation states.

## Acceptance Criteria Matrix
- **Given** the current search catalog direction, **when** an operator uses the bounded hybrid-search capability, **then** the product exposes hybrid search as a first-class search class rather than an implicit or undocumented internal behavior.
- **Given** a search request that can use keyword, structural, and semantic signals, **when** the system has all three available, **then** the returned result makes it inspectable that the outcome came from bounded hybrid ranking rather than a single-source search mode.
- **Given** a lookup-oriented request, **when** hybrid search handles it, **then** the product can favor exact or structural evidence more strongly than semantic relevance without changing the bounded search contract.
- **Given** an explain- or understanding-oriented request, **when** hybrid search handles it, **then** the product can favor semantic or broader relevance signals more strongly than a pure lookup request while still surfacing bounded repository-grounded evidence.
- **Given** a valid search request, **when** semantic support is disabled, unavailable, stale, or degraded, **then** the product returns either a truthful narrowed result or a truthful degraded state with explicit limitation wording instead of implying full semantic-backed hybrid support.
- **Given** a valid search request, **when** keyword and/or structural evidence are available but semantic contribution is missing or incomplete, **then** the result is surfaced as `partial` unless the available evidence is still strong enough to satisfy `grounded` under the bounded contract.
- **Given** a valid hybrid-search request, **when** the system cannot gather enough repository-grounded evidence across the available search inputs, **then** the result is surfaced as `insufficient` rather than as a confident answer.
- **Given** a request that asks for unsupported search depth, unsupported intent behavior, or broader semantic capability than this release supports, **when** the product handles that request, **then** it returns `unsupported` with explicit limitation wording.
- **Given** an operator inspects hybrid-search output, **when** they review the result, **then** they can see evidence and limitation information sufficient to understand why the result was returned and what support boundaries applied.
- **Given** the feature is reviewed against repository architecture direction, **when** Solution Lead plans implementation, **then** the product contract preserves the boundary that Rust owns intelligence/search/evidence behavior and TypeScript owns operator/workflow-facing behavior instead of collapsing those responsibilities.
- **Given** the feature is reviewed for scope discipline, **when** that review occurs, **then** acceptance does not depend on IDE-grade semantic search, unbounded relevance search, new UI integration, workflow redesign, or autonomous code-modification behavior.

## Edge Cases
- A request is semantically meaningful but contains little exact-text overlap, so semantic contribution matters if available but must not be overclaimed if unavailable.
- A request contains exact symbol names and natural-language intent at the same time, requiring hybrid ranking to balance structural and semantic relevance.
- Semantic infrastructure is present but stale or partially unavailable, creating a narrower truthful result than the nominal hybrid mode suggests.
- Different intents produce different useful ranking orders for the same corpus, but all must stay within one bounded and inspectable contract.
- A search request is valid but lands mostly in comments, tests, generated files, or weakly related snippets, increasing the risk of noisy relevance.
- Structural evidence is strong while semantic evidence is weak, or the reverse, requiring limitation wording rather than fake certainty.

## Error And Failure Cases
- The feature fails if hybrid search remains implicit and operators cannot tell when it is being used.
- The feature fails if the product claims full hybrid behavior when semantic support is disabled, degraded, stale, or unavailable.
- The feature fails if limitation wording does not distinguish partial, insufficient, and unsupported outcomes.
- The feature fails if intent-aware ranking is presented as broad intelligence beyond the bounded supported intents for this release.
- The feature fails if acceptance depends on unbounded semantic search, IDE-grade reasoning, or adjacent product redesign.
- The feature fails if surfaced results lack enough evidence or limitation context for operators to inspect why a result was ranked.
- The feature fails if the scope collapses the Rust intelligence/search/evidence boundary into TypeScript workflow/operator behavior or vice versa in a way that would force Solution Lead to redesign ownership instead of implementing a bounded feature.

## Open Questions
- None at Product Lead handoff. Solution Lead should only narrow guarantees further if implementation evidence shows any listed hybrid behavior cannot be supported truthfully in the current repository reality.

## Success Signal
- Operators can truthfully use one bounded hybrid-search surface that combines keyword, structural, and semantic relevance when available.
- Hybrid-search output makes support state, evidence basis, and limitations inspectable enough that degraded semantic conditions are visible rather than hidden.
- Different supported intents can influence ranking behavior without expanding into unbounded intelligence claims.
- The feature advances the search surface beyond catalog enumeration alone while staying within the current Rust+TypeScript product boundary and bounded product reality.

## Handoff Notes For Solution Lead
- Preserve the bounded promise: complete hybrid search as a truthful first-class product capability, not as an IDE-grade or open-ended semantic-search redesign.
- Keep the prior catalog-completion contract intact, especially the explicit `grounded` / `partial` / `insufficient` / `unsupported` state model and evidence/limitations wording.
- Treat degraded semantic states as part of the core feature, not as an afterthought. The implementation must make fallback/degradation inspectable.
- Preserve intent-aware ranking as bounded and inspectable. Supported intents may influence weighting, but the product must not imply broad intent understanding beyond the approved contract.
- Preserve the architectural ownership boundary in the implementation plan: Rust-owned intelligence/search/evidence capabilities should remain the search foundation, and TypeScript-owned workflow/operator surfaces should remain the place where support states, request classification, and operator-visible presentation are expressed.
- If any hybrid-search behavior above cannot be made truthful with current repository reality, narrow the guarantee explicitly in the solution package instead of broadening implementation scope or overclaiming support.
