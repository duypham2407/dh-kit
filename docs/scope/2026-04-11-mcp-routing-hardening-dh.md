# Scope Package: MCP Routing Hardening (DH)

Date: 2026-04-11
Owner: DH app/runtime team
Execution driver:
- `docs/opencode/mcp-selective-port-mapping-analysis-dh.md`

---

DH already has a minimal MCP routing baseline, but the current registry, planner, enforcer, and Go hook are too thin to make reliable routing decisions when availability, auth requirements, or fallback behavior matter. This scope defines the next selective-port task as a routing hardening effort only: improve MCP selection correctness, explainability, auth/status awareness, and degrade behavior in DH without copying the full upstream MCP manager, OAuth subsystem, or lifecycle stack.

## Problem Statement

- DH currently routes MCPs from thin metadata and simple heuristics:
  - `mcp-registry.ts` is static and priority/tag driven.
  - `choose-mcps.ts` filters and sorts, but does not model runtime state, auth readiness, or rejection reasons.
  - `enforce-mcp-routing.ts` is effectively passthrough.
  - `mcp_routing.go` contains a very small hardcoded intent mapping.
- This creates practical routing risks:
  - MCPs can be selected without enough context about availability or auth preconditions.
  - Routing decisions are hard to explain or audit.
  - Fallback behavior is not standardized when a preferred MCP is not usable.
  - TypeScript and Go routing behavior can drift because they do not share a clear decision contract.
- The value of this work is safer and more predictable MCP selection for DH lanes and execution paths, not upstream feature parity.

## Current State vs Target State

| Dimension | Current state in DH | Target state for this scope |
|---|---|---|
| Registry metadata | Static metadata: name, lane, role, tags, priority | Registry also carries routing-relevant metadata such as capabilities, auth requirement, fallback chain, and health class |
| Planner behavior | Filter/sort only | Planner returns structured routing decisions with selected MCPs plus reason and rejection data |
| Enforcement | Passes through planner output | Enforcement checks preconditions, applies degrade/fallback policy, and records final decision rationale |
| Runtime status awareness | No MCP status model | Minimal status model exists for routing use: available, degraded, needs_auth, unavailable |
| Auth awareness | No auth-aware routing semantics | Routing can distinguish MCPs that require auth from MCPs that are immediately usable |
| TS/Go contract | Shared only by MCP names and loose logic alignment | Shared minimal routing contract for allow/warn/decision semantics |
| Upstream parity | Not present | Still not a goal; DH remains selective and limited to routing hardening |

## In Scope

1. **Routing contract hardening**
   - Define a minimal routing decision contract for DH.
   - Define reason/rejection codes or equivalent explainability semantics.
   - Preserve backward compatibility where existing callers still expect a plain selected-list shape.

2. **Registry metadata expansion for routing**
   - Extend MCP registry entries with only the metadata needed for better routing decisions.
   - Candidate metadata includes capabilities, `requiresAuth`, fallback/degrade chain, and health class.

3. **Planner hardening**
   - Upgrade MCP selection from simple filtering to context-aware selection/scoring.
   - Incorporate lane, role, intent class, and runtime condition inputs where available.
   - Return both selected MCPs and machine-readable reasons for selected/rejected candidates.

4. **Executor enforcement hardening**
   - Turn enforcement into a real gate that validates routing preconditions.
   - Apply degrade/fallback policy when a preferred MCP is not eligible.
   - Emit an auditable final routing result with reasons.

5. **Minimal auth/status-aware routing support**
   - Add only the minimal status/auth abstraction needed for routing correctness.
   - Include a minimal status vocabulary for MCP availability and auth readiness.
   - Include server-bound credential/status semantics only if needed for routing safety.

6. **Go hook alignment**
   - Align the Go hook contract with the TypeScript routing decision semantics at a minimal level.
   - Reduce reliance on the current narrow hardcoded browser-vs-default behavior.

7. **Validation and documentation alignment**
   - Validate routing behavior across representative lane/role/intent combinations.
   - Keep implementation and scope/analysis docs aligned with the actual DH state.

## Out of Scope

- Copying the whole upstream MCP subsystem.
- Copying upstream Effect/Layer/state-management patterns.
- Implementing full MCP lifecycle parity such as connect/disconnect/watch/prompts/resources aggregation.
- Implementing full interactive OAuth callback server behavior in this scope.
- Mirroring upstream storage contracts or file formats such as `mcp-auth.json`.
- Replacing DH architecture with an upstream-style MCP manager.
- Broad tool catalog changes unrelated to routing/auth/status/fallback hardening.

## Business Rules and Scope Boundaries

1. **Selective-port only** — upstream is reference input, not a blueprint to mirror.
2. **Routing-first** — this work hardens routing correctness and explainability before any larger MCP lifecycle ambitions.
3. **Minimal auth/status** — auth and status support is only in scope to improve routing decisions; not to deliver full auth product parity.
4. **Thin-DH reality must stay explicit** — the scope must preserve that DH registry/planner/enforcer are currently thin and are being hardened incrementally.
5. **TS/Go semantics must not conflict** — if both layers participate in routing, their minimal decision contract must stay aligned.
6. **No subsystem mirror** — any proposal that expands into whole-manager parity is outside this scope unless separately approved.

