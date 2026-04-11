# Solution Package: MCP Routing Hardening (DH)

**Date:** 2026-04-11
**Approved scope:** `docs/scope/2026-04-11-mcp-routing-hardening-dh.md`
**Analysis input:** `docs/opencode/mcp-selective-port-mapping-analysis-dh.md`

---

## Recommended Path

Harden MCP routing in place around DH's existing TypeScript policy path and SQLite/Go bridge, in this sequence:

1. **Define one structured routing-decision contract and keep list-return adapters**
2. **Expand registry metadata only where planner/enforcer will consume it**
3. **Move fallback/precondition handling into executor enforcement**
4. **Add minimal status/auth inputs only for routing-visible decisions**
5. **Align the Go bridge and hook payload decoding to the same narrowed semantics**

This is enough because DH already has the right seams for selective hardening rather than subsystem replacement:

- `packages/opencode-app/src/registry/mcp-registry.ts`
- `packages/opencode-app/src/planner/choose-mcps.ts`
- `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
- `packages/opencode-sdk/src/client/mcp-client.ts`
- `packages/opencode-core/internal/bridge/sqlite_reader.go`
- `packages/opencode-core/internal/hooks/mcp_routing.go`
- `packages/opencode-core/internal/llm/agent/mcp-tools.go`

The missing work is routing semantics, explainability, fallback behavior, and thin auth/status awareness — not a full upstream MCP manager, transport lifecycle, or OAuth callback subsystem.

---

## Repository Reality Constraints

1. **Planner and enforcer are intentionally thin today.**
   - `chooseMcps()` currently returns `string[]` from lane/role/tag filtering.
   - `enforceMcpRouting()` is passthrough.

2. **The Go side still consumes a narrow priority/blocklist shape.**
   - `GetMcpTools()` only needs ordered MCP names plus blocked names.
   - Any richer contract must be projected down to this shape for runtime compatibility.

3. **The current SQLite bridge only reads MCP names, not richer routing payload.**
   - `BridgeMcpRoutingHook()` uses `LatestMcps()`.
   - `LatestMcps()` currently decodes `mcps` / `active_mcps` only.

4. **DH already has audit persistence for hook decisions and per-MCP route records.**
   - `hook_invocation_logs` stores structured hook payloads.
   - `mcp_route_audit` stores one `route_reason` string per selected MCP.
   - The solution should reuse these before inventing a new audit subsystem.

5. **Repo-native validation commands exist for TypeScript, not a guaranteed Go build/test command.**
   - Available commands:
     - `npm run check`
     - `npm run test`
   - Go-facing verification should therefore rely on repository tests already wired into the current test suite and optional smoke verification only when the Go binary is already present.

---

## Architecture Decisions

### AD-1: TypeScript remains the routing policy source of truth; Go consumes a narrowed projection

Routing policy should continue to live in `packages/opencode-app`, where lane/role/intent logic already exists. The Go runtime should keep consuming only the runtime projection it needs:

- ordered MCP priority list
- blocked MCP list
- optional warnings/reason text via bridge payloads and audit logs

This avoids duplicating routing logic in Go while still preventing TS/Go semantic drift.

### AD-2: Introduce a structured routing decision, but preserve string-list compatibility during rollout

Add a new decision contract for planner/enforcer work, but keep current callers working through adapters.

Recommended TS contract shape:

```ts
type McpRoutingStatus = "available" | "degraded" | "needs_auth" | "unavailable";

type McpReasonCode =
  | "lane_match"
  | "role_match"
  | "intent_match"
  | "capability_match"
  | "priority_boost"
  | "requires_auth"
  | "needs_auth"
  | "status_unavailable"
  | "status_degraded"
  | "fallback_applied"
  | "blocked_by_precondition"
  | "no_runtime_status"
  | "no_auth_context";

