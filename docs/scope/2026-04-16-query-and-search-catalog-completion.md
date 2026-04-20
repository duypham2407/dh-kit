---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: QUERY-AND-SEARCH-CATALOG-COMPLETION
feature_slug: query-and-search-catalog-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Query And Search Catalog Completion

## Goal
- Complete the operator-visible query/search catalog so the current product surface can truthfully expose a broader, bounded, and inspectable set of first-class query and search capabilities than today’s narrower bridge-backed surface.

## Target Users
- Operators and maintainers using the current repository’s code-understanding surfaces to investigate symbols, files, relationships, and bounded repository questions.
- Solution Lead, Code Reviewer, and QA as downstream consumers of a clear, bounded product contract for query/search catalog completion.

## Problem Statement
- The repository already has meaningful Rust engine depth and some bounded bridge-backed query behavior, but the public operator-visible catalog is still narrower than the architecture intends.
- Operators need a clearer and richer set of supported query/search classes they can rely on as first-class capabilities, with explicit boundaries and honest partial, insufficient, or unsupported outcomes.
- Without that explicit catalog completion, the product surface remains narrower and less inspectable than the current architecture direction implies.

## In Scope
- Add a broader, explicit operator-visible query/search catalog for the current product surface.
- Make these query classes first-class and inspectable:
  - definition lookup
  - reference / usage lookup
  - dependency lookup
  - dependent lookup
  - call hierarchy lookup
  - trace / flow query
  - bounded impact-oriented query
- Make these search classes first-class and inspectable:
  - symbol search
  - file / path search
  - code pattern / structural search
  - bounded concept / relevance-oriented repository search
- Ensure supported classes have operator-visible result states that distinguish:
  - grounded / supported result
  - partial result with explicit gaps
  - insufficient result
  - unsupported class or unsupported depth
- Keep the work bounded to query/search catalog completion for current repository surfaces.

## Out of Scope
- Broad retrieval redesign, ranking redesign, or LLM behavior redesign.
- New workflow lanes, broad workflow redesign, or adjacent platform redesign.
- Full IDE-grade code intelligence parity or unbounded natural-language coverage for repository questions.
- New UI or editor integrations.
- Performance or scale commitments as product requirements.
- Autonomous planning, remediation, or code modification capabilities.
- Broader roadmap completion claims beyond this bounded query/search catalog work.

## Main Flows
- As an operator, I can use or inspect support for distinct query classes such as definition, references, dependencies, dependents, call hierarchy, trace, and bounded impact.
- As an operator, I can use or inspect support for distinct search classes such as symbol, file/path, structural, and bounded concept/relevance-oriented search.
- As an operator, I can tell whether a result is grounded, partial, insufficient, or unsupported.
- As a maintainer, I can inspect the product surface and see that the query/search catalog is broader and more explicit than the current bounded bridge state.

## Business Rules
- This feature is about operator-visible catalog completion, not broad retrieval or architecture redesign.
- Supported query and search classes must be explicit and inspectable; they must not rely on architecture prose alone to imply support.
- Query classes and search classes must remain distinguishable as product capabilities.
- If a request falls outside the bounded supported catalog or supported depth for a class, the product must report that limitation explicitly.
- The product must not present a confident result when it only has partial or insufficient support for that class.
- “First-class” in this feature means product-visible and inspectable support, not merely hidden implementation capability.

## Acceptance Criteria Matrix
- **Given** the current bounded bridge-backed state, **when** this feature is complete, **then** the product surface exposes a broader supported query/search catalog explicitly enough that operators do not need to infer support only from architecture or implementation.
- **Given** an operator inspects or uses the supported query families, **when** they do so, **then** definition, references/usages, dependencies, dependents, call hierarchy, trace/flow, and bounded impact are distinguishable first-class classes.
- **Given** an operator inspects or uses the supported search families, **when** they do so, **then** symbol, file/path, structural, and bounded concept/relevance-oriented search are distinguishable first-class classes.
- **Given** an in-scope class cannot produce a fully grounded result, **when** the product returns an outcome, **then** it reports a partial or insufficient state explicitly rather than presenting unjustified certainty.
- **Given** a request falls outside the bounded supported catalog or bounded supported depth, **when** the product handles that request, **then** it reports the request as unsupported or explicitly limited instead of implying broader support.
- **Given** maintainers compare the completed feature with current repo reality, **when** they review the result, **then** operator-visible usefulness is broader than the current bounded surface while remaining clearly bounded to query/search catalog completion.
- **Given** the delivered feature is reviewed for scope discipline, **when** that review occurs, **then** the work does not depend on broad retrieval redesign, workflow redesign, or unbounded product claims to satisfy acceptance.

## Edge Cases
- A query or search class is adjacent to a supported class but exceeds the bounded supported depth for this release.
- A result is plausible but only partially grounded.
- A concept/relevance-oriented search request is useful enough for bounded support in some cases but not as a universal guarantee.
- Different classes may need different limitation wording while still preserving a consistent operator-visible state model.

## Error And Failure Cases
- The feature fails if supported catalog classes remain implicit or only implementation-discoverable.
- The feature fails if unsupported or weakly supported requests are presented as confidently supported.
- The feature fails if query and search capabilities remain blended into a vague undifferentiated capability surface.
- The feature fails if scope expands into broad retrieval redesign or adjacent product redesign to justify acceptance.

## Open Questions
- What is the canonical operator-visible surface for presenting this completed catalog in the current repository reality?
- For trace/flow and impact, what is the narrowest truthful supported boundary for this release?
- For concept/relevance-oriented search, what minimum support level is truthful enough to count as first-class rather than best-effort only?
- Does “first-class” require explicit catalog enumeration on the operator-visible surface, or is inspectable structured support sufficient?
- What minimum result payload is required so operators can distinguish grounded, partial, insufficient, and unsupported outcomes without inspecting raw internals?
- Are any repository areas, languages, or surfaces required to be explicitly excluded from claims for this release?

## Success Signal
- The query/search catalog can be described truthfully as broader and more complete than the current bounded bridge-backed surface.
- Operators can complete a wider bounded set of repository investigation tasks through first-class query/search classes.
- Support boundaries are explicit enough that maintainers do not need to infer them from architecture prose or implementation details.
- The feature remains narrowly scoped to catalog completion rather than drifting into adjacent redesign work.

## Handoff Notes For Solution Lead
- Preserve the bounded interpretation of this feature: complete the operator-visible query/search catalog for current repo surfaces without broad retrieval, ranking, or LLM redesign.
- Keep product claims narrow and inspectable; unsupported or shallowly supported classes must be called out explicitly.
- Preserve the distinction between query classes and search classes, and between grounded, partial, insufficient, and unsupported outcomes.
- If any listed class cannot be made truthful on the current product surface, narrow the guarantee explicitly rather than implying broader capability.
- Resolve the open questions above, especially canonical surface, first-class presentation shape, and the truthful first-release boundary for trace/flow, impact, and concept/relevance-oriented search.
