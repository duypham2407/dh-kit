---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: TRACE-AND-IMPACT-COMPLETION
feature_slug: trace-and-impact-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Trace And Impact Completion

TRACE-AND-IMPACT-COMPLETION completes the current bounded static call/trace/impact product surface by exposing Rust-authored call hierarchy, trace-flow, and impact-analysis truth where DH can actually prove it, while preserving the architecture split that Rust owns graph/query/evidence truth and TypeScript owns presentation and operator wording. This feature must move DH beyond the current blanket `dh trace` unsupported story on supported bounded cases, but it must not overclaim runtime tracing, universal interprocedural analysis, or cross-language parity where real evidence does not exist.

## Goal

- Let operators inspect bounded static caller/callee relationships, trace paths, and change impact using Rust-authored graph/query/evidence truth.
- Move DH closer to developer-grade code understanding on supported bounded cases without claiming runtime or universal trace support.
- Make partial, insufficient, unsupported, ambiguous, and cut-pointed outcomes explicit and inspectable instead of hidden behind generic success or blanket unsupported wording.

## Target Users

- Operators using `dh ask`, `dh explain`, and `dh trace` to understand how code paths connect and what a bounded change may affect.
- Maintainers, reviewers, and QA who need one inspectable contract for path truth, cut-points, impact classification, and operator-visible wording.
- Solution Lead and Fullstack implementers who need a bounded product target for trace/impact completion without reopening language-parity, retrieval-redesign, or runtime-tracing scope.

## Problem Statement

- The repository architecture and Rust query layer already define bounded `call_hierarchy`, `trace_flow`, `impact_analysis`, and evidence-packet concepts, but current operator-visible product behavior still keeps `dh trace` unsupported and does not yet complete an honest bounded trace/impact story on the existing knowledge-command surfaces.
- That gap leaves DH weaker than its current graph/query/evidence foundation on supported static cases, while also making it hard for operators to distinguish:
  - no support at all
  - bounded static support
  - partial support with missing edges or ambiguity
  - in-scope requests with insufficient current evidence
- The feature is needed to expose real bounded path and impact behavior truthfully so operators can rely on DH for supported static investigation tasks without mistaking that for runtime tracing, universal path discovery, or guaranteed blast-radius prediction.

## In Scope

- Preserve the architecture boundary:
  - Rust owns call hierarchy edges, trace path truth, impact-analysis truth, evidence packets, gaps, bounds, cut-points, impact classification, and language/capability truth.
  - TypeScript owns routing on existing knowledge-command surfaces, presenter/report formatting, help/docs wording, and operator guidance.
- Complete operator-visible bounded support on existing knowledge-command surfaces and touched docs/help for:
  - bounded call hierarchy behavior
  - bounded trace-flow behavior
  - bounded impact-analysis behavior
- Treat call hierarchy, trace flow, and impact as distinct bounded classes; do not absorb them into generic retrieval or vague repository explanation.
- Define the supported trace/impact contract around static repository-grounded graph traversal only.
- Define explicit target and result semantics for:
  - trace requests that resolve to bounded supported endpoints
  - impact requests against supported indexed targets
  - mixed direct-evidence and inferred-impact outputs
  - partial / insufficient / unsupported outcomes
  - missing-edge, ambiguity, and cut-point reporting
- Require touched operator-visible surfaces to explain, in bounded wording:
  - what the surface is showing
  - the current answer/result state
  - the relevant capability boundary when it matters
  - what still works versus what is limited
  - the next recommended action when one exists
- Update touched operator wording in CLI help/presenters and `docs/user-guide.md` so the surfaced product story matches the shipped bounded trace/impact reality.

## Out of Scope

