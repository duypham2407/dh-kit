# Solution Package: Minimal Plugin / Extension Contract Hardening (DH)

**Date:** 2026-04-12  
**Approved scope:** `docs/scope/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`  
**Analysis input:** `docs/opencode/minimal-plugin-extension-contract-hardening-analysis-dh.md`

---

## Recommended Path

Harden DH's existing internal extension-like seams in place by introducing one minimal shared extension contract across SDK types, registry metadata, planner decisions, and executor enforcement, while preserving current workflow/runtime architecture and rollout compatibility.

This is enough because DH already has the right policy surfaces for deterministic hardening:

- `packages/opencode-sdk/src/types/` for shared contract vocabulary
- `packages/opencode-app/src/registry/` for policy metadata
- `packages/opencode-app/src/planner/` for explainable candidate selection
- `packages/opencode-app/src/executor/` for final guardrail enforcement
- `packages/opencode-app/src/workflows/` for downstream consumption of normalized decisions

**Explicit boundary:** this is **minimal deterministic extension contract hardening only**, not plugin platform parity. It must not expand into dynamic plugin loading, external packaging/distribution, marketplace behavior, or upstream plugin subsystem cloning.

---

## Repository Reality Constraints

1. **DH does not currently have a dedicated extension contract subsystem.**
   - Current behavior is distributed across registry, planner, executor, hook, and workflow seams.
   - Existing concrete precedent is MCP routing rather than a generalized plugin loader.

2. **Shared contract types already live in the SDK package.**
   - `packages/opencode-sdk/src/types/hook-decision.ts` already defines shared decision payloads such as `HookDecision`, `McpRoutingPayload`, and hook names.
   - This makes `opencode-sdk` the correct boundary for new minimal extension vocabulary.

3. **Planner and executor already separate selection from enforcement.**
   - `packages/opencode-app/src/planner/choose-mcps.ts` scores and selects candidates.
   - `packages/opencode-app/src/executor/enforce-mcp-routing.ts` applies runtime blocking/fallback.
   - The extension contract should reuse that split instead of inventing a new runtime layer.

4. **Registry metadata is policy-oriented, not lifecycle-oriented.**
   - `packages/opencode-app/src/registry/mcp-registry.ts` already models lanes, roles, trigger tags, capabilities, priority, and fallback hints.
   - The extension hardening slice should keep metadata declarative and bounded.

5. **Repo-native validation exists for TypeScript.**
   - Available commands: `npm run check`, `npm run test`.
   - The solution should rely on those commands and targeted Vitest coverage rather than inventing new tooling.

---

## Architecture Decisions

### AD-1: One shared extension contract vocabulary lives at the SDK boundary

Define the minimal extension contract in `packages/opencode-sdk/src/types/` so registry, planner, executor, and workflow layers do not invent their own shapes.

Minimum vocabulary should cover:

- extension identity
- contract version
- entry reference
- declared capabilities
- allow / block / modify decision model
- stable reason codes
- optional bounded runtime state for change awareness

This keeps app-layer policy and bridge/runtime consumers aligned on one contract language.

### AD-2: Registry remains declarative policy metadata, not a loader/runtime manager

The registry should expose extension metadata needed for deterministic planning and enforcement only. It should not become a dynamic install/resolve/lifecycle subsystem.

Recommended metadata responsibilities:

- extension id and entry reference
- supported lanes and roles
- declared capabilities
- deterministic priority/order metadata
- optional minimal compatibility metadata
- optional bounded fingerprint/change fields only if Phase 4 is justified

Not allowed in this slice:

- package source resolution
- file/npm install handling
- plugin discovery/orchestration parity
- external trust/distribution concerns

### AD-3: Planner explains candidacy; executor makes final enforceable decisions

Follow DH's current architecture pattern:

- **planner** identifies eligible candidates and rejected candidates with stable reason codes
- **executor** validates version/capability/compatibility preconditions, applies deterministic ordering, and produces the final allow/block/modify-style result

