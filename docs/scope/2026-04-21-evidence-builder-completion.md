---
artifact_type: scope_package
version: 1
status: product_lead_handoff
feature_id: EVIDENCE-BUILDER-COMPLETION
feature_slug: evidence-builder-completion
owner: ProductLead
approval_gate: product_to_solution
---

# Scope Package: Evidence Builder Completion

EVIDENCE-BUILDER-COMPLETION makes Rust-authored `query.buildEvidence` the canonical evidence-building surface for current DH brain flows that need aggregated evidence rather than a single narrow lookup. Rust becomes the only product truth source for evidence packet construction, subgraph/chunk selection, gaps, bounds, confidence, and any packet-level summary or serialization carried on the touched product path. TypeScript continues to own routing, prompt/context consumption, presentation, and workflow behavior, but it must stop becoming a second truth source by assembling authoritative evidence packets from retrieval-side logic or preview rows. This feature stays bounded to the current product path and honest degraded behavior; it does not promise universal reasoning, runtime tracing, or unlimited semantic guarantees.

## Goal

- Make Rust-authored evidence building a first-class product flow on the current TS brain path for requests that need aggregated canonical evidence packets.
- Ensure the TS brain consumes canonical Rust packets instead of constructing secondary evidence truth from retrieval/search-side logic.
- Keep bounded support, degraded states, and unsupported behavior explicit and inspectable.

## Target Users

- Operators using the current DH knowledge and reasoning surfaces who need trustworthy evidence-backed repository understanding.
- The TS brain layer and workflow surfaces that need prompt/context evidence without owning structural truth.
- Reviewers, QA, and maintainers who need one inspectable evidence-truth contract across Rust output, TS consumption, and operator-facing output.

## Problem Statement

- The architecture and bridge-design artifacts already define a coarse-grained `query.buildEvidence` contract and position Rust as the owner of evidence-builder truth.
- Repository reality is only partially aligned with that contract today:
  - Rust already has canonical evidence packet types and evidence-bearing query results.
  - TS app surfaces already parse Rust evidence packets for several narrow query classes.
  - TS app surfaces do **not** yet expose a first-class `query.buildEvidence` product flow.
  - TS-side retrieval utilities and packet-like structures still exist and can act like a secondary evidence truth source on touched flows.
- That gap creates product-truth drift:
  - TS can assemble evidence-shaped output from retrieval results, preview rows, or per-query glue logic.
  - broad understanding and prompt-building flows do not yet have one canonical Rust packet for subgraph/chunk/evidence assembly.
  - gaps, bounds, confidence, and evidence provenance can drift between Rust truth and TS-composed output.
- This feature is needed so the product can honestly say: Rust decides what the evidence packet is; TS decides how to use and present it.

## In Scope

- Make `query.buildEvidence` a supported first-class surface on the current Rust ↔ TS product path for **aggregated evidence** use cases.
- Cover current TS brain flows that need a canonical multi-source evidence packet rather than only a single narrow relation or definition lookup. This includes the current product path for:
  - broad repository explanation and understanding requests
  - prompt/context assembly for bounded explain, debug, plan, review, and migration-style reasoning on existing surfaces
  - any touched operator-facing or workflow-facing flow that currently needs an aggregated evidence packet
- Preserve the architecture boundary as a hard rule:
  - **Rust owns** evidence packet truth, subgraph/chunk/evidence assembly, gaps, bounds, confidence, stop reasons, and any packet-level summary or serialization included in the touched product path.
  - **TypeScript owns** routing, request shaping inside the approved contract, prompt/context consumption, presentation, workflow behavior, and operator guidance.
- Define the first-class evidence packet contract for touched flows, including truthfully available fields such as:
  - subject/query identity
  - relevant files, symbols, chunks, and graph relationships used as evidence
  - inspectable evidence entries with source path and reason
  - gaps, ambiguity, and unsupported-boundary reporting
  - bounds and stop reasons
  - confidence and grounded-vs-partial signals
  - optional Rust-authored summary or serialized evidence view when the touched product path needs one
- Require one canonical evidence story across touched surfaces:
  - raw Rust bridge output
  - TS brain/workflow consumption
  - operator-facing output for the touched flows
- Define truthful degraded behavior for cases such as:
  - index not ready or not fresh enough for the requested packet
  - unsupported language/capability boundary
  - ambiguous target or ambiguous broad-understanding request
  - budget, hop, node, snippet, or packet-size bound reached
  - insufficient evidence to support a safe conclusion