type McpRoutingDecision = {
  selected: string[];
  blocked: string[];
  warnings: string[];
  reasons: Record<string, McpReasonCode[]>;
  rejected: Record<string, McpReasonCode[]>;
};
```

Compatibility rule:

- `chooseMcps()` may remain as the string-list adapter temporarily.
- add a new structured resolver underneath it.
- `enforceMcpRouting()` may continue returning `string[]` to workflow callers while a new enforcement function returns the full decision.

### AD-3: Registry metadata stays policy-driven, not lifecycle-driven

Expand registry entries only with metadata that directly affects routing decisions:

- `capabilities: string[]`
- `requiresAuth?: boolean`
- `supportsInteractiveAuth?: boolean`
- `degradeTo?: string[]`
- `healthClass?: "critical" | "standard" | "best_effort"`

Do **not** add upstream-style connection state machines, transport descriptors, prompt/resource aggregation, or per-server lifecycle callbacks to the registry.

### AD-4: Planner scores eligibility; executor applies preconditions and fallback

Keep responsibilities distinct:

- **planner** decides candidate ranking and explainability
- **executor** decides if a candidate is actually usable now
- **executor** applies fallback/degrade behavior and emits the final auditable result

This avoids burying runtime availability/auth rules inside planner heuristics.

### AD-5: Auth/status support is a thin input surface, not a full auth subsystem

Status/auth awareness should enter the routing path through a small abstraction, not through a copied upstream lifecycle manager.

Recommended first-step interface:

```ts
type McpRuntimeSnapshot = Record<string, {
  status: McpRoutingStatus;
  serverKey?: string;
  authReady?: boolean;
}>;
```

This can initially be optional and locally computed. Interactive auth remains out of scope.

### AD-6: Server-bound credential semantics should be preserved conceptually if auth metadata lands

If DH introduces any auth-status lookup in this scope, its lookup key should be bound to MCP name plus server identity, not MCP name alone. The scope does **not** require upstream file-format parity, but it should preserve the safety property that credentials do not silently bleed across server URL changes.

### AD-7: Audit reuse beats new storage in this milestone

Use existing surfaces before adding tables:

- `hook_invocation_logs` for full routing decision payloads
- `mcp_route_audit` for per-selected-MCP route reasons

Schema changes are not required for Milestones 1-3 unless structured audit queries prove impossible with the current payloads.

---

## Impacted Surfaces

### Existing files to modify

| File | Why it changes |
|---|---|
| `packages/opencode-app/src/registry/mcp-registry.ts` | Expand registry metadata beyond tags/priority |
| `packages/opencode-app/src/planner/choose-mcps.ts` | Split current list-return helper from structured routing resolver |
| `packages/opencode-app/src/executor/enforce-mcp-routing.ts` | Turn passthrough into precondition/fallback enforcement |
| `packages/opencode-app/src/workflows/workflows.test.ts` | Preserve current list-return compatibility for workflow callers |
| `packages/opencode-sdk/src/types/hook-decision.ts` | Expand `McpRoutingPayload` to carry blocked/warnings/reasons/rejections as optional fields |
| `packages/opencode-sdk/src/client/mcp-client.ts` | Write the richer routing payload into `hook_invocation_logs` |
| `packages/opencode-core/internal/bridge/sqlite_reader.go` | Decode richer MCP routing output, including blocked MCPs and optional warnings when present |
| `packages/opencode-core/internal/hooks/bridge_more_hooks.go` | Project bridge payload back into Go hook priority/blocklist behavior |
| `packages/opencode-core/internal/hooks/mcp_routing.go` | Update default fallback semantics to match the new minimal contract |
| `packages/opencode-core/internal/hooks/skill_mcp_bridge_integration_test.go` | Verify bridge behavior for selected/blocklist fallback cases |
| `packages/opencode-core/internal/bridge/sqlite_reader_skills_mcps_test.go` | Verify richer `mcp_routing` payload decoding |
| `packages/opencode-core/internal/dhhooks/dhhooks_test.go` | Preserve default/nil-hook behavior and envelope forwarding |
| `packages/runtime/src/workflow/workflow-audit-service.ts` | Optionally record per-selected final route reasons from the enforcer result |
| `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts` | May remain unchanged; reviewer should confirm current `route_reason` string is sufficient |

### New modules recommended

| File | Responsibility |
|---|---|
| `packages/opencode-app/src/planner/mcp-routing-types.ts` | Shared routing-decision types and reason-code vocabulary |
| `packages/opencode-app/src/registry/mcp-routing-policy.ts` | Registry-based scoring and precondition helper functions |
| `packages/opencode-app/src/planner/choose-mcps.test.ts` | Planner scoring/reason/rejection tests |
| `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts` | Fallback/auth/status enforcement tests |
| `packages/opencode-app/src/auth/mcp-auth-status.ts` | Optional thin status/auth snapshot provider for routing-only use |

### Deferred unless required by implementation evidence

| File | Why deferred |
|---|---|
| `packages/storage/src/sqlite/db.ts` | No schema change is required unless current audit payloads prove insufficient |
| `packages/shared/src/types/audit.ts` | Current `routeReason: string` is usable for milestone-one reason capture |
| `packages/opencode-core/internal/llm/agent/mcp-tools.go` | Existing priority/blocklist application is already adequate if upstream hook payloads are projected correctly |

---

## Technical Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Contract drift between TS decision shape and Go bridge decoding | Runtime ordering/blocking may differ from planner intent | Introduce one payload vocabulary in `mcp-routing-types.ts` and mirror only the narrowed fields into SDK/Go bridge decoding |
| Registry metadata grows faster than enforcement uses it | Complexity without routing value | Require every added field to be referenced by planner or executor logic in the same milestone |
| Fallback hides real MCP problems | Silent degrade makes debugging harder | Require reason codes and warning strings for every fallback/block decision |
| Auth support expands into OAuth implementation | Scope creep and infrastructure drag | Keep auth to `requiresAuth`, `authReady`, `needs_auth`, and optional server-bound key lookup only |
| First milestone breaks current workflow callers | `workflows.test.ts` currently expects string-list behavior | Keep adapter returns until all direct callers are moved to structured decisions |

---

## Phased Implementation Plan

### Phase 0: Contract freeze and compatibility seam

- **Goal:** Define the minimal routing decision contract and lock rollout boundaries before behavior changes.
- **Primary files:**
  - `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - `packages/opencode-sdk/src/types/hook-decision.ts`