This keeps explainability upstream of runtime enforcement without burying hard guardrails inside workflow files.

### AD-4: Workflow surfaces consume normalized decisions, not extension-specific local logic

Workflow modules such as:

- `packages/opencode-app/src/workflows/quick.ts`
- `packages/opencode-app/src/workflows/delivery.ts`
- `packages/opencode-app/src/workflows/migration.ts`

should continue to depend on already-computed planner/executor outputs. The hardening slice should reduce workflow-local branching, not spread extension-specific checks deeper into orchestration.

### AD-5: Deterministic ordering is a contract rule, not an incidental implementation detail

When multiple extensions apply, final order must be stable and inspectable. Recommended rule:

1. compatibility and policy eligibility first
2. descending explicit priority
3. stable tiebreaker by extension id

That rule is small enough for DH's current architecture and avoids runtime-order drift.

### AD-6: Change awareness is optional and bounded

Fingerprint/change-state support is allowed only as a minimal extension-state hardening aid. It must stay optional until core contract alignment is complete.

If included, it should support only:

- detect first load vs same vs updated
- expose deterministic change reporting for review/verification

It should not introduce a full plugin metadata persistence subsystem in this task.

---

## Proposed Contract Shape

The exact names can be finalized during implementation, but the solution should converge on a shared minimal shape close to:

```ts
type ExtensionContractVersion = "v1";

type ExtensionDecisionKind = "allow" | "block" | "modify";

type ExtensionReasonCode =
  | "entry_missing"
  | "contract_version_mismatch"
  | "capability_denied"
  | "lane_mismatch"
  | "role_mismatch"
  | "compat_check_failed"
  | "deprioritized"
  | "blocked_by_precondition"
  | "fingerprint_first_seen"
  | "fingerprint_changed";

type ExtensionSpec = {
  id: string;
  contractVersion: ExtensionContractVersion;
  entry: string;
  capabilities: string[];
  priority?: number;
  lanes?: string[];
  roles?: string[];
};

type ExtensionDecision = {
  extensionId: string;
  decision: ExtensionDecisionKind;
  reasonCodes: ExtensionReasonCode[];
  warnings?: string[];
};

type ExtensionRuntimeState = "first" | "updated" | "same";
```

Compatibility note: rollout may keep narrow adapters where current callers still expect list-based outputs, similar to how `chooseMcps()` and `enforceMcpRouting()` preserve `string[]` adapters today.

---

## Impacted Surfaces

### Core files likely to change

| File | Why it is in scope |
|---|---|
| `packages/opencode-sdk/src/types/hook-decision.ts` | Existing shared decision payload surface; likely place to add extension decision payload vocabulary or shared reason-code compatibility |
| `packages/opencode-sdk/src/index.ts` | Re-export new minimal extension contract types |
| `packages/opencode-sdk/src/types/` (new file, e.g. `extension-contract.ts`) | Best place for dedicated extension contract/version/spec/decision types |
| `packages/opencode-app/src/registry/mcp-registry.ts` | Existing registry precedent for lanes/roles/capabilities/priority metadata that the new contract should align with |
| `packages/opencode-app/src/planner/mcp-routing-types.ts` | Existing reason-coded routing type precedent; likely reference point or extraction candidate for more general extension reason vocabulary |
| `packages/opencode-app/src/planner/choose-mcps.ts` | Concrete planner pattern for candidate selection and rejected-reason outputs |
| `packages/opencode-app/src/executor/enforce-mcp-routing.ts` | Concrete executor pattern for guardrails, block/fallback, and final deterministic selection |
| `packages/opencode-app/src/registry/mcp-routing-policy.ts` | Existing scoring/policy helpers; likely place to mirror extension compatibility/order helper logic or extract shared patterns |
| `packages/opencode-app/src/executor/hook-enforcer.ts` | Bridge point where normalized decisions may need to be persisted or surfaced consistently |
| `packages/opencode-app/src/planner/build-execution-envelope.ts` | Existing place where selected skills/MCPs enter envelope state; may need bounded alignment if extension outputs become standardized |
| `packages/opencode-app/src/workflows/quick.ts` | Representative workflow consumer that should remain downstream of standardized decisions |
| `packages/opencode-app/src/workflows/delivery.ts` | Same boundary check for delivery lane |
| `packages/opencode-app/src/workflows/migration.ts` | Same boundary check for migration lane |