- Preserve existing narrow specialized query surfaces where they are already the right truthful product surface. `query.buildEvidence` complements them for aggregated evidence flows; it does not automatically replace every existing narrow query.
- Demote existing TS-side retrieval packet builders and packet-like structures on touched product flows so they are no longer the authoritative evidence source for those flows.

## Out of Scope

- Replacing every existing narrow query surface with `query.buildEvidence`.
- Adding a new broad user-facing command family solely for this feature.
- Universal semantic reasoning, unlimited repository intelligence, or guarantees that DH can always construct a complete evidence packet.
- Runtime tracing, live execution capture, or any claim that evidence packets represent observed runtime behavior.
- New language onboarding, broad language-parity expansion, or cross-repo reasoning claims.
- Broad graph-engine, ranking, retrieval, indexing, or prompt-system redesign beyond what is required to make canonical evidence building first-class on touched flows.
- Removing all retrieval-side utilities everywhere in the repository if they are not part of the touched product path.
- Any design that allows TypeScript to remain a competing or fallback authoritative evidence packet source on touched flows.
- Unrelated workflow-lane redesigns, CLI taxonomy redesigns, or platform topology changes.

## Main Flows

- **Flow 1 — Broad understanding request uses canonical Rust evidence packet**
  - As an operator or TS brain consumer, I trigger a bounded broad-understanding flow that needs aggregated evidence.
  - The TS layer requests canonical evidence through the first-class Rust evidence-builder surface.
  - The product uses that Rust packet as the authoritative evidence basis for the touched flow.

- **Flow 2 — Prompt/context assembly consumes canonical packet instead of secondary truth**
  - As the TS brain prepares bounded prompt/context for an existing explain, debug, plan, review, or migration flow, it needs evidence.
  - TS consumes the Rust-authored packet and may format or subset it for the destination surface.
  - TS does not construct a rival authoritative packet from retrieval-side logic.

- **Flow 3 — Partial packet remains useful and honest**
  - As an operator or reviewer, I receive a packet where some evidence is real but bounds, ambiguity, or unsupported edges limit completeness.
  - The grounded portion remains visible.
  - The gaps, bounds, and stop reasons remain explicit.

- **Flow 4 — In-scope request with weak evidence becomes insufficient**
  - As an operator or TS brain consumer, I request a packet that is in scope but cannot be supported by current indexed evidence.
  - The result is `insufficient`.
  - TS does not fill the gap by assembling a stronger packet from search hits or preview rows.

- **Flow 5 — Out-of-bounds evidence request stays unsupported**
  - As an operator or TS brain consumer, I request runtime-only, unlimited, or unsupported-capability evidence building.
  - The product returns `unsupported` explicitly.
  - No fallback packet makes the request look supported.

- **Flow 6 — Reviewer inspects one canonical evidence story**
  - As a reviewer or QA agent, I inspect a touched flow across Rust output, TS consumption, and final surfaced result.
  - I can verify that the same canonical packet truth survives end to end.

## Business / Operator Truth Rules

### First-class surface rules

- For this feature, “first-class” means all of the following are true on the touched product path:
  - the flow is officially supported on the current Rust ↔ TS bridge/app path
  - the flow has one canonical Rust-authored evidence packet truth source
  - degraded, insufficient, and unsupported states are explicit
  - reviewers can inspect the packet truth without reconstructing it from implementation details
- “First-class” does **not** require a new top-level operator command if the existing product path can truthfully surface the capability.

### Ownership rules

- Rust is the only authoritative source for canonical evidence packet truth on touched flows.
- TypeScript may consume, filter, order for presentation, or format Rust-authored packet content, but it must not:
  - invent a competing canonical packet
  - upgrade packet confidence beyond Rust truth
  - silently merge retrieval-side packet truth into the canonical packet
  - hide material packet gaps, bounds, or unsupported boundaries
- If Rust packet truth and TS-composed output disagree, Rust packet truth wins.

### Canonical packet rules

- A canonical packet must keep inspectable evidence provenance for the touched flow.
- A grounded-looking packet must not hide material uncertainty.
- If a touched flow includes a precomposed summary or serialized evidence narrative, that content must be either:
  - Rust-authored product truth, or
  - a lossless formatting of Rust-authored packet truth
- TypeScript must not turn a partial packet into a stronger narrative summary.

### Secondary truth source rules

- Retrieval-side packet builders, shared TS evidence packet types, search preview rows, and per-query glue logic may exist in the repository.
- On touched product flows, those surfaces must be treated as:
  - supplementary input
  - legacy compatibility data
  - presentation helpers only