- Runtime execution tracing, debugger-style runtime flow capture, telemetry-based traces, or any claim of observing live execution.
- Universal interprocedural analysis, unbounded path reconstruction, or whole-subsystem flow completion.
- Full blast-radius prediction, severity scoring, breakage certainty scoring, or any promise that every surfaced impact item is definitely affected.
- Cross-language trace or impact parity beyond what the Rust capability truth and surfaced evidence actually support.
- TypeScript-authored path truth, cut-point derivation, impact tiers, or capability upgrades.
- New language onboarding, broad language-parity expansion, or automatic upgrades for unsupported language/capability pairs.
- Broad retrieval/search/ranking redesign, LLM-behavior redesign, or workflow/platform redesign.
- Net-new product claims for surfaces outside the existing bounded knowledge-command and touched documentation/help surfaces.

## Main Flows

- **Flow 1 — Operator inspects bounded caller/callee relationships**
  - As an operator, I ask for callers or callees of a symbol.
  - DH returns bounded static caller/callee relationships from Rust-authored graph truth.
  - If any edge is unresolved or best-effort, the result stays explicit about that limitation.

- **Flow 2 — Operator traces a bounded static path between supported endpoints**
  - As an operator, I ask DH to trace a flow that the product can resolve into bounded supported endpoints.
  - DH returns an ordered static path only when Rust can surface real path steps from the graph/query layer.
  - The result includes path evidence, bounds, and any stop reason or cut-point when the path is partial.

- **Flow 3 — Operator asks what a bounded change may affect**
  - As an operator, I ask for impact on an indexed file or symbol.
  - DH returns direct evidence-backed impacts and, when applicable, separately labeled inferred bounded impacts.
  - DH does not present inferred expansion as guaranteed breakage or universal blast radius.

- **Flow 4 — Operator receives a partial result with an explicit cut-point**
  - As an operator, I receive a trace or impact result where traversal stops because of unresolved edges, ambiguity, unsupported language boundaries, or configured bounds.
  - DH keeps the grounded portion visible.
  - DH also shows where analysis stopped and why.

- **Flow 5 — Operator asks for an out-of-bounds trace or impact request**
  - As an operator, I ask for runtime behavior, a too-broad subsystem trace, or a request that crosses unsupported capability boundaries.
  - DH returns `unsupported` explicitly.
  - No wording suggests hidden runtime support or broader path/impact certainty than DH actually has.

- **Flow 6 — Reviewer or QA inspects cross-surface truth**
  - As a reviewer or QA agent, I compare runtime output, presenter wording, and touched docs/help for call hierarchy, trace, and impact.
  - I can verify that Rust-authored truth, answer-state, capability boundaries, and operator wording tell the same bounded story.

## Business Rules

### Ownership and truth-source rules

- Rust is the only truth source for:
  - caller/callee edges surfaced as call hierarchy truth
  - trace path steps and their ordering
  - impact items and their classification
  - evidence packets, gaps, bounds, and stop reasons
  - language/capability truth for call hierarchy, trace flow, and impact
- TypeScript may route requests and present Rust truth, but it must not:
  - invent or reorder path steps
  - invent missing edges or bridge across unsupported gaps
  - infer cut-points that Rust did not surface
  - relabel inferred impact as direct impact
  - strengthen capability or answer-state beyond Rust-authored truth

### State-separation rules

- Language/capability state and answer/result state remain separate.
- Language/capability state uses the existing bounded vocabulary: `supported`, `partial`, `best-effort`, `unsupported`.
- Answer/result state uses the existing bounded vocabulary: `grounded`, `partial`, `insufficient`, `unsupported`.
- A trace or impact capability may be generally supported for a bounded language/path while a specific invocation is still `partial` or `insufficient`.
- A `grounded` trace or impact answer does not imply universal support outside the surfaced bounded case.

### Bounded call hierarchy rules