### Test files likely to change or be added

| File | Purpose |
|---|---|
| `packages/opencode-app/src/planner/choose-mcps.test.ts` | Preserve planner explainability and compatibility adapters |
| `packages/opencode-app/src/executor/enforce-mcp-routing.test.ts` | Preserve block/fallback/enforcement semantics |
| `packages/opencode-app/src/workflows/workflows.test.ts` | Confirm workflows remain consumers of normalized results, not owners of extension-specific logic |
| `packages/opencode-app/src/workflows/run-lane-command.test.ts` | Optional regression coverage if envelope/build path changes surface extension selections |
| `packages/opencode-app/src/executor/hook-enforcer.test.ts` | Optional coverage if persisted decision payloads gain new extension fields |

### New modules recommended

| File | Responsibility |
|---|---|
| `packages/opencode-sdk/src/types/extension-contract.ts` | Canonical minimal extension contract types |
| `packages/opencode-app/src/planner/extension-contract-types.ts` or reuse SDK types | App-facing aliases/helpers only if needed; avoid duplicate source-of-truth definitions |
| `packages/opencode-app/src/registry/extension-policy.ts` | Deterministic ordering, capability, and compatibility helper logic if current MCP policy helpers become too specialized |
| `packages/opencode-app/src/planner/choose-extensions.test.ts` | Focused tests for candidate selection and reason-coded rejection if generalized selection is introduced |
| `packages/opencode-app/src/executor/enforce-extension-contract.test.ts` | Focused tests for version/capability/order enforcement if generalized executor logic is introduced |

---

## Technical Risks

| Risk | Why it matters | Mitigation |
|---|---|---|
| Scope creep into full plugin platform work | Would expand a bounded hardening task into a subsystem build | Keep every phase tied to internal contract, policy metadata, explainability, and deterministic enforcement only |
| Duplicate vocabularies across SDK/app layers | Would preserve drift rather than reduce it | Put canonical types in `opencode-sdk` and treat app-layer types as projections/adapters only |
| Planner/executor semantics diverge during rollout | Would make explainability unreliable | Land contract/types first, then planner alignment, then executor enforcement in that order |
| Workflow-local extension logic keeps spreading | Would break the intended boundary | Require workflows to consume normalized outputs rather than re-check extension-specific policy locally |
| Change-detection metadata becomes a persistence subsystem | Would add operational complexity without core value | Make fingerprint/runtime state strictly optional and phase-gated after core hardening |

---

## Phased Implementation Plan

### Phase 0: Contract freeze and boundary lock

- **Goal:** Freeze the task to minimal deterministic extension contract hardening and define the rollout seam.
- **Primary files:**
  - `docs/scope/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`
  - `docs/solution/2026-04-12-minimal-plugin-extension-contract-hardening-dh.md`
  - `packages/opencode-sdk/src/types/`
- **Work:**
  - confirm DH has no current dedicated extension contract layer
  - freeze out-of-scope boundaries against plugin-platform parity
  - choose the SDK contract file/module and naming so downstream layers share one vocabulary
- **Dependency:** none
- **Validation:** document review against scope AC-1, AC-2, AC-9, AC-10

### Phase 1: Minimal contract definition at the SDK boundary

