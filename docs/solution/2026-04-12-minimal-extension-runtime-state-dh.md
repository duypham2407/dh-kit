# Solution Package: Minimal Extension Runtime State / Fingerprint Persistence (DH)

**Date:** 2026-04-12  
**Approved scope:** `docs/scope/2026-04-12-minimal-extension-runtime-state-dh.md`  
**Analysis input:** `docs/opencode/minimal-extension-runtime-state-fingerprint-persistence-analysis-dh.md`

---

## Recommended Path

Implement a **small persisted runtime-state slice** around DH's existing extension contract and MCP-style registry/executor path:

1. define one minimal fingerprint derivation from stable extension contract fields
2. store the prior fingerprint in one bounded persistence surface
3. classify runtime state as `first`, `same`, or `updated`
4. surface the result only as lightweight runtime observability at the executor/enforcement boundary

This is enough because DH already has the right architecture seams for a narrow follow-on:

- `packages/opencode-sdk/src/types/extension-contract.ts` already freezes the runtime-state vocabulary
- `packages/opencode-app/src/registry/mcp-registry.ts` already provides stable extension metadata inputs
- `packages/opencode-app/src/planner/choose-mcps.ts` and `packages/opencode-app/src/executor/enforce-mcp-routing.ts` already separate planning from enforcement
- `packages/runtime/src/session/` already contains runtime persistence precedents, including persistence that degrades without breaking the main flow

**Explicit boundary:** this work is **minimal runtime state / fingerprint persistence only**. It is **not** plugin-platform parity, **not** a full metadata subsystem, and **not** broader extension lifecycle expansion.

---

## Repository Reality Constraints

1. **The boundary type already exists.**
   - `packages/opencode-sdk/src/types/extension-contract.ts` already defines `ExtensionRuntimeState = "first" | "updated" | "same"`.
   - The gap is runtime wiring and persistence, not contract invention.

2. **Current extension metadata is registry-driven.**
   - `packages/opencode-app/src/registry/mcp-registry.ts` stores stable fields already suitable as fingerprint inputs: `id`, `contractVersion`, `entry`, `capabilities`, `priority`, `lanes`, and `roles`.
   - DH should reuse those declared fields rather than invent a parallel metadata source.

3. **Executor enforcement is the safest consumption point.**
   - `packages/opencode-app/src/executor/enforce-mcp-routing.ts` is already where runtime availability/auth decisions are applied after planning.
   - Runtime-state classification should stay additive at this boundary instead of changing planner scoring semantics.

4. **DH already has a persistence precedent with bounded failure behavior.**
   - `packages/runtime/src/session/knowledge-command-runtime-persistence.ts` persists runtime data and rolls back/returns a structured failure without redefining the primary workflow.
   - That is the right behavioral model for this slice.

5. **Repo-native validation exists.**
   - Available commands in `package.json`: `npm run check`, `npm run test`.
   - The solution should rely on those commands plus targeted Vitest coverage.

---

## Architecture Decisions

### AD-1: Keep the SDK boundary unchanged; add app/runtime implementation behind it

`ExtensionRuntimeState` already exists and should remain the external vocabulary. This task should not reopen contract hardening or add new runtime-state categories.

Allowed boundary movement:

- optional helper types for persisted state records or touch results
- optional re-export additions if a new helper type becomes part of the internal contract surface

Not allowed:

- changing `ExtensionRuntimeState` semantics
- adding new state names beyond `first`, `same`, `updated`

### AD-2: Fingerprint inputs must come from stable declared extension fields

The fingerprint should be derived from the minimum stable subset of extension metadata already present in the registry contract, specifically:

- `id`
- `contractVersion`
- `entry`
- `capabilities`
- `priority`
- `lanes`
- `roles`

Implementation should normalize collection ordering before hashing/serializing so equivalent metadata does not appear changed because of array order drift.

Explicit exclusions:

- transient runtime status such as `available` / `degraded` / `needs_auth`
- timestamps
- warnings
- auth readiness
- any future dynamic source-specific enrichment

### AD-3: Use one bounded persistence surface for extension runtime state

The persistence record should stay minimal and per-extension-id. The recommended initial record shape is:

```ts
type PersistedExtensionRuntimeRecord = {
  version: "v1";
  extensionId: string;
  fingerprint: string;
  lastSeenAt?: string;
  loadCount?: number;
};
```