- Call hierarchy is limited to bounded static caller/callee relationships that the Rust graph/query layer can surface directly from the current indexed graph.
- The minimum outward contract for call hierarchy is one-hop incoming and outgoing caller/callee truth for an indexed symbol.
- Multi-hop or recursive hierarchy reasoning is out of scope unless it is explicitly built from surfaced bounded one-hop truth and keeps each hop inspectable.
- Unresolved, dynamic, or weakly bound call edges must degrade the result to `partial` or weaker rather than being treated as fully grounded.
- Trace and impact may rely on surfaced call edges, but they must carry forward any weakness, ambiguity, or best-effort limit from those edges.

### Bounded trace-flow rules

- Trace flow in this feature is static, repository-grounded path analysis only.
- A trace request is only eligible for a grounded result when the product can resolve it to bounded supported endpoints and Rust can surface an ordered path between them.
- A grounded trace requires:
  - surfaced ordered path steps
  - inspectable Rust-authored evidence for those steps
  - visible bounds metadata
  - no hidden unresolved edge that would materially weaken trust
- A trace result must be:
  - `partial` when a path exists but contains unresolved or ambiguous steps, or analysis stops at a cut-point after some grounded progress
  - `insufficient` when the request stays within the bounded trace class but current indexed evidence cannot prove endpoints or a bounded path
  - `unsupported` when the request asks for runtime flow, unbounded subsystem flow, or a language/capability that Rust marks unsupported for this class
- Trace must never read as runtime execution history.

### Bounded impact-analysis rules

- Impact analysis in this feature is static, bounded analysis for a supported indexed target.
- Supported impact targets are indexed file paths and indexed symbols; other target shapes are outside the bounded target contract.
- Impact analysis may use bounded direct relationships and bounded neighborhood expansion from the target, but it must remain inspectable and bounded.
- Impact analysis must never claim complete blast radius, full semantic certainty, or guaranteed breakage.
- Impact results must include the bounds that shaped the analysis and any visible stop reason when traversal is cut short.

### Direct evidence vs inferred impact rules

- Impact output must separate at least these outward categories:
  - **direct evidence-backed impact**: an item surfaced because Rust has an explicit direct supporting relation from the target or from the first bounded step out from that target
  - **inferred bounded impact**: an item surfaced only because it was reached through bounded propagation beyond direct evidence-backed steps
- If an item is labeled inferred, the output must also carry the bounded reason it was included.
- Inferred impact must not be phrased as direct proof or definite breakage.
- If only inferred bounded impact exists, the product must not present the overall result as if direct evidence exists where it does not.
- Any richer impact tiering beyond this minimum outward separation is allowed only if Rust authors it and the operator-facing wording remains inspectable.

### Missing-edge, ambiguity, and cut-point rules

- The following conditions are cut-points when they materially affect trust and continuation:
  - unresolved or missing call/reference/dependency edge
  - ambiguous endpoint or ambiguous step resolution
  - unsupported language/capability boundary
  - configured hop/node bound reached
  - missing indexed endpoint or target needed for a bounded query
  - dynamic/runtime-only construct outside bounded static proof
- A surfaced partial trace or impact result must say which cut-point class applies and what still remains grounded.
- Missing or unresolved edges must not be silently omitted if that omission would make the result look stronger.
- When traversal stops early, the product must preserve the last grounded path prefix or the last grounded direct-impact set instead of replacing it with a generic failure message.

### Mixed-language and capability-boundary rules

- This feature may ship with stronger bounded support for the strongest truthful language paths while leaving other languages or cross-language traversals partial, best-effort, or unsupported.
- A trace or impact result that crosses mixed capability states must surface the weakest relevant capability boundary instead of inheriting the strongest one.
- Crossing into an unsupported language or unsupported capability boundary must become an explicit cut-point, not a hidden continuation.
- The feature passes even if some languages remain partial, best-effort, or unsupported, provided the product states that truth explicitly.

### Operator-visible wording rules

- Touched operator-visible surfaces for call hierarchy, trace, and impact must make clear:
  - that the result is static and bounded
  - the current answer/result state
  - the relevant capability boundary when it materially limits trust
  - what is directly evidenced versus inferred
  - what still works versus what is limited
  - the next recommended action when one exists