- **Goal:** Establish the shared contract language before behavior changes.
- **Primary files:**
  - `packages/opencode-sdk/src/types/extension-contract.ts` (new)
  - `packages/opencode-sdk/src/types/hook-decision.ts`
  - `packages/opencode-sdk/src/index.ts`
- **Work:**
  - add contract version, extension spec, capability declaration, decision shape, and stable reason-code vocabulary
  - decide whether generalized extension decision payloads are added directly or projected through existing hook payload structures
  - preserve compatibility for current call sites that still consume narrower payloads
- **Dependency:** Phase 0
- **Validation:**
  - `npm run check`
  - `npm run test`

### Phase 2: Registry and planner alignment

- **Goal:** Make selection explainable through the shared contract vocabulary.
- **Primary files:**
  - `packages/opencode-app/src/registry/mcp-registry.ts`
  - `packages/opencode-app/src/registry/mcp-routing-policy.ts`
  - `packages/opencode-app/src/planner/mcp-routing-types.ts`
  - `packages/opencode-app/src/planner/choose-mcps.ts`
  - planner tests in `packages/opencode-app/src/planner/`
- **Work:**
  - align registry metadata with extension contract terminology where appropriate
  - ensure planner outputs stable selected/rejected reason coding
  - codify deterministic ordering inputs rather than relying on incidental array order
  - keep adapter outputs where existing callers still expect narrowed results
- **Dependency:** Phase 1
- **Validation:**
  - `npm run check`
  - `npm run test`
  - reviewer focus: no separate planner-only vocabulary drift from SDK contract

### Phase 3: Executor hardening and final decision normalization

- **Goal:** Turn the shared contract into enforceable runtime behavior.
- **Primary files:**
  - `packages/opencode-app/src/executor/enforce-mcp-routing.ts`
  - `packages/opencode-app/src/executor/hook-enforcer.ts`
  - executor tests in `packages/opencode-app/src/executor/`
- **Work:**
  - validate contract version and entry presence before activation/use
  - enforce lane/role/capability guardrails using stable reason codes
  - apply deterministic final ordering
  - normalize final allow/block/modify-style decisions for downstream workflow/runtime consumption
- **Dependency:** Phase 2
- **Validation:**
  - `npm run check`
  - `npm run test`
  - targeted assertions for `entry_missing`, `contract_version_mismatch`, and `capability_denied` paths

### Phase 4: Workflow consumption cleanup

- **Goal:** Keep orchestration downstream of normalized extension decisions.
- **Primary files:**
  - `packages/opencode-app/src/workflows/quick.ts`
  - `packages/opencode-app/src/workflows/delivery.ts`
  - `packages/opencode-app/src/workflows/migration.ts`
  - `packages/opencode-app/src/workflows/workflows.test.ts`
- **Work:**
  - confirm workflows consume planner/executor outputs rather than re-implementing extension rules locally
  - tighten any workflow-local branching that bypasses the shared decision model
  - preserve existing lane semantics and workflow boundaries
- **Dependency:** Phase 3
- **Validation:**
  - `npm run check`
  - `npm run test`
  - reviewer focus: no new workflow-owned extension policy logic

### Phase 5: Optional bounded metadata state

- **Goal:** Add minimal change awareness only if implementation evidence shows real value.
- **Primary files:**
  - SDK extension contract types
  - app-layer registry/executor helper modules
  - targeted tests only if state is introduced
- **Work:**
  - add optional fingerprint-based runtime state (`first|updated|same`) only if needed for deterministic verification/reporting
  - keep persistence and concurrency concerns bounded and minimal
- **Dependency:** Phase 3 minimum; Phase 4 preferred
- **Validation:**
  - `npm run check`
  - `npm run test`
  - only proceed if the metadata is demonstrably used by verification or audit output

---

## Dependency Graph

- **Sequential only:** Phase 1 -> Phase 2 -> Phase 3
- **Sequential preferred:** Phase 4 after Phase 3, because workflow cleanup depends on normalized executor outputs
- **Conditional:** Phase 5 only after core contract hardening is already complete and review agrees it is justified