And the top-level store should remain a narrow container, for example:

```ts
type ExtensionRuntimeStateStore = {
  version: "v1";
  records: Record<string, PersistedExtensionRuntimeRecord>;
};
```

The optional `lastSeenAt` and `loadCount` fields are acceptable because they support observability without widening the subsystem. They must not become branching inputs for policy in this slice.

### AD-4: Prefer a file-backed JSON store for this milestone

Although DH has SQLite-backed runtime persistence elsewhere, the approved analysis and scope both favor a minimal bounded store. For this slice, a JSON file is the simplest adequate choice if it lives behind one helper/service boundary.

Why this is enough:

- the state volume is tiny
- lookups are by extension id only
- the required behavior is compare-and-persist, not relational querying
- rollback and schema reasoning stay simple

This is a deliberate minimal choice for this scope, not a statement that DH should avoid SQLite for broader runtime data in general.

### AD-5: Classify state in one touch API and keep planner semantics unchanged

The implementation should converge on one internal API such as:

```ts
touchExtensionState(spec: ExtensionSpec): {
  state: ExtensionRuntimeState;
  fingerprint: string;
  warning?: string;
}
```

That API should:

1. derive the normalized fingerprint
2. read prior persisted state for the extension id
3. classify `first`, `same`, or `updated`
4. persist the new record
5. return a bounded warning instead of throwing when persistence fails

The result should be consumed after extension selection, not used to alter candidate ranking or lane/role eligibility in this milestone.

### AD-6: Persistence failure must degrade explicitly, not break extension flow

If the runtime-state store cannot be read, is malformed, or cannot be written:

- DH should continue the core extension flow
- the touch API should return a warning/result that makes the failure observable
- the implementation should avoid silently inventing a broader recovery subsystem

This matches the scope rule that runtime-state persistence is additive rather than a new failure amplifier.

### AD-7: Do not turn runtime state into a metadata platform

This slice must stop at:

- persisted fingerprint comparison
- `first/same/updated` classification
- lightweight observability on the execution path

This slice must not expand into:

- plugin-platform parity with upstream
- source-specific metadata enrichment
- dynamic discovery/install/publish behavior
- generalized metadata APIs
- full lifecycle/history/event subsystem work

---

## Impacted Surfaces

### Existing files likely to change

| File | Why it is in scope |
|---|---|
| `packages/opencode-sdk/src/types/extension-contract.ts` | Existing boundary type; may gain adjacent helper types or comments, but runtime-state semantics should remain unchanged |
| `packages/opencode-sdk/src/index.ts` | Re-export helper types if the implementation introduces a shared runtime-state payload/result type |
| `packages/opencode-app/src/registry/mcp-registry.ts` | Current stable source of fingerprint inputs based on declared extension metadata |
| `packages/opencode-app/src/planner/choose-mcps.ts` | Reference point to preserve current planner semantics and avoid injecting runtime-state as a ranking rule |
| `packages/opencode-app/src/executor/enforce-mcp-routing.ts` | Best existing app-layer enforcement seam to call runtime-state touch and attach lightweight warnings/observability |
| `packages/opencode-app/src/planner/mcp-routing-types.ts` | May need optional additive fields if runtime-state is exposed in a structured decision result rather than only warnings |
| `packages/opencode-app/src/registry/mcp-routing-policy.ts` | Likely place to host or reuse normalization helpers if shared registry-derived fingerprint logic is needed |
| `packages/runtime/src/session/knowledge-command-runtime-persistence.ts` | Persistence precedent for transaction/failure behavior; reference implementation for bounded result style |
| `packages/runtime/src/session/knowledge-command-session-bridge.ts` | Reference precedent for non-fatal persistence warnings returned to callers |

### New modules recommended

| File | Responsibility |
|---|---|
| `packages/runtime/src/extensions/extension-runtime-state-store.ts` | Read/write one bounded JSON store and version the persisted schema |
| `packages/runtime/src/extensions/extension-fingerprint.ts` | Normalize stable `ExtensionSpec` inputs and derive the fingerprint |
| `packages/runtime/src/extensions/touch-extension-state.ts` | Single compare/classify/persist orchestration API |
| `packages/runtime/src/extensions/extension-runtime-state-store.test.ts` | Persistence and malformed-store behavior |
| `packages/runtime/src/extensions/touch-extension-state.test.ts` | `first/same/updated` and multi-extension isolation |