- **Work:**
  - introduce `McpRoutingDecision`, `McpRoutingStatus`, and reason-code vocabulary
  - preserve `chooseMcps(envelope, intent): string[]` as an adapter
  - expand SDK payload types so richer routing results can be serialized without breaking old readers
- **Dependency:** none
- **Validation hook:**
  - `npm run check`
  - targeted test coverage through new planner tests and existing workflow tests via `npm run test`

### Phase 1: Registry and planner hardening

- **Goal:** Make selection context-aware and explainable before enforcement begins rejecting MCPs.
- **Primary files:**
  - `packages/opencode-app/src/registry/mcp-registry.ts`
  - `packages/opencode-app/src/registry/mcp-routing-policy.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - `packages/opencode-app/src/planner/choose-mcps.test.ts`
- **Work:**
  - add minimal registry metadata: capabilities, auth requirement, fallback chain, health class
  - upgrade intent handling from raw tag-only filtering to scored candidate selection
  - return selected and rejected candidates with machine-readable reason codes
  - keep adapter output stable for existing list-based callers
- **Dependency:** Phase 0
- **Validation hook:**
  - `npm run check`
  - `npm run test`

### Phase 2: Enforcement and fallback hardening

- **Goal:** Turn executor routing into the authoritative final gate.
- **Primary files:**
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/opencode-sdk/src/client/mcp-client.ts`
- **Work:**
  - evaluate preconditions from planner candidates
  - block or degrade MCPs based on runtime status/auth readiness
  - apply fallback chain from registry metadata
  - emit final selected list, blocked list, warnings, reasons, and rejected causes into hook/audit outputs
- **Dependency:** Phase 1
- **Validation hook:**
  - `npm run check`
  - `npm run test`
  - reviewer confirms every fallback path emits explicit reasoning

### Phase 3: Minimal auth/status-aware routing