- If this feature enables bounded trace support on touched runtime surfaces, help/docs must stop telling a blanket `dh trace` unsupported story and instead describe the narrower truthful support boundary plus explicit unsupported cases.
- If a touched high-level surface cannot carry the full detail, it must present a bounded summary and route the operator to the deeper surfaced Rust envelope rather than inventing a stronger simplified story.

## Acceptance Criteria Matrix

- **AC1** — **Given** an indexed symbol and a supported bounded call-hierarchy request, **when** DH surfaces caller/callee results, **then** it returns bounded one-hop caller/callee relationships only, and any unresolved or dynamic edge keeps the result at `partial` or weaker instead of `grounded`.
- **AC2** — **Given** a trace request that can be resolved to supported bounded endpoints and a fully resolved bounded static path exists, **when** DH surfaces the result, **then** it returns `grounded` with ordered path steps, Rust-authored evidence, and visible bounds metadata.
- **AC3** — **Given** a trace request where a bounded path exists but one or more steps are unresolved, ambiguous, or cut short by a bound, **when** DH surfaces the result, **then** it returns `partial`, keeps the grounded path portion visible, and states the cut-point reason explicitly.
- **AC4** — **Given** a trace request that stays within the bounded static trace class but current indexed evidence cannot prove an endpoint or a bounded path, **when** DH surfaces the result, **then** it returns `insufficient` with an explicit missing-proof explanation instead of a grounded or runtime-style narrative.
- **AC5** — **Given** a trace request for runtime execution behavior, unbounded subsystem flow, or a language/capability that Rust marks unsupported, **when** DH surfaces the result, **then** it returns `unsupported` explicitly and does not imply hidden fallback trace support.
- **AC6** — **Given** a bounded impact request against an indexed file or indexed symbol, **when** DH surfaces the result, **then** it separates direct evidence-backed impact from inferred bounded impact and does not merge those categories into one unqualified list.
- **AC7** — **Given** an impact item is surfaced only through bounded propagation and not through direct supporting evidence, **when** DH renders that item, **then** it is labeled inferred and includes the bounded reason it was included rather than reading as direct proof or definite breakage.
- **AC8** — **Given** an impact request where analysis stops at unresolved edges, ambiguity, unsupported capability boundaries, or configured traversal bounds, **when** DH surfaces the result, **then** it returns `partial`, preserves the grounded direct-impact portion, and names where and why the cut-point occurred.
- **AC9** — **Given** an impact request whose target is not an indexed file or indexed symbol, or whose language/capability is outside the bounded contract, **when** DH surfaces the result, **then** it returns `unsupported` with the supported target/capability boundary stated explicitly.
- **AC10** — **Given** a trace or impact request that crosses mixed language or capability states, **when** DH surfaces the result, **then** the weakest relevant capability boundary remains explicit and any unsupported boundary becomes a visible cut-point instead of a hidden continuation.
- **AC11** — **Given** Rust emits path steps, gaps, stop reasons, or impact classification, **when** TypeScript presenters and reports render the result, **then** TypeScript does not add, remove, reorder, or strengthen those truth elements beyond truthful shortening and formatting.
- **AC12** — **Given** touched CLI/help/user-guide surfaces mention call hierarchy, trace, or impact, **when** reviewers compare them to runtime behavior, **then** they describe the same bounded static support story, including partial, insufficient, and unsupported conditions, without reverting to blanket unsupported wording where bounded support now exists or promising broader support than runtime proves.
- **AC13** — **Given** the completed scope package, **when** Solution Lead begins design, **then** they can identify the supported bounded classes, direct-versus-inferred impact rule, cut-point classes, target contract, and wording obligations without inventing product behavior.

## Edge Cases