### Existing tests likely to change or expand

| File | Purpose |
|---|---|
| `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts` | Confirm executor wiring remains backward-compatible while surfacing additive runtime-state output if exposed there |
| `packages/runtime/src/session/knowledge-command-runtime-persistence.test.ts` | Reference style only; validates how DH already tests bounded persistence behavior |

---

## Persistence Boundary Recommendation

## Store location

Prefer a runtime-owned path under the repository's existing managed state area, implemented behind the runtime module rather than directly in app code. The exact on-disk filename can be finalized during implementation, but it should remain:

- local to DH runtime state
- private/internal
- versioned from the start
- independent from planner-facing registry data

Recommended pattern:

- runtime package owns file path resolution
- app/executor consumes only the touch API
- registry remains read-only metadata input, not persistence owner

## Record lifecycle

For each extension load attempt at the chosen enforcement boundary:

1. resolve extension metadata from registry
2. build normalized fingerprint input
3. load prior record by extension id
4. classify state:
   - no prior record -> `first`
   - same fingerprint -> `same`
   - different fingerprint -> `updated`
5. persist the new record
6. return `{ state, fingerprint, warning? }`

## Write safety

The implementation only needs minimal write safety for this slice. Adequate protections are:

- serialize writes within the touch helper
- write full-store snapshots rather than partial mutating fragments
- reject malformed in-memory store shapes before write
- avoid parallel ownership by multiple modules

If stronger cross-process guarantees are later required, that should be handled in a separate scope rather than silently widening this milestone.

---

## Compatibility Boundaries

1. **Current planner behavior must remain intact.**
   - `chooseMcps()` should continue to score/select by lane, role, capability, and intent semantics already in place.
   - Runtime state is not a selection rule in this milestone.

2. **Current executor selection outputs should stay backward-compatible.**
   - If `enforceMcpRouting()` currently returns `string[]`, that adapter should remain unless a structured variant already exists for additive fields.
   - Runtime-state information should be attached in a non-breaking way, such as warnings, audit payload, or a parallel detailed result.

3. **The registry must not become a persistence manager.**
   - It remains the source of declared metadata only.

4. **The state store schema must be explicitly versionable.**
   - Start with `version: "v1"` so later evolution does not require guessing.

5. **Failure behavior must preserve current execution semantics.**
   - Persistence failure may reduce observability, but it must not transform an otherwise eligible extension into a blocked one in this scope.

---

## Out-of-Scope Guardrails

The implementation must explicitly reject the following expansions in review:

- upstream plugin-platform parity
- broad metadata APIs or metadata query surfaces
- theme/source/package-manager-specific metadata enrichment
- dynamic discovery, installation, publishing, or marketplace behavior
- database adoption purely for architectural symmetry if the bounded JSON store satisfies the scope
- making runtime-state classification a new broad policy engine

Review shorthand:

> This package is for **minimal runtime state / fingerprint persistence only**, not plugin platform parity and not full metadata subsystem work.

---

## Phased Implementation Plan

### Phase 0: Freeze fingerprint inputs and persistence seam

- **Goal:** lock the task to the smallest valid runtime-state slice before code changes.
- **Primary surfaces:**
  - `docs/scope/2026-04-12-minimal-extension-runtime-state-dh.md`
  - `docs/solution/2026-04-12-minimal-extension-runtime-state-dh.md`
  - `packages/opencode-sdk/src/types/extension-contract.ts`
  - `packages/opencode-app/src/registry/mcp-registry.ts`
- **Work:**
  - confirm the allowed fingerprint inputs from current registry/contract fields
  - freeze the persisted record shape and version marker
  - choose the runtime-owned store module/path
- **Dependencies:** none
- **Validation hook:** document review against AC-1 through AC-5 and AC-10

### Phase 1: Implement fingerprint derivation and runtime store

- **Goal:** build the minimal storage and comparison primitives.
- **Primary surfaces:**
  - `packages/runtime/src/extensions/extension-fingerprint.ts`
  - `packages/runtime/src/extensions/extension-runtime-state-store.ts`
  - related tests
- **Work:**
  - normalize `ExtensionSpec` inputs into a deterministic fingerprint payload
  - implement JSON store read/write helpers with schema version guard
  - handle missing, malformed, and empty store cases explicitly
- **Dependencies:** Phase 0
- **Validation:**
  - targeted Vitest coverage for normalization and store behavior
  - `npm run check`