- **Goal:** Add only the minimum runtime signal needed for correct routing.
- **Primary files:**
  - `packages/opencode-app/src/auth/mcp-auth-status.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/planner/choose-mcps.test.ts`
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`
- **Work:**
  - define the minimal status vocabulary: `available`, `degraded`, `needs_auth`, `unavailable`
  - provide an optional runtime snapshot lookup for enforcer use
  - distinguish immediately usable MCPs from auth-blocked MCPs without adding interactive auth flows
  - preserve server-bound credential/status keying if any auth lookup is introduced
- **Dependency:** Phase 2
- **Validation hook:**
  - `npm run check`
  - `npm run test`
  - manual evidence review of `needs_auth` and `unavailable` fallback cases via stored hook payloads

### Phase 4: Go hook alignment and bridge verification

- **Goal:** Ensure the Go runtime consumes the hardened contract without semantic drift.
- **Primary files:**
  - `packages/opencode-core/internal/bridge/sqlite_reader.go`
  - `packages/opencode-core/internal/hooks/bridge_more_hooks.go`
  - `packages/opencode-core/internal/hooks/mcp_routing.go`
  - `packages/opencode-core/internal/hooks/skill_mcp_bridge_integration_test.go`
  - `packages/opencode-core/internal/bridge/sqlite_reader_skills_mcps_test.go`
- **Work:**
  - decode richer MCP routing payload fields from SQLite bridge logs
  - ensure blocked MCPs are honored when TS decisions exist
  - align default Go fallback behavior with the updated minimal contract
  - preserve nil/default behavior when no TS-side routing record exists
- **Dependency:** Phase 3 for full semantics; may begin after Phase 2 for selected/blocked alignment
- **Validation hook:**
  - `npm run check`
  - `npm run test`
  - optional `dh --run-smoke` only if the Go binary is already available in the local repo state

### Phase 5: Audit hardening and delivery closeout

- **Goal:** Make routing behavior inspectable enough for review and QA.
- **Primary files:**
  - `packages/runtime/src/workflow/workflow-audit-service.ts`
  - `packages/storage/src/sqlite/repositories/mcp-route-audit-repo.ts`
  - docs updates only if implementation changes the expected payload shape materially
- **Work:**
  - ensure final route reasons are written consistently for selected MCPs
  - confirm blocked/fallback reasoning is visible via `hook_invocation_logs`
  - document any payload key additions required by bridge readers
- **Dependency:** Phases 2-4
- **Validation hook:**
  - `npm run test`
  - manual inspection of representative audit rows in test fixtures or runtime evidence

---

## Dependency Graph

- **Sequential path:** Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5
- **Why sequential:** fallback logic depends on the structured contract; auth/status checks depend on executor enforcement; Go alignment should consume the stabilized payload rather than a moving intermediate shape.
- **Parallel-safe work:**
  - planner tests and executor tests can be developed in parallel once the shared routing types are frozen
  - Go bridge test updates can begin once the output payload shape is fixed in Phase 2
- **Critical path:** define the decision contract first, then make enforcement authoritative, then align Go to the same narrowed contract.

---

## Validation Strategy

## Repo-native commands

- `npm run check`
- `npm run test`

These are the only repo-native validation commands that should be claimed as standard in this package.

## Validation matrix

| Target | Validation path |
|---|---|
| Structured planner output exists | Type-level compilation plus planner unit tests |
| Existing workflow callers remain compatible | `packages/opencode-app/src/workflows/workflows.test.ts` via `npm run test` |
| Selected/rejected reason coverage | planner and executor tests assert machine-readable reason codes |
| Fallback when preferred MCP unavailable | executor tests for `unavailable -> degradeTo` transitions |
| Auth-blocked routing | executor tests for `requiresAuth` + `needs_auth` behavior |
| Go bridge honors selected/blocked projection | bridge integration tests under current test suite |
| Default behavior with no TS decision remains safe | `dhhooks` and bridge fallback tests |
| Audit payload remains inspectable | manual review of hook payload fixtures and route audit strings in test evidence |

## Required representative cases

At minimum, the implementation should prove these cases:

1. **Normal codebase routing** — `augment_context_engine` selected with explainable reasons
2. **Browser intent routing** — `chrome-devtools` / `playwright` ranked appropriately by lane/role
3. **Auth-blocked preferred MCP** — preferred MCP rejected with `needs_auth`, fallback selected if configured
4. **Unavailable preferred MCP** — fallback chain applied with explicit `fallback_applied` reason
5. **Degraded MCP** — degraded MCP can still be selected only when policy allows it and warning is emitted
6. **No runtime status present** — routing remains functional with explicit `no_runtime_status` or equivalent warning semantics

---

## Compatibility Boundaries

1. **Do not break existing string-list consumers in the first milestone.**
   - `chooseMcps()` and `enforceMcpRouting()` may keep list-return adapters until all direct callers are migrated.

2. **Do not require new MCP server config formats for this task.**
   - Current `config.Get().MCPServers` usage in Go remains the transport/config source of truth.

3. **Do not require Go runtime hook signature changes for milestone one.**
   - The bridge can project richer TS decisions back into the existing priority/blocklist shape.

4. **Do not add schema changes unless audit evidence shows they are necessary.**
   - Existing hook payload storage is sufficient for the planned decision contract.

5. **Do not require interactive auth to claim auth-aware routing.**
   - Minimal auth readiness semantics are enough for this scope.

---

## Out-of-Scope Boundaries

The following remain explicitly out of scope for this solution package:

- whole-subsystem parity with upstream MCP manager behavior
- connection lifecycle management (`connect`, `disconnect`, watcher/event bus behavior)
- prompt/resource aggregation or tool-list watching
- full interactive OAuth callback server implementation
- storage or file-format parity with upstream `mcp-auth.json`
- upstream Effect/Layer/InstanceState architecture import
- broad MCP catalog expansion unrelated to routing/auth/status/fallback hardening

---

## Fallback Path if Auth/Status Integration Is Partial in Milestone 1

If live auth/status integration is not ready in the first milestone, ship routing hardening in a controlled partial mode rather than blocking the whole feature.

### Partial-mode rules

1. **Registry metadata and structured decisions still ship.**
   - planner explainability and fallback metadata are still valuable without live auth/status lookup.

2. **Runtime status input becomes optional.**
   - when no runtime snapshot exists, the enforcer should treat MCP status as unknown rather than unavailable.
   - emit `no_runtime_status` or equivalent warning reason instead of hard-blocking.

3. **`requiresAuth` only blocks on explicit auth-not-ready evidence.**
   - if the runtime snapshot says `needs_auth`, block or degrade.
   - if there is no runtime auth signal yet, do not pretend auth is ready; instead warn and prefer non-auth alternatives when they exist.

4. **Fallback remains deterministic.**
   - if a non-auth fallback exists in `degradeTo`, prefer it.
   - if no safe fallback exists, return the narrowed selected set plus warning output instead of forcing an auth-only MCP.

5. **Go projection stays simple.**
   - selected MCPs still become the priority list.
   - explicitly blocked MCPs become the blocked list.
   - warning semantics remain in audit payloads until a later approved surface needs them elsewhere.

This fallback path preserves routing correctness improvements while keeping auth/status integration incremental and honest.

---

## Reviewer and QA Focus

### Fullstack implementer must preserve

- current workflow compatibility for string-list callers during transition
- selective-port scope discipline
- TS-first policy ownership with Go as runtime projection
- explicit reason codes for fallback/blocking decisions

### Code reviewer must verify

- every new registry field is consumed by planner or enforcer logic
- executor, not planner, owns final fallback/precondition behavior
- Go bridge decodes only the stable payload it truly needs
- no full OAuth/lifecycle machinery is introduced under routing hardening language

### QA must verify

- lane × role × intent routing still behaves sensibly on current defaults
- auth-blocked and unavailable scenarios produce explicit warnings/reasons
- blocked MCPs do not leak back into Go tool ordering after bridge projection
- no milestone claims upstream parity or interactive auth support that DH does not actually implement

---

## Short Phase Summary

1. **Phase 0:** freeze one routing decision contract and preserve adapters.
2. **Phase 1:** harden registry + planner with explainable scoring.
3. **Phase 2:** make executor enforce preconditions and fallback.
4. **Phase 3:** add thin auth/status inputs for routing-only decisions.
5. **Phase 4:** align Go bridge/hook behavior to the stabilized selected/blocked semantics.
6. **Phase 5:** harden audit visibility for review and QA.