**Critical path:** SDK contract definition -> registry/planner alignment -> executor enforcement -> workflow boundary cleanup.

Parallel execution is **not** recommended for the core slices because the central risk is cross-layer vocabulary drift.

---

## Validation Strategy

### Command-level validation

- `npm run check`
  - validates type compatibility across SDK and app-layer contract updates
- `npm run test`
  - validates planner/executor/workflow regression coverage through Vitest

### Slice-to-validation matrix

| Target | Validation path |
|---|---|
| Shared minimal contract exists | Type exports compile and tests cover contract consumers |
| Stable reason-coded decisions exist | Planner/executor tests assert explicit reason codes for allowed/rejected/blocked cases |
| Deterministic ordering exists | Tests assert stable ordering independent of incidental input order |
| Capability/version guardrails are enforced | Executor tests cover denied/version-mismatch/missing-entry paths |
| Workflow consumption stays downstream | Workflow tests confirm normalized outputs are consumed without new local policy forks |
| Metadata hardening stays bounded | Review + targeted tests verify fingerprint/change-state is optional and minimal if added |

### Required test scenarios

At minimum, implementation should add or confirm coverage for:

- supported contract version -> allowed path
- unsupported contract version -> blocked with stable reason code
- missing entry reference -> blocked with stable reason code
- capability denied for lane/role -> blocked with stable reason code
- multiple eligible extensions -> stable deterministic order
- planner rejection reasons remain inspectable
- workflow paths continue to consume normalized decisions
- optional fingerprint state, if implemented -> first/same/updated behavior

---

## Compatibility Rules

1. **Preserve DH's current architecture.**
   - Do not replace registry/planner/executor/workflow separation with a new plugin subsystem.

2. **Preserve narrow adapters during rollout where required.**
   - Existing list-based or hook-specific payload consumers may remain temporarily as projections of the richer contract.

3. **Keep workflow lane behavior unchanged.**
   - `quick`, `delivery`, and `migration` semantics are not part of this task.

4. **Keep bridge/runtime payload evolution additive where possible.**
   - If hook payloads are expanded, existing consumers should continue to work with narrowed fields during migration.

5. **Do not assume a loader exists today.**
   - All decisions and file targets must stay grounded in current DH surfaces.

---

## Out of Scope Boundaries

The following are explicitly out of scope for this solution package:

- full plugin loading platform parity
- dynamic plugin discovery or installation
- npm/file source resolution machinery
- external plugin packaging, publishing, marketplace, or ecosystem support
- theme/asset/UI plugin lifecycle management
- third-party trust/isolation/security architecture beyond current deterministic guardrails
- broad retry/orchestration machinery copied from upstream plugin runtime
- replacing DH's current planner/executor/registry/workflow structure

Again: **this is minimal deterministic extension contract hardening only, not plugin platform parity.**

---

## Review and QA Focus

### FullstackAgent must preserve

- one canonical extension vocabulary anchored in `opencode-sdk`
- deterministic ordering and stable reason-coded decisions
- existing DH architecture boundaries between registry, planner, executor, and workflows
- bounded rollout compatibility for existing narrow consumers

### Code Reviewer must verify

- no duplicated contract definitions across SDK/app surfaces
- no scope creep into loader/platform/distribution work
- workflows do not gain new extension-specific policy branches
- optional metadata state remains truly optional and minimal

### QA Agent must verify

- allowed and blocked paths emit stable, inspectable results
- deterministic ordering is reproducible
- compatibility adapters still serve current callers during rollout
- no regression in lane/workflow execution caused by extension contract hardening

---

## Pass Condition for This Solution Package

This solution is execution-ready if implementation can proceed without guessing:

- where the canonical contract lives
- which current modules own policy vs enforcement
- which files are likely affected
- what order the slices must land in
- how to verify deterministic behavior without broadening into plugin parity