- They must not remain the authoritative evidence packet source once this feature ships.

### Bounded support rules

- `query.buildEvidence` support is bounded to the current indexed workspace and currently supported language/capability surfaces.
- Supported first-wave use is limited to aggregated evidence flows for existing explain, debug, plan, review, and migration-style reasoning on the current product path.
- This feature does not promise that every possible question or workflow stage can be satisfied by one packet.
- Existing specialized surfaces may remain specialized when a narrow contract is the truthful product surface.

### Result-state rules

- `grounded` means the canonical packet contains inspectable support for the surfaced conclusion and no hidden material gap that would change the trust story.
- `partial` means the canonical packet contains useful grounded evidence but also explicit gaps, ambiguity, degraded coverage, or hit bounds.
- `insufficient` means the request is in scope but the current evidence is too weak or ambiguous for a safe packet-level conclusion.
- `unsupported` means the request, target shape, capability boundary, or requested depth is outside the bounded contract.
- TypeScript must preserve these states rather than compensating with secondary packet assembly.

### Retrieval-only and mixed-source rules

- Retrieval-backed content may appear inside a canonical packet when that is truthful for the touched flow.
- Retrieval-backed content must not be presented as parser/graph proof when parser/graph proof is absent.
- Mixed-source packets must keep source-family limits explicit enough that an operator or reviewer can tell what is grounded, what is partial, and why.

## Acceptance Expectations

- A reviewer should be able to inspect the same request across raw bridge payload, TS brain/workflow consumption, and final surfaced output and see one canonical Rust evidence story.
- A grounded result on a touched flow should always have a canonical Rust packet with inspectable support.
- A degraded result on a touched flow should always preserve the gap, bound, or unsupported reason instead of replacing it with stronger TS-composed certainty.

## Acceptance Criteria Matrix

- **AC1** — **Given** a touched broad-understanding or prompt/context flow on the current product path, **when** that flow needs an aggregated evidence packet, **then** it uses the first-class Rust `query.buildEvidence` surface and treats the Rust packet as the canonical evidence truth.
- **AC2** — **Given** a touched flow receives a canonical Rust evidence packet, **when** TypeScript consumes it, **then** the surfaced packet truth for evidence entries, gaps, bounds, confidence, and stop reasons remains inspectable and is not replaced by a TS-authored competing packet.
- **AC3** — **Given** retrieval/search preview items, shared TS evidence types, or retrieval-built packet-like data are also available, **when** a touched flow builds its final product output, **then** those surfaces are supplementary only and do not become the authoritative evidence packet or upgrade Rust-authored truth.
- **AC4** — **Given** Rust can truthfully build a canonical packet for a supported in-scope request, **when** an operator or reviewer inspects the touched flow, **then** the packet contains non-empty inspectable support for the surfaced conclusion plus explicit bounds and confidence signals appropriate to the result.
- **AC5** — **Given** a canonical packet contains material ambiguity, degraded coverage, or configured bounds, **when** the touched flow surfaces that result, **then** the result is `partial` and keeps the useful grounded portion plus the limiting gaps/bounds visible.
- **AC6** — **Given** a request is within the bounded contract but current indexed evidence cannot support a safe packet-level conclusion, **when** `query.buildEvidence` is used on a touched flow, **then** the surfaced result is `insufficient` with an explicit missing-proof explanation and TypeScript does not synthesize a stronger packet from secondary truth.
- **AC7** — **Given** a request asks for runtime behavior, unsupported language/capability coverage, unbounded subsystem reasoning, or other out-of-scope evidence building, **when** the touched flow handles that request, **then** it returns `unsupported` explicitly and does not fabricate a canonical packet or hide a fallback path as supported truth.
- **AC8** — **Given** retrieval-backed or mixed-source evidence appears inside a canonical packet, **when** the packet is inspected on a touched flow, **then** source-family limits remain explicit and retrieval-backed support is not presented as parser/graph proof where such proof is absent.
- **AC9** — **Given** the touched product path uses a packet-level summary or serialized evidence narrative for prompt/context or operator output, **when** that summary is surfaced or consumed, **then** it is Rust-authored or a lossless formatting of Rust-authored packet truth and does not introduce new claims.
- **AC10** — **Given** legacy retrieval-side packet builders or shared TS packet types remain in the repository, **when** reviewers inspect the touched product flow after this feature ships, **then** those legacy surfaces are no longer the authoritative evidence truth for that flow.
- **AC11** — **Given** reviewers or QA compare the same touched request across bridge output, TS workflow consumption, and surfaced product output, **when** they inspect the evidence story, **then** all claims trace back to one canonical Rust packet without contradictory second-truth assembly in TypeScript.
- **AC12** — **Given** the completed scope package, **when** Solution Lead begins design, **then** the touched aggregated-evidence flows, ownership rules, degraded-state behavior, bounded support, and non-authoritative legacy packet surfaces are explicit enough to design without rediscovering product intent.