## Acceptance Criteria

| # | Acceptance criterion | Observable completion signal |
|---|---|---|
| AC-1 | DH has a documented minimal MCP routing decision contract that includes selected MCPs and explainability semantics | Planner/enforcer interfaces or equivalent docs expose a structured decision shape rather than only a raw list |
| AC-2 | MCP registry entries include the minimum additional metadata required for routing/auth/status/fallback decisions | Registry supports fields for capability/precondition/fallback decisions without becoming a full lifecycle manager |
| AC-3 | Planner behavior uses more than lane/role/tag filtering and can account for runtime routing context | Routing decisions differ appropriately based on lane, role, intent class, or MCP status/auth state where relevant |
| AC-4 | Planner output includes machine-readable reasons for selected and rejected MCP candidates | A routing decision can explain why an MCP was selected, deprioritized, or rejected |
| AC-5 | Executor enforcement validates routing preconditions and applies fallback/degrade behavior when required | When a preferred MCP is unavailable or blocked by auth/status, enforcement chooses an allowed fallback or returns a clear warning/result |
| AC-6 | DH defines and uses a minimal MCP status vocabulary suitable for routing | Routing can distinguish at least available, degraded, needs_auth, and unavailable cases |
| AC-7 | Auth-aware routing does not require full OAuth subsystem parity | MCPs requiring auth are routed differently from immediately usable MCPs without introducing whole interactive auth manager behavior |
| AC-8 | Go hook behavior is aligned to the minimal routing contract and no longer relies only on the current narrow hardcoded intent split | Hook outputs can express allow/warning or equivalent routing guidance consistent with app-layer routing semantics |
| AC-9 | Validation covers representative lane × role × intent cases plus unavailable/needs-auth fallback cases | Evidence shows routing behavior for normal selection, auth-blocked selection, degraded selection, and fallback selection |
| AC-10 | Delivered work does not become a whole-subsystem mirror of upstream MCP management | Implementation remains limited to routing/auth/status/fallback hardening and does not add full lifecycle parity surfaces |

## Risks and Assumptions

### Risks

| Risk | Why it matters | Required mitigation |
|---|---|---|
| Scope creep into full MCP manager parity | Would increase cost and blur the selective-port goal | Review each slice against the out-of-scope list before completion |
| Contract drift between TS and Go | Could cause inconsistent allow/deny/warn behavior | Define one minimal routing contract and validate both layers against it |
| Overdesigning auth support | Could drag the work into full OAuth implementation | Limit auth changes to routing-visible status/precondition semantics |
| Registry bloat without clear value | Could add metadata that is never used | Only add fields directly used by planner or enforcement decisions |
| Fallback policy hides real failures | Could make MCP problems harder to diagnose | Require explicit reason codes and audit output for fallback decisions |

### Assumptions

1. `docs/opencode/mcp-selective-port-mapping-analysis-dh.md` is the authoritative analysis input for this scope.
2. DH's current MCP registry/planner/enforcer are intentionally thin and should be hardened incrementally.
3. The immediate product need is better routing/auth/status/fallback behavior, not full upstream MCP subsystem parity.
4. Any deeper auth lifecycle or whole-manager capabilities require separate approval if they become necessary.

## Execution Sequencing Expectations

### Required sequence
1. **Phase 0 — Contract and baseline confirmation**
   - Confirm current DH MCP surfaces and callers.
   - Define the minimal routing decision contract and explainability vocabulary.

2. **Phase 1 — Registry and planner hardening**
   - Add minimal routing metadata to the registry.
   - Upgrade planner output to include selected/rejected reasoning.
   - Preserve compatibility for existing callers as needed.

3. **Phase 2 — Enforcement and fallback hardening**
   - Make enforcement validate preconditions and apply degrade/fallback rules.
   - Produce auditable final routing decisions.

4. **Phase 3 — Minimal auth/status-aware routing**
   - Add the smallest status/auth abstraction needed for routing.
   - Bind auth/status semantics to routing decisions without delivering full OAuth parity.

5. **Phase 4 — Go hook alignment and validation**
   - Align Go hook outputs with the shared minimal contract.
   - Validate lane/role/intent/fallback behavior and update docs/evidence.

### Hard sequencing rules
- Do not begin with full auth flow or lifecycle-manager work.
- Do not add fallback logic before the routing decision contract is defined.
- Do not claim auth-aware routing parity with upstream.
- Do not mark the task complete unless validation covers status/auth/fallback scenarios, not just happy-path selection.

## Handoff Notes for Solution Lead

- Preserve the framing: this is a **routing hardening** task, not an MCP subsystem rebuild.
- Keep solution design centered on registry -> planner -> enforcer -> Go hook alignment.
- Use the analysis document as the architectural reference, but convert it into the smallest executable design that improves routing correctness.
- Treat explainability, fallback behavior, and minimal auth/status semantics as first-class acceptance hotspots.