- A natural-language trace request cannot be resolved uniquely to start and end endpoints, even though it is attempting an in-scope static trace.
- Multiple symbols share the same name, creating ambiguity for call hierarchy, trace start/end selection, or impact target resolution.
- A trace begins in a strongly supported TS/JS path and then crosses into a weaker or unsupported language/capability boundary.
- A call edge depends on callbacks, reflection, macro expansion, trait dispatch, or other dynamic/runtime-only behavior that the bounded static graph cannot resolve.
- An impact request targets a high-fan-out utility file or symbol and hits node/hop bounds before traversal is complete.
- A result contains both direct evidence-backed impacts and inferred bounded impacts for the same request.
- Index freshness or parse degradation leaves some files/symbols available for partial reasoning while others are unavailable for grounded trace/impact completion.

## Error And Failure Cases

- The feature fails if any touched surface presents trace or impact like runtime execution or universal flow reconstruction.
- The feature fails if TypeScript invents path truth, cut-points, impact tiers, or stronger state than Rust surfaced.
- The feature fails if direct evidence-backed impact and inferred bounded impact are blended into one unqualified claim.
- The feature fails if missing edges, ambiguity, or cut-points are omitted in ways that make a result look stronger than it is.
- The feature fails if a mixed-language or mixed-capability result inherits the strongest capability story and hides the weakest relevant boundary.
- The feature fails if help/docs/presenters contradict runtime truth by keeping a blanket unsupported story where bounded support now exists or by promising broader trace/impact support than runtime evidence proves.
- The feature fails if scope expands into runtime tracing, broad language-parity claims, retrieval redesign, or unbounded blast-radius analysis in order to satisfy acceptance.

## Open Questions

- None blocking at Product Lead handoff.
- Assumption to preserve unless Solution Lead proves a narrower better fit: use the existing knowledge-command surfaces and touched docs/help for this feature rather than introducing a brand-new top-level product promise.

## Success Signal

- Operators can use the touched bounded DH surfaces to inspect caller/callee relationships, static trace paths, and bounded impact with real Rust-authored evidence and explicit limits.
- `dh trace` no longer depends on a blanket unsupported story for supported bounded cases, while unsupported runtime/deep/cross-language cases remain explicit.
- Direct evidence-backed impact and inferred bounded impact are visibly separate and inspectable.
- Partial, insufficient, and unsupported results explain what still works, what is limited, and why.
- Reviewers and QA can compare runtime output, presenters, and docs/help and see one consistent bounded story instead of trace/impact truth drift.

## Handoff Notes For Solution Lead

- Preserve the architecture boundary as a hard rule:
  - Rust = call/trace/impact truth, evidence, bounds, cut-points, and capability truth
  - TypeScript = routing and presentation only
- Start from current repo reality:
  - Rust query code already contains bounded `call_hierarchy`, `trace_flow`, and `impact_analysis` behavior and evidence concepts
  - current operator-facing surfaces still keep `dh trace` unsupported and do not yet complete an outward bounded trace/impact story
- Design the smallest truthful product completion path on the existing knowledge-command surfaces first; do not assume a new top-level command or broader catalog expansion is required.
- Explicitly define in the solution package:
  - supported request/target shapes
  - bounded defaults and/or surfaced bounds for call hierarchy, trace, and impact
  - the minimum outward separation between direct evidence-backed impact and inferred bounded impact
  - the cut-point classes and how they surface in result envelopes and presenter wording
  - how mixed language/capability boundaries degrade truthfully
  - how help/docs/user guide wording changes from the current blanket unsupported trace story to the new bounded truthful story
- Preserve these hard stops unless scope is explicitly changed:
  - no runtime execution tracing
  - no universal interprocedural or blast-radius claims
  - no cross-language trace/impact parity promises without real evidence
  - no TS-authored path truth, cut-points, or impact-tier invention
  - no hidden retrieval-only fallback marketed as parser-backed trace/impact proof