## Edge Cases And Risks

- A canonical packet contains both parser/graph-backed evidence and retrieval-backed evidence for the same touched flow.
- A broad-understanding request is in scope but resolves to multiple plausible targets, leaving packet construction ambiguous.
- Packet construction reaches configured hop, node, snippet, or size budgets after collecting some useful evidence.
- The index is present but not fresh enough for a truthful grounded packet.
- A touched flow has access to narrow per-query answers and legacy retrieval packet builders at the same time.
- A touched flow needs only part of the canonical packet for presentation, but reviewers still need the full packet truth to remain inspectable.
- A packet-level summary exists, but raw evidence entries reveal a weaker trust story; the surfaced result must follow the weaker truthful story.
- Primary delivery risk: implementation drifts into “replace all query surfaces with buildEvidence” instead of the smaller truthful first-wave aggregated-evidence scope.
- Primary product risk: broad-understanding requests sound universally supported unless unsupported and insufficient handling remain explicit.

## Error And Failure Cases

- The feature fails if TypeScript still acts as a competing authoritative evidence packet builder on a touched flow.
- The feature fails if a touched flow presents a grounded-looking result without a canonical Rust packet containing inspectable support.
- The feature fails if retrieval-side logic, preview rows, or shared TS evidence types silently replace Rust packet truth on a touched product flow.
- The feature fails if gaps, bounds, ambiguity, or unsupported boundaries are omitted in ways that make the result look stronger than it is.
- The feature fails if a packet-level summary or prompt/context narrative introduces claims that are stronger than the Rust-authored packet truth.
- The feature fails if the product implies universal reasoning, unlimited graph understanding, or runtime-trace proof in order to justify the new build-evidence flow.
- The feature fails if solution work broadens into unrelated query-catalog, language-parity, retrieval-redesign, or topology-redesign scope.

## Open Questions

- None blocking at Product Lead handoff.
- Required Solution Lead clarification, not a blocker: identify the smallest complete first-wave list of touched aggregated-evidence flows on the current TS product path and keep the implementation limited to those flows plus their necessary bridge/app consumers.

## Success Signal

- The current TS brain path can consume canonical Rust evidence packets for touched aggregated-evidence flows without assembling a rival packet from retrieval-side logic.
- Reviewers can inspect one consistent evidence story across Rust output, TS consumption, and surfaced product behavior.
- Grounded, partial, insufficient, and unsupported behavior remain honest and bounded.
- The product can truthfully say: Rust decides the packet; TS decides how to use it.
- The repository moves closer to the documented Rust-owned evidence-builder architecture without expanding into unrelated redesigns or inflated intelligence claims.

## Handoff Notes For Solution Lead

- Preserve the architecture boundary exactly:
  - Rust = canonical evidence packet truth, assembly, gaps, bounds, confidence, and packet-level summary/serialization when included
  - TypeScript = routing, prompt/context consumption, presentation, and workflow behavior only
- Start from current repo reality:
  - Rust already has evidence packet types and evidence-bearing query results.
  - the docs already define `query.buildEvidence` as the preferred coarse-grained contract.
  - current TS app surfaces do not yet expose that contract as a first-class product flow.
  - TS-side retrieval packet builders and shared packet shapes still exist and can act like a second truth source.
- Prefer the smallest truthful implementation path that makes `query.buildEvidence` first-class on the touched aggregated-evidence flows; do not replace every narrow query surface unless a touched flow truly requires it.
- Make the first-wave touched flows explicit in the solution package.
- Preserve these hard boundaries:
  - no TS-authored canonical fallback packet on touched flows
  - no universal or unlimited semantic claims
  - no runtime-trace or live-execution claims
  - no unrelated query-catalog or language-parity expansion
- The solution package should explicitly define:
  - the touched aggregated-evidence flows on the current product path
  - the canonical Rust packet fields and minimum inspectability needed on those flows
  - how degraded, insufficient, and unsupported packet states surface end to end
  - how legacy retrieval-side packet builders are demoted or isolated from product-authoritative use on touched flows