### Phase 2: Implement touch/classification orchestration

- **Goal:** provide one compare-and-persist API returning `first`, `same`, or `updated`.
- **Primary surfaces:**
  - `packages/runtime/src/extensions/touch-extension-state.ts`
  - related tests
- **Work:**
  - classify from prior vs current fingerprint
  - persist updated record after classification
  - return bounded warnings for read/write failures instead of throwing through the core path
- **Dependencies:** Phase 1
- **Validation:**
  - tests for `first`
  - tests for `same`
  - tests for `updated`
  - tests for per-extension isolation
  - `npm run check`

### Phase 3: Wire the runtime-state touch into executor enforcement

- **Goal:** consume runtime-state at one stable execution boundary without changing planner semantics.
- **Primary surfaces:**
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/planner/mcp-routing-types.ts` if additive fields are needed
  - `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts`
- **Work:**
  - invoke touch after contract/registry eligibility is already known
  - attach result to warnings, audit-friendly output, or detailed decision payload only
  - preserve current adapter behavior for existing callers
- **Dependencies:** Phase 2
- **Validation:**
  - executor regression tests remain green
  - no planner-selection tests need semantic rewrites for runtime state
  - `npm run test`

### Phase 4: Documentation and evidence closure

- **Goal:** close the deferred gap with explicit proof and no scope creep.
- **Primary surfaces:**
  - `docs/opencode/` follow-on evidence/checklist documents
  - this solution package if implementation reality requires small factual updates
- **Work:**
  - record the chosen store location and schema version
  - document the exact fingerprint inputs used
  - confirm that no plugin-platform parity or full metadata subsystem work was added
- **Dependencies:** Phase 3
- **Validation:**
  - evidence references for `first/same/updated`
  - evidence reference for multi-extension isolation

---

## Validation Strategy

## Required command-level validation

- `npm run check`
- `npm run test`

## Required behavior coverage

1. **No prior record -> `first`**
2. **Unchanged fingerprint -> `same`**
3. **Changed fingerprint -> `updated`**
4. **Multiple extension ids remain isolated**
5. **Malformed or unreadable persisted state yields bounded warning/fallback behavior**
6. **Write failure does not block otherwise valid extension execution**

## Recommended test layering

- unit tests for fingerprint normalization
- unit tests for store read/write/version handling
- unit tests for touch/classification behavior
- executor-level regression test proving additive wiring does not break current MCP routing behavior

---

## Technical Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Fingerprint drift from unstable inputs | Would create false `updated` states and reduce trust | Restrict inputs to stable declared `ExtensionSpec` fields and normalize arrays before comparison |
| Store corruption or malformed JSON | Could make state unreliable across runs | Version the schema, validate before use, and degrade with warning rather than break execution |
| Runtime-state wiring alters planner/executor semantics | Would widen the behavior delta beyond scope | Touch state only after existing eligibility decisions and keep it observational |
| JSON store concurrency edge cases | Could overwrite records under repeated runs | Centralize read/compare/write in one helper and serialize writes within that boundary |
| Scope creep into a metadata platform | Would turn a small follow-on into subsystem work | Hold code review against the explicit out-of-scope list and the minimal record shape |

---

## Handoff Notes

### What Fullstack/implementation must preserve

- `ExtensionRuntimeState` remains exactly `first | updated | same`
- fingerprint inputs stay limited to stable declared metadata
- runtime-state stays additive and observational
- persistence failures remain bounded and non-fatal
- the store schema starts versioned
- no plugin-platform parity or metadata-subsystem expansion is introduced

### What Code Review must preserve

- no transient runtime fields in the fingerprint
- no planner scoring changes tied to runtime state
- no registry mutation/persistence ownership creep
- adapter compatibility for existing executor/workflow callers remains intact

### What QA must preserve

- verify `first/same/updated` behavior across runs, not just in-memory
- verify isolation across multiple extension ids
- verify malformed/missing store behavior is explicit and bounded
- verify runtime-state evidence exists without claiming broader metadata support

---

## Pass Condition For This Solution Package

This solution is approval-ready if implementation can proceed without guessing:

- where the fingerprint comes from
- where the state is stored
- how `first/same/updated` is classified
- where runtime-state is consumed
- how failures degrade safely
- what is explicitly out of scope

That standard is met by the recommended path above.
